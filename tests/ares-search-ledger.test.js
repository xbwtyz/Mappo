import test from 'node:test';
import assert from 'node:assert/strict';
import { createAresSearchLedger } from '../src/core/ares-search-ledger.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { createLareBudget } from '../src/core/reconciliation-budget.js';
const fingerprint='a'.repeat(64);
const context=()=>({version:1,sessionId:'p3-b',sourceVersion:'0.2.25-dev',operation:{
  version:1,family:'road',operation:'translate-road-group',projectId:'city-A',revision:7,
  editedRefs:[{collection:'roads',id:'R2'},{collection:'roads',id:'R1'}],geometry:{offset:{x:0,y:75}},permissions:{}}});
const root=(work=40,stateExpansions=8)=>createSpatialPreservationBudget({work,stateExpansions});
const task=(id='task-1',work=10,stateExpansions=3)=>({version:1,taskId:id,strategyId:'baseline',strategyVersion:1,
  context:context(),snapshotFingerprint:fingerprint,limits:{work,stateExpansions}});
const result=(handle,status='completed')=>({version:1,taskId:handle.task.taskId,context:context(),snapshotFingerprint:fingerprint,status});
const setup=(b=root())=>({b,l:createAresSearchLedger(context(),fingerprint,b)});
test('P3 serial slices charge exact root work and expansions; unused work is retained',()=>{
  const {b,l}=setup(),a=l.open(task());
  assert.equal(b.snapshot().work,2);a.budget.spend(4);a.budget.expand();
  const row=l.settle(a,result(a));
  assert.deepEqual(row.usage,{work:5,expansions:1,remainingWork:5,remainingExpansions:2});
  assert.equal(b.snapshot().work,7);assert.equal(b.snapshot().expansions,1);
  const next=l.open(task('task-2',31,7));
  next.budget.spend(30);next.budget.expand();
  const end=l.settle(next,result(next,'refused'));
  assert.equal(end.root.remainingWork,0);assert.equal(end.root.expansions,2);
  assert.equal(end.task.sequence,1);assert.ok(Object.isFrozen(end.task.context));
  assert.throws(()=>l.open(task('third',1,1)),/budget/);
});
test('P3 work and expansion caps are enforced independently without partial charges',()=>{
  const {b,l}=setup(),a=l.open(task('task-1',4,1));
  a.budget.expand();assert.throws(()=>a.budget.expand(),e=>e.resource==='stateExpansions');
  assert.throws(()=>a.budget.spend(4),e=>e.resource==='work');
  assert.throws(()=>a.budget.spend(0));
  assert.equal(b.snapshot().work,3);
  a.budget.spend(3);const row=l.settle(a,result(a,'refused'));
  assert.equal(row.usage.work,4);assert.equal(row.usage.expansions,1);
  assert.equal(row.root.work,6);
});
test('P3 existing nested LARE budgets share the actual root, not a second allowance',()=>{
  const {b,l}=setup(),a=l.open(task('task-1',12,4));
  const nested=createLareBudget({work:5,stateExpansions:2},{parent:a.budget});
  nested.spend(3);nested.expand();nested.expand();
  assert.throws(()=>nested.spend(),e=>e.resource==='work');
  assert.equal(a.budget.snapshot().work,5);
  assert.equal(l.settle(a,result(a)).root.work,7);
  assert.equal(b.snapshot().expansions,2);
  assert.throws(()=>nested.snapshot().remainingWork===0&&a.budget.spend(),/closed/);
});
test('P3 serial ledger rejects overlaps, duplicate logical tasks and stale leases',()=>{
  const {b,l}=setup(),a=l.open(task());
  assert.throws(()=>l.open(task('other')),/active/);
  a.budget.spend(3);const failed=l.abandon(a);
  assert.equal(failed.status,'failed');assert.equal(b.snapshot().work,5);
  assert.throws(()=>l.open(task()),/Duplicate/);
  assert.throws(()=>l.settle(a,result(a)),/closed/);
  const next=l.open(task('next'));
  assert.throws(()=>a.budget.spend(),/closed/);
  assert.throws(()=>l.settle({...next},result(next)),/closed/);
  assert.equal(l.settle(next,result(next,'stopped')).status,'stopped');
  assert.equal(b.snapshot().work,7);
});
test('P3 exact task and settlement source binding rejects malformed or stale results',()=>{
  const {b,l}=setup(),t=task();
  for(const bad of [{...t,snapshotFingerprint:'b'.repeat(64)},{...t,context:{...context(),sessionId:'other'}},
    {...t,limits:{work:1,stateExpansions:0}},{...t,allowWrites:true},{...t,strategyVersion:0}])
    assert.throws(()=>l.open(bad));
  assert.equal(b.snapshot().work,0);
  const a=l.open(t);
  for(const bad of [{...result(a),taskId:'other'},{...result(a),context:{...context(),operation:{...context().operation,revision:8}}},
    {...result(a),snapshotFingerprint:'b'.repeat(64)},{...result(a),status:'verified-witness'},
    {...result(a),work:0},{...result(a),applyReady:true}])
    assert.throws(()=>l.settle(a,bad));
  assert.equal(l.snapshot().active.task.taskId,t.taskId);
  assert.equal(l.abandon(a).status,'failed');
});
test('P3 ledger accounts prior and between-task coordinator work and detects external active debits',()=>{
  const b=root();b.spend(3);const {l}=setup(b);
  const a=l.open(task());a.budget.spend(4);l.settle(a,result(a));
  b.spend(2);const n=l.open(task('next',10,3));
  assert.equal(b.snapshot().work,13);
  b.spend(1);
  assert.throws(()=>n.budget.spend(),/outside/);
  assert.throws(()=>l.settle(n,result(n)),/outside/);
  assert.throws(()=>l.abandon(n),/outside/);
  assert.equal(b.snapshot().work,14);
});
test('P3 logical evidence is deterministic and no live authorization is exposed',()=>{
  function run(){
    const {l}=setup();const a=l.open(task());a.budget.expand();a.budget.spend(2);
    l.settle(a,result(a));const b=l.open(task('other'));l.abandon(b);return l.snapshot();
  }
  const a=run();assert.deepEqual(a,run());assert.ok(Object.isFrozen(a.settled));
  assert.equal(a.active,null);assert.equal(Object.hasOwn(a,'applyReady'),false);
  assert.throws(()=>createAresSearchLedger(context(),'invalid',root()));
  assert.throws(()=>createAresSearchLedger(context(),fingerprint,null),/root budget/);
});
