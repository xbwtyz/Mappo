import test from 'node:test';
import assert from 'node:assert/strict';
import { createAresCandidateRetention } from '../src/core/ares-candidate-retention.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
const fingerprint='a'.repeat(64);
const context=()=>({version:1,sessionId:'p3-c1',sourceVersion:'0.2.25-dev',operation:{
  version:1,family:'road',operation:'translate-road-group',projectId:'city-A',revision:7,
  editedRefs:[{collection:'roads',id:'R1'},{collection:'roads',id:'R2'}],geometry:{offset:{x:0,y:75}},permissions:{}}});
const budget=()=>createSpatialPreservationBudget();
const profile=(criteria=[{metric:'loss',direction:'min'},{metric:'space',direction:'max'}])=>({id:'test-profile',version:1,criteria});
const proposal=(id,loss=0,space=0)=>({version:1,context:context(),snapshotFingerprint:fingerprint,proposal:{id,loss,space}});
const verify=async(p,b,budget)=>{
  budget.spend();
  const {context,snapshotFingerprint}=b;
  if(p.id==='invalid')return {status:'refused',context,snapshotFingerprint,reason:'domain-violation'};
  return {status:'verified',context,snapshotFingerprint,candidate:{id:p.id,loss:p.loss,space:p.space},
    metrics:{loss:p.loss,space:p.space}};
};
const make=(v=verify,p=profile(),n=3,b=budget())=>createAresCandidateRetention(context(),fingerprint,p,n,v,b);
test('P3 verified-only retention keeps the best candidate and bounded alternatives',async()=>{
  const r=make();
  assert.equal((await r.consider(proposal('first',5,3))).improved,true);
  assert.equal((await r.consider(proposal('invalid'))).status,'refused');
  assert.equal(r.snapshot().incumbent.candidate.id,'first');
  await r.consider(proposal('better',1,2));await r.consider(proposal('second',1,3));
  assert.equal((await r.consider(proposal('worst',99,0))).status,'not-retained');
  assert.equal(r.snapshot().incumbent.candidate.id,'second');
  assert.deepEqual(r.snapshot().alternatives.map(r=>r.candidate.id),['better','first']);
  assert.ok(Object.isFrozen(r.snapshot().incumbent.candidate));
  assert.equal(Object.hasOwn(r.snapshot(),'applyReady'),false);
});
test('P3 lexicographic research profiles are explicit and deterministic with fingerprint tie breaks',async()=>{
  const items=[proposal('a',1,2),proposal('b',1,2),proposal('c',1,3),proposal('d',2,10)];
  const x=make(),y=make();
  for(const p of items)await x.consider(p);
  for(const p of items.slice().reverse())await y.consider(p);
  assert.deepEqual(x.snapshot(),y.snapshot());
  assert.equal(x.snapshot().incumbent.candidate.id,'c');
  const ranked=make(verify,profile([{metric:'space',direction:'max'},{metric:'loss',direction:'min'}]));
  for(const p of items)await ranked.consider(p);
  assert.equal(ranked.snapshot().incumbent.candidate.id,'d');
});
test('P3 duplicate candidate content cannot occupy two slots or carry inconsistent measurements',async()=>{
  let count=0;
  const r=make(async(p,b,s)=>{const o=await verify(p,b,s);o.metrics.loss=++count;return o;});
  await r.consider(proposal('same'));
  await assert.rejects(()=>r.consider(proposal('same')),/Inconsistent/);
  assert.equal(r.snapshot().incumbent.metrics.loss,1);
  const normal=make();
  await normal.consider(proposal('same'));
  assert.equal((await normal.consider(proposal('same'))).status,'duplicate');
  assert.deepEqual(normal.snapshot().alternatives,[]);
});
test('P3 stale input, forged authority and malformed verifier output do not replace incumbent',async()=>{
  const r=make(async(p,b,s)=>{
    const o=await verify(p,b,s);
    if(p.id==='stale')o.context={...o.context,sessionId:'other'};
    if(p.id==='forged')o.applyReady=true;
    if(p.id==='missing')delete o.metrics.space;
    if(p.id==='bad-metric')o.metrics.loss=-1;
    return o;
  });
  await r.consider(proposal('good',5,1));const before=r.snapshot();
  for(const id of ['stale','forged','missing','bad-metric'])await assert.rejects(()=>r.consider(proposal(id)));
  await assert.rejects(()=>r.consider({...proposal('bad'),snapshotFingerprint:'b'.repeat(64)}),/Stale/);
  await assert.rejects(()=>r.consider({...proposal('bad'),metrics:{loss:0,space:999}}));
  assert.deepEqual(r.snapshot(),before);
});
test('P3 snapshots and proposals detach before awaits; overlapping verification is refused',async()=>{
  let resume;
  const gate=new Promise(r=>{resume=r;});
  const r=make(async(p,b,s)=>{await gate;return verify(p,b,s);});
  const input=proposal('safe',1,2),pending=r.consider(input);
  input.proposal.id='mutated';
  await assert.rejects(()=>r.consider(proposal('overlap')),/active/);
  resume();await pending;
  assert.equal(r.snapshot().incumbent.candidate.id,'safe');
});
test('P3 verification failure or exhausted shared budget never replaces a verified incumbent',async()=>{
  const b=budget(),r=make(async(p,ctx,s)=>{
    if(p.id==='throws')throw Error('Verifier failed');
    if(p.id==='exhaust')s.spend(s.snapshot().remainingWork);
    return verify(p,ctx,s);
  },profile(),3,b);
  await r.consider(proposal('good',9,1));const before=r.snapshot();
  await assert.rejects(()=>r.consider(proposal('throws')),/Verifier failed/);
  await assert.rejects(()=>r.consider(proposal('exhaust')),/budget/);
  assert.deepEqual(r.snapshot(),before);
});
test('P3 explicit profile and retention capacity reject invalid policy and missing verifier',()=>{
  for(const p of [profile([]),profile([{metric:'loss',direction:'min'},{metric:'loss',direction:'max'}]),
    profile([{metric:'loss',direction:'invented'}]),{...profile(),weights:[1,2]}])
    assert.throws(()=>make(verify,p));
  for(const n of [0,4,1.5,undefined]){
    if(n===undefined)assert.throws(()=>createAresCandidateRetention(context(),fingerprint,profile(),n,verify,budget()));
    else assert.throws(()=>make(verify,profile(),n));
  }
  assert.throws(()=>make(null),/verifier/);
});
