import test from 'node:test';
import assert from 'node:assert/strict';
import { probeFreshRtreRanked,probeFreshRtreOptimized } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const opts={mode:'adaptive',maxObjects:10000,maxHops:6,maxCandidates:4,maxNeighbors:4};
function verify(r){
  const w=r.adjustedWitness;assert.ok(w);assert.equal(w.kind,'geometry-with-final-constraints');
  assert.deepEqual(w.constraints.finalBlockers,[]);
  assert.equal(w.constraints.finalChecked,3*w.changedRoadIds.length);
  const {project,context}=materializeAresP3Case(r.caseId),city=project.city;
  const nodes=new Map(city.nodes.map(n=>[n.id,n])),updates=new Map(w.updates.map(n=>[n.id,n.point]));
  const selected=new Set(context.operation.editedRefs.map(r=>r.id));
  const requested=new Set(city.roads.filter(r=>selected.has(r.id)).flatMap(r=>[r.a,r.b]));
  const offset=context.operation.geometry.offset;
  for(const id of requested){const old=nodes.get(id);assert.deepEqual(updates.get(id),{x:offset.x===0?old.x:old.x+offset.x,y:offset.y===0?old.y:old.y+offset.y});}
  const neighborIds=new Set(w.neighbors.map(n=>n.id));assert.equal(neighborIds.size,w.neighbors.length);
  for(const id of neighborIds)assert.ok(!requested.has(id));
  const major=city.roads.filter(road=>road.kind==='primary'&&(neighborIds.has(road.a)||neighborIds.has(road.b))).length;
  const displacement=w.neighbors.reduce((sum,n)=>sum+Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y),0);
  assert.deepEqual(r.ranking.bestScore,[major,neighborIds.size,displacement]);
  assert.ok(buildRoadGraph({...city,nodes:city.nodes.map(n=>updates.has(n.id)?{...n,...updates.get(n.id)}:n)}).valid);
}
function noWorse(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];return true;}
test('F1B ranked linear preserves first verified incumbent and improves only by declared profile',async()=>{
  const reference=await probeFreshRtreOptimized('holdout-linear',opts,createSpatialDestructionBudget());
  const first=await probeFreshRtreRanked('holdout-linear',{...opts,maxCandidates:1},createSpatialDestructionBudget());
  assert.equal(first.status,'geometry-recovered');assert.deepEqual(first.adjustedWitness,reference.adjustedWitness);
  verify(first);assert.equal(first.ranking.verifiedCount,1);
  const t=performance.now(),ranked=await probeFreshRtreRanked('holdout-linear',opts,createSpatialDestructionBudget()),elapsedMs=performance.now()-t;
  verify(ranked);assert.equal(ranked.status,'geometry-recovered');assert.ok(ranked.attempts<=opts.maxCandidates);
  assert.deepEqual(ranked.ranking.firstScore,first.ranking.bestScore);assert.ok(noWorse(ranked.ranking.bestScore,first.ranking.bestScore));
  assert.ok(ranked.ranking.bestAttempt<=ranked.attempts);assert.ok(ranked.ranking.verifiedCount>=1);
  const repeat=await probeFreshRtreRanked('holdout-linear',opts,createSpatialDestructionBudget());assert.deepEqual(repeat,ranked);
  console.log('ARES_P4_F1B '+JSON.stringify({id:ranked.caseId,referenceWork:reference.stats.work,rankedWork:ranked.stats.work,referenceAttempts:reference.attempts,rankedAttempts:ranked.attempts,ranking:ranked.ranking,termination:ranked.termination,elapsedMs}));
});
test('F1B expansion exhaustion retains incumbent without exceeding cap',async()=>{
  const first=await probeFreshRtreRanked('holdout-linear',{...opts,maxCandidates:1},createSpatialDestructionBudget());
  const bounded=await probeFreshRtreRanked('holdout-linear',opts,createSpatialDestructionBudget({work:32000000,stateExpansions:1}));
  assert.equal(bounded.termination,'work-limit');assert.equal(bounded.status,'geometry-recovered');
  assert.equal(bounded.stats.expansions,1);assert.deepEqual(bounded.adjustedWitness,first.adjustedWitness);
  assert.deepEqual(bounded.ranking,first.ranking);verify(bounded);
});
test('F1B prefers exact valid mixed baseline without additional neighbors',async()=>{
  const r=await probeFreshRtreRanked('mixed-small',opts,createSpatialPreservationBudget());
  assert.equal(r.status,'baseline-valid');assert.equal(r.termination,'baseline-preferred');
  assert.equal(r.attempts,0);assert.equal(r.adjustedWitness,null);assert.equal(r.ranking.verifiedCount,0);
  assert.deepEqual(r.baseline.constraints.finalBlockers,[]);
  assert.ok(r.baseline.constraints.sweptUnresolved.length>0);
  console.log('ARES_P4_F1B '+JSON.stringify({id:r.caseId,work:r.stats.work,attempts:r.attempts,termination:r.termination}));
});
test('F1B cannot rank blocked exact-selected river movement',async()=>{
  const r=await probeFreshRtreRanked('mixed-river',opts,createSpatialDestructionBudget());
  assert.equal(r.termination,'fixed-selected-constraint');assert.equal(r.status,'search-refused');assert.equal(r.attempts,0);
  assert.equal(r.adjustedWitness,null);assert.equal(r.ranking.bestScore,null);
});
test('F1B keeps Strict, incomplete scope and imported projects outside adjustment authority',async()=>{
  const strict=await probeFreshRtreRanked('dry-positive',{...opts,mode:'strict'},createSpatialPreservationBudget());
  assert.equal(strict.termination,'strict');assert.equal(strict.attempts,0);assert.equal(strict.adjustedWitness,null);
  const narrow=await probeFreshRtreRanked('dry-positive',{...opts,maxObjects:1},createSpatialPreservationBudget());
  assert.equal(narrow.status,'preflight-refused');assert.equal(narrow.attempts,0);
  await assert.rejects(probeFreshRtreRanked(materializeAresP3Case('dry-positive').project,opts,createSpatialPreservationBudget()),/recipe ID/);
});
