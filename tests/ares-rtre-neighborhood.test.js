import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { observeAresRtreNeighborhood } from '../src/core/ares-rtre-neighborhood.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget, spatialRefKey } from '../src/core/spatial-recovery-contract.js';

test('RTRE neighborhood is source-bound, bounded and read-only even in Adaptive',async()=>{
  const f=materializeAresP3Case('dry-positive'),before=aresReplayJson(f.project),limits={maxObjects:200,maxHops:2};
  const run=mode=>observeAresRtreNeighborhood(f.project,f.context,{mode},limits,createSpatialPreservationBudget());
  const a=await run('adaptive');
  assert.ok(a.entries.length>0&&a.entries.length<=limits.maxObjects);
  assert.ok(a.entries.every(r=>r.depth<=limits.maxHops));
  assert.equal(new Set(a.entries.map(r=>spatialRefKey(r.ref))).size,a.entries.length);
  assert.ok(a.entries.some(r=>r.role==='observe-only'&&r.provenance==='unknown'));
  assert.ok(a.diagnostics.some(r=>r.code==='rtre-neighbor-provenance'));
  assert.deepEqual(a.writableRefs,[]);
  assert.deepEqual(a,await run('adaptive'));
  assert.deepEqual((await run('strict')).writableRefs,[]);
  assert.equal(aresReplayJson(f.project),before);
});
test('RTRE neighborhood never promotes an already observed reference beyond caps',async()=>{
  const f=materializeAresP3Case('dry-positive');
  for(const limits of [{maxObjects:1,maxHops:10},{maxObjects:200,maxHops:0}]){
    const a=await observeAresRtreNeighborhood(f.project,f.context,{mode:'adaptive'},limits,createSpatialPreservationBudget());
    assert.equal(a.status,'scope-limited');
    assert.ok(a.entries.length<=limits.maxObjects&&a.entries.every(r=>r.depth<=limits.maxHops));
    assert.ok(a.omittedRefs.length>0);assert.deepEqual(a.writableRefs,[]);
    const admitted=new Set(a.entries.map(r=>spatialRefKey(r.ref)));
    assert.ok(a.omittedRefs.every(r=>!admitted.has(spatialRefKey(r))));
  }
});
test('RTRE crossing evidence seeds actual obstruction roads, not arbitrary writable neighbors',async()=>{
  const f=materializeAresP3Case('mixed-river'),a=await observeAresRtreNeighborhood(f.project,f.context,
    {mode:'adaptive'},{maxObjects:1000,maxHops:1},createSpatialDestructionBudget());
  assert.ok(a.roots.some(r=>r.ref.collection==='roads'&&r.reasons.includes('unnormalized-crossing')));
  assert.ok(a.entries.some(r=>r.role==='protected-anchor'));
  assert.deepEqual(a.writableRefs,[]);
});
test('RTRE neighborhood rejects invented limits and exhausted work without mutation',async()=>{
  const f=materializeAresP3Case('dry-positive'),before=aresReplayJson(f.project);
  for(const limits of [{maxObjects:0,maxHops:1},{maxObjects:10,maxHops:-1},{maxObjects:10,maxHops:2,allowUnknown:true}]){
    await assert.rejects(observeAresRtreNeighborhood(f.project,f.context,{mode:'adaptive'},limits,createSpatialPreservationBudget()),/limits/);
  }
  await assert.rejects(observeAresRtreNeighborhood(f.project,f.context,{mode:'adaptive'},{maxObjects:2,maxHops:1},
    createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
  assert.equal(aresReplayJson(f.project),before);
});
