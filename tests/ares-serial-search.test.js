import test from 'node:test';
import assert from 'node:assert/strict';
import { runAresSerialSearch } from '../src/core/ares-serial-search.js';
import { createAresDiagnostic } from '../src/core/ares-diagnostic-contract.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
const ctx=()=>({version:1,sessionId:'p3-d1',sourceVersion:'0.2.25-dev',operation:{
  version:1,family:'road',operation:'translate-road-group',projectId:'city-A',revision:7,
  editedRefs:[{collection:'roads',id:'R1'},{collection:'roads',id:'R2'}],geometry:{offset:{x:0,y:75}},permissions:{}}});
const fp='a'.repeat(64);
const root=(work=50000)=>createSpatialPreservationBudget({work,stateExpansions:100});
const issue=(context,reason='domain-violation')=>createAresDiagnostic(context,{reason,code:'test-obstruction',
  stage:'research',message:'Synthetic advisory feedback.',refs:[{collection:'properties',id:'P1'}],
  source:{id:'test-strategy',version:'1'}});
const result=(t,proposal,diagnostics=[])=>({version:1,taskId:t.taskId,context:t.context,
  snapshotFingerprint:t.snapshotFingerprint,status:proposal===null?'refused':'proposed',proposal,diagnostics});
const strategy=(id,execute,patch={})=>({descriptor:{id,version:1,requiredCapabilities:[],requiredPermissions:[],blockerReasons:[],...patch},execute});
const task=(taskId,strategyId=taskId,work=3000)=>({taskId,strategyId,limits:{work,stateExpansions:10}});
const produce=(id,loss)=>strategy(id,(t,d,b)=>{b.expand();return result(t,{id,loss});});
const verify=async(p,b,s)=>{s.spend();return {status:'verified',context:b.context,snapshotFingerprint:b.snapshotFingerprint,
  candidate:{id:p.id},metrics:{loss:p.loss}};};
const options=(strategies,tasks,patch={})=>({context:ctx(),snapshotFingerprint:fp,capabilities:[],diagnostics:[],strategies,tasks,
  profile:{id:'test',version:1,criteria:[{metric:'loss',direction:'min'}]},capacity:3,verify,
  policy:{verificationReserveWork:200,verificationReserveExpansions:1,maxStagnantTasks:5},checkpoint:null,...patch});
