import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { observeAresRtreGeometry } from '../src/core/ares-rtre-geometry.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';

test('RTRE exact requested coordinates and source fingerprint; no neighbor authority or source mutation',async()=>{
  const f=materializeAresP3Case('dry-positive'),before=aresReplayJson(f.project);
  const budget=createSpatialPreservationBudget(),p=await observeAresRtreGeometry(f.project,f.context,{mode:'adaptive'},budget);
  assert.equal(p.status,'observed');assert.equal(p.candidateGraphValid,true);
  assert.equal(p.snapshotFingerprint,createHash('sha256').update(before).digest('hex'));
  const nodes=new Map(f.project.city.nodes.map(n=>[n.id,n]));
  const ids=new Set(f.context.operation.editedRefs.map(r=>r.id));
  const selected=new Set(f.project.city.roads.filter(r=>ids.has(r.id)).flatMap(r=>[r.a,r.b]));
  assert.deepEqual(p.requested.map(r=>r.ref.id),[...selected].sort());
  for(const row of p.junctions){
    const n=nodes.get(row.ref.id),requested=selected.has(n.id);
    assert.deepEqual(row.old,{x:n.x,y:n.y});
    const o=f.context.operation.geometry.offset;
    assert.deepEqual(row.point,requested?{x:o.x===0?n.x:n.x+o.x,y:o.y===0?n.y:n.y+o.y}:{x:n.x,y:n.y});
    assert.equal(row.role==='exact-requested',requested);
    assert.ok(Object.isFrozen(row.point));
  }
  assert.equal(p.junctions.length,nodes.size);
  assert.equal(aresReplayJson(f.project),before);
  assert.ok(budget.snapshot().work>0);assert.equal(budget.snapshot().expansions,0);
  assert.ok(!Object.hasOwn(p,'candidate')&&!Object.hasOwn(p,'applyReady'));
  const strict=await observeAresRtreGeometry(f.project,f.context,{mode:'strict'},createSpatialPreservationBudget());
  assert.deepEqual({...strict,mode:'adaptive'},p);
});
test('RTRE observes typed crossing blockers at exact mixed-river intent; does not reject observation as a search error',async()=>{
  const f=materializeAresP3Case('mixed-river'),before=aresReplayJson(f.project);
  const first=await observeAresRtreGeometry(f.project,f.context,{mode:'adaptive'},createSpatialDestructionBudget());
  assert.equal(first.status,'observed');assert.equal(first.candidateGraphValid,false);
  assert.ok(first.diagnostics.some(d=>d.code==='unnormalized-crossing'&&d.refs.length>=2));
  assert.ok(first.junctions.some(r=>r.role==='protected-anchor'));
  for(const n of first.junctions.filter(r=>r.role==='protected-anchor'))assert.deepEqual(n.point,n.old);
  assert.deepEqual(first,await observeAresRtreGeometry(f.project,f.context,{mode:'adaptive'},createSpatialDestructionBudget()));
  assert.equal(aresReplayJson(f.project),before);
});
test('RTRE fails closed on unsupported modes, stale project, missing budget, and exhaustion',async()=>{
  const f=materializeAresP3Case('dry-positive');
  const run=(c,o,b)=>observeAresRtreGeometry(f.project,c,o,b);
  for(const options of [{},{mode:'restructure'},{mode:'adaptive',allowRoadDeletion:true}])
    await assert.rejects(run(f.context,options,createSpatialPreservationBudget()),/mode/);
  await assert.rejects(run(f.context,{mode:'adaptive'},null),/budget/);
  await assert.rejects(run(f.context,{mode:'adaptive'},createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
  await assert.rejects(run({...f.context,operation:{...f.context.operation,projectId:'wrong'}},{mode:'adaptive'},createSpatialPreservationBudget()),/identity/);
});
test('RTRE captures source before asynchronous hashing; later caller edits cannot relabel evidence',async()=>{
  const f=materializeAresP3Case('dry-positive'),before=aresReplayJson(f.project);
  const pending=observeAresRtreGeometry(f.project,f.context,{mode:'adaptive'},createSpatialPreservationBudget());
  f.project.city.nodes[0].x+=1;
  const observed=await pending;
  assert.equal(observed.snapshotFingerprint,createHash('sha256').update(before).digest('hex'));
  assert.notEqual(aresReplayJson(f.project),before);
});
