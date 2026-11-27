import test from 'node:test';
import assert from 'node:assert/strict';
import { probeFreshRtreConstrained,probeFreshRtreOptimized } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const options={mode:'adaptive',maxObjects:10000,maxHops:6,maxCandidates:4,maxNeighbors:4};
const withoutStats=({stats,...r})=>r;
for(const [id,opts,factory] of [
  ['holdout-linear',{...options,maxCandidates:32},createSpatialDestructionBudget],
  ['mixed-small',options,createSpatialPreservationBudget],
  ['mixed-river',options,createSpatialDestructionBudget],
  ['dry-positive',{...options,mode:'strict'},createSpatialPreservationBudget]
]){
  test('F1A matched incident-check reuse: '+id,async()=>{
    const t=performance.now(),reference=await probeFreshRtreConstrained(id,opts,factory()),referenceMs=performance.now()-t;
    const u=performance.now(),optimized=await probeFreshRtreOptimized(id,opts,factory()),optimizedMs=performance.now()-u;
    assert.deepEqual(withoutStats(optimized),withoutStats(reference));
    assert.equal(optimized.stats.expansions,reference.stats.expansions);
    assert.ok(optimized.stats.work<=reference.stats.work);
    if(id==='holdout-linear'||id==='mixed-small')assert.ok(optimized.stats.work<reference.stats.work);
    console.log('ARES_P4_F1A '+JSON.stringify({id,mode:opts.mode,reference:reference.stats,optimized:optimized.stats,referenceMs,optimizedMs,status:optimized.status}));
  });
}
test('F1A retains recipe-only and bounded-scope refusal',async()=>{
  const narrow={...options,maxObjects:1};
  const a=await probeFreshRtreConstrained('dry-positive',narrow,createSpatialPreservationBudget());
  const b=await probeFreshRtreOptimized('dry-positive',narrow,createSpatialPreservationBudget());
  assert.deepEqual(b,a);assert.equal(b.status,'preflight-refused');assert.equal(b.adjustedWitness,null);
  await assert.rejects(probeFreshRtreOptimized({},options,createSpatialPreservationBudget()),/recipe ID/);
});
