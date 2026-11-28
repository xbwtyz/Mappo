import test from 'node:test';
import assert from 'node:assert/strict';
import { createAresConstraintQuery, createAresConstraintQueryService, matchesAresConstraintQuery } from '../src/core/ares-constraint-query.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';

const ref=(collection,id)=>({collection,id});
const input=()=>({version:1,context:{version:1,sessionId:'session-A',sourceVersion:'0.2.25-dev',
  operation:{version:1,family:'road',operation:'translate-road-group',projectId:'city-A',revision:7,
    editedRefs:[ref('roads','R1'),ref('roads','R2')],geometry:{offset:{x:0,y:75}},permissions:{}}},
  snapshotFingerprint:'accepted-A',geometryFingerprint:'candidate-A',capability:'vertical-clearance',phase:'final',
  frame:{horizontal:'city-map-unit',vertical:{unit:'synthetic-unit',datum:'test-datum'}},
  bounds:{x:{min:0,max:10},y:{min:1,max:11},z:{min:3,max:5}},refs:[ref('roads','R2'),ref('roads','R1')]});
const row=(patch={})=>({id:'clearance',ruleVersion:'synthetic-1',kind:'hard-domain',outcome:'satisfied',
  refs:[ref('roads','R1')],anchorRefs:[ref('terrainFeatures','T1')],detail:'Synthetic observation only',...patch});
const provider=(evaluate,id='synthetic-vertical',capabilities=['vertical-clearance'])=>({
  descriptor:{id,version:1,capabilities},evaluate});
const budget=(work=100)=>createSpatialPreservationBudget({work,stateExpansions:1});
test('ARES query normalizes detached typed refs, frames, bounds and exact intent',()=>{
  const q=input(),normalized=createAresConstraintQuery(q);
  q.bounds.z.min=0;q.refs[0].id='changed';
  assert.equal(normalized.bounds.z.min,3);assert.equal(normalized.frame.vertical.datum,'test-datum');
  assert.deepEqual(normalized.refs,[ref('roads','R1'),ref('roads','R2')]);
  assert.ok(Object.isFrozen(normalized.bounds.z));assert.ok(Object.isFrozen(normalized.context.operation.permissions));
});
test('ARES detached synthetic provider registers without coordinator feature branches',()=>{
  const p=provider((q,spend)=>{assert.ok(Object.isFrozen(q));spend(3);
    return [row({id:'z-soft',kind:'preference',outcome:'violated'}),row({id:'a-hard'})];});
  const s=createAresConstraintQueryService([p]),b=budget(),q=input();
  const e=s.query('synthetic-vertical',q,b);
  assert.deepEqual(e.rows.map(r=>r.id),['a-hard','z-soft']);
  assert.equal(e.summary,'observed-satisfied');assert.equal(b.snapshot().work,6);
  assert.ok(Object.isFrozen(e.rows[0].anchorRefs));assert.equal(Object.hasOwn(e,'applyReady'),false);
});
test('ARES missing provider or capability is explicit unresolved and never invokes evaluator',()=>{
  let invoked=0;const s=createAresConstraintQueryService([provider(()=>{invoked++;return [];},'water',['shore'])]);
  for(const id of ['water','missing']){
    const e=s.query(id,input(),budget());assert.equal(e.status,'unsupported');assert.equal(e.summary,'unresolved');
  }
  assert.equal(invoked,0);
});
test('ARES distinguishes missing elevation from zero using provider-owned synthetic rules',()=>{
  const s=createAresConstraintQueryService([provider(q=>[row({outcome:q.bounds.z===null?'unknown':'satisfied'})])]);
  const q=input();q.bounds.z=null;q.frame.vertical=null;
  assert.equal(s.query('synthetic-vertical',q,budget()).summary,'unresolved');
  const zero=input();zero.bounds.z={min:0,max:0};
  assert.equal(s.query('synthetic-vertical',zero,budget()).summary,'observed-satisfied');
});
test('ARES hard, permission and protection constraints cannot be canceled by preference or road flags',()=>{
  for(const kind of ['hard-domain','permission','protection']){
    const q=input();q.context.operation.permissions.destruction=true;
    const s=createAresConstraintQueryService([provider(()=>[row({kind,outcome:'violated'}),row({id:'prefer',kind:'preference'})])]);
    assert.equal(s.query('synthetic-vertical',q,budget()).summary,'blocked');
  }
  for(const rows of [[],[row({kind:'preference'})],[row({outcome:'unsupported'})],[row({outcome:'unknown'})]]){
    const s=createAresConstraintQueryService([provider(()=>rows)]);
    assert.equal(s.query('synthetic-vertical',input(),budget()).summary,'unresolved');
  }
});
test('ARES constraint query rejects mismatched revision, geometry, snapshot, permissions, phase and datum',()=>{
  const s=createAresConstraintQueryService([provider(()=>[row()])]),e=s.query('synthetic-vertical',input(),budget());
  assert.equal(matchesAresConstraintQuery(e,input()),true);
  for(const mutate of [q=>q.context.operation.revision++,q=>q.snapshotFingerprint='other',
    q=>q.geometryFingerprint='other',q=>q.context.operation.permissions.destruction=true,
    q=>q.phase='swept',q=>q.frame.vertical.datum='other',q=>q.bounds.z.min=0,q=>q.context.operation.geometry.offset.x=-0]){
    const q=input();mutate(q);assert.equal(matchesAresConstraintQuery(e,q),false);
  }
});
test('ARES rejects malformed bounds and undeclared authority',()=>{
  for(const mutate of [q=>q.frame.vertical=null,q=>q.bounds.x.min=Infinity,q=>q.bounds.y.max=0,
    q=>q.refs=[ref('unknown','X')],q=>q.phase='unknown',q=>q.write=true]){
    const q=input();mutate(q);assert.throws(()=>createAresConstraintQuery(q));
  }
});
test('ARES provider failures, invalid evidence, and shared budget exhaustion fail closed',()=>{
  for(const evaluate of [()=>[row(),row()],()=>[row({write:true})],()=>[row({outcome:'passed'})],
    ()=>[row({anchorRefs:[ref('unknown','x')]})],()=>null,()=>{throw Error('provider failure');}]){
    const s=createAresConstraintQueryService([provider(evaluate)]);
    assert.throws(()=>s.query('synthetic-vertical',input(),budget()));
  }
  const s=createAresConstraintQueryService([provider((q,spend)=>{spend(2);return [row()];})]);
  assert.throws(()=>s.query('synthetic-vertical',input(),budget(2)),/budget/);
  assert.throws(()=>s.query('synthetic-vertical',input(),null),/budget/);
  assert.throws(()=>createAresConstraintQueryService([provider(()=>[]),provider(()=>[])]));
});
test('ARES registration and returned evidence are independent of provider insertion order',()=>{
  const a=provider(()=>[row()]),b=provider(()=>[row()],'water',['shore']);
  const first=createAresConstraintQueryService([a,b]),second=createAresConstraintQueryService([b,a]);
  assert.deepEqual(first.descriptors(),second.descriptors());
  assert.deepEqual(first.query('synthetic-vertical',input(),budget()),second.query('synthetic-vertical',input(),budget()));
});