test('P3 serial feedback makes deferred strategy relevant without escalating permissions',async()=>{
  const strategies=[strategy('feedback',(t,d,b)=>{b.spend();return result(t,null,[issue(t.context)]);}),
    strategy('repair',(t,d,b)=>{assert.ok(d.some(x=>x.reason==='domain-violation'));b.expand();return result(t,{id:'repair',loss:2});},
      {blockerReasons:['domain-violation']}),
    strategy('demolish',()=>{throw Error('must not run');},{requiredPermissions:['destruction']}),
    strategy('vertical',()=>{throw Error('must not run');},{requiredCapabilities:['elevation']})];
  const o=options(strategies,[task('repair'),task('demolish'),task('vertical'),task('feedback')]);
  const r=await runAresSerialSearch(o,root());
  assert.equal(r.reason,'no-eligible-task');
  assert.deepEqual(r.events.map(e=>e.taskId),['feedback','repair']);
  assert.equal(r.retention.incumbent.candidate.id,'repair');
  assert.deepEqual(r.pending.map(t=>t.taskId),['demolish','vertical']);
  assert.equal(r.context.operation.permissions.destruction,false);
  assert.deepEqual(r,await runAresSerialSearch({...o,strategies:strategies.slice().reverse()},root()));
});
test('P3 later serial slices use remaining root without double spending or reducing verification reserve',async()=>{
  const o=options([produce('a',5),produce('b',1)],[task('a','a',4000),task('b','b',49000)]);
  const b=root(),r=await runAresSerialSearch(o,b);
  assert.equal(r.reason,'plan-complete');assert.equal(r.retention.incumbent.candidate.id,'b');
  assert.equal(r.ledger.settled.length,2);
  const [a,z]=r.ledger.settled;
  assert.ok(a.usage.remainingWork>0);assert.ok(z.task.limits.work>40000);
  assert.ok(z.task.limits.work<=49000);
  assert.ok(z.root.remainingWork>=200);
  assert.deepEqual(r.ledger.root,b.snapshot());
  assert.equal(b.snapshot().work+b.snapshot().remainingWork,50000);
  assert.equal(b.snapshot().expansions,2);
});
test('P3 stagnation stops at a logical boundary and preserves best incumbent on ties',async()=>{
  const o=options([produce('a',1),produce('b',1),produce('c',2),produce('d',0)],
    ['a','b','c','d'].map(id=>task(id)),{policy:{verificationReserveWork:200,verificationReserveExpansions:1,maxStagnantTasks:2}});
  const r=await runAresSerialSearch(o,root());
  assert.equal(r.reason,'stagnation-limit');assert.equal(r.retention.incumbent.metrics.loss,1);
  assert.equal(r.stagnant,2);assert.deepEqual(r.events.map(e=>e.improved),[true,false,false]);
  assert.deepEqual(r.pending.map(t=>t.taskId),['d']);
});
test('P3 checkpoint pause and stop preserve one budget and verified incumbent',async()=>{
  const b=root();let paused;
  const o=options([produce('a',2),produce('b',1)],[task('a'),task('b')],{checkpoint:async state=>{
    assert.ok(Object.isFrozen(state));assert.equal(state.ledger.active,null);
    if(!state.events.length){const before=b.snapshot();await Promise.resolve();assert.deepEqual(b.snapshot(),before);return 'continue';}
    paused=state;return 'stop';
  }});
  const r=await runAresSerialSearch(o,b);
  assert.equal(r.reason,'stopped');assert.equal(r.retention.incumbent.candidate.id,'a');
  assert.deepEqual(r.ledger.root,paused.ledger.root);assert.deepEqual(r.pending.map(t=>t.taskId),['b']);
});
test('P3 slice exhaustion retains actual charge and permits another bounded task',async()=>{
  const exhaust=strategy('a',(t,d,b)=>{b.spend(t.limits.work);b.spend();});
  const r=await runAresSerialSearch(options([exhaust,produce('b',1)],[task('a','a',50),task('b')]),root());
  assert.equal(r.reason,'plan-complete');assert.equal(r.events[0].status,'slice-exhausted');
  assert.equal(r.ledger.settled[0].usage.work,50);assert.equal(r.ledger.settled[0].status,'failed');
  assert.equal(r.retention.incumbent.candidate.id,'b');
});
test('P3 malformed stale strategy output and verifier failures stop without replacing incumbent',async()=>{
  const a=produce('a',5),bad=strategy('bad',(t,d,b)=>{b.spend();return {...result(t,{id:'bad',loss:0}),taskId:'stale'};});
  const x=await runAresSerialSearch(options([a,bad],[task('a'),task('bad')]),root());
  assert.equal(x.reason,'failed');assert.equal(x.failure,'strategy-result');assert.equal(x.retention.incumbent.candidate.id,'a');
  const y=await runAresSerialSearch(options([a,produce('b',0)],[task('a'),task('b')],{
    verify:async(p,b,s)=>{if(p.id==='b')throw Error('bad witness');return verify(p,b,s);}
  }),root());
  assert.equal(y.reason,'failed');assert.equal(y.failure,'verification-result');assert.equal(y.retention.incumbent.candidate.id,'a');
});
test('P3 exhausted verification and insufficient dispatch reserve do not publish unverified candidates',async()=>{
  const o=options([produce('a',5),produce('b',0)],[task('a'),task('b')],{
    verify:async(p,b,s)=>{if(p.id==='b')s.spend(s.snapshot().remainingWork);return verify(p,b,s);}
  });
  const r=await runAresSerialSearch(o,root());
  assert.equal(r.reason,'work-limit');assert.equal(r.retention.incumbent.candidate.id,'a');
  const limited=await runAresSerialSearch(options([produce('a',1)],[task('a')],{
    policy:{verificationReserveWork:50000,verificationReserveExpansions:1,maxStagnantTasks:5}
  }),root());
  assert.equal(limited.reason,'work-limit');assert.equal(limited.ledger.settled.length,0);assert.equal(limited.retention.incumbent,null);
});
test('P3 invalid logical plans and injected policy fail before dispatch',async()=>{
  const s=[produce('a',1)];
  for(const tasks of [[task('x','missing')],[task('a'),task('a')],[{...task('a'),write:true}]])
    await assert.rejects(()=>runAresSerialSearch(options(s,tasks),root()));
  await assert.rejects(()=>runAresSerialSearch(options(s,[task('a')],{policy:{verificationReserveWork:0,
    verificationReserveExpansions:1,maxStagnantTasks:5}}),root()));
});
