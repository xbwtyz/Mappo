import test from 'node:test';
import assert from 'node:assert/strict';
import { probeFreshRtreConstrained,probeFreshRtreCoordinated } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { reportRtreGeometryProbe } from '../scripts/development/research/ares-rtre-evidence.mjs';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { buildRoadGraph,classifyRoad } from '../src/core/road-graph.js';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const opts={mode:'adaptive',maxObjects:10000,maxHops:6,maxCandidates:32,maxNeighbors:4};
function verify(r){
  if(!r.adjustedWitness)return;
  const w=r.adjustedWitness,f=materializeAresP3Case(r.caseId),updates=new Map(w.updates.map(x=>[x.id,x.point]));
  assert.equal(w.kind,'geometry-with-final-constraints');
  assert.deepEqual(w.constraints.finalBlockers,[]);
  assert.deepEqual(w.constraints.changedRoadIds,w.changedRoadIds);
  assert.equal(w.constraints.finalChecked,w.changedRoadIds.length*3);
  assert.ok(w.constraints.sweptUnresolved.every(e=>e.query.phase==='swept'));
  const g=buildRoadGraph(f.project.city);
  assert.ok(w.changedRoadIds.every(id=>!classifyRoad(g.roadsById.get(id)).protected&&!g.terminalRoadIds.includes(id)));
  assert.ok(buildRoadGraph({...f.project.city,nodes:f.project.city.nodes.map(n=>updates.has(n.id)?{...n,...updates.get(n.id)}:n)}).valid);
}
test('Constrained linear +100 X reproduces dry geometry recovery with all final providers satisfied',async()=>{
  const t=performance.now(),r=await probeFreshRtreConstrained('holdout-linear',opts,createSpatialDestructionBudget());
  reportRtreGeometryProbe(r,performance.now()-t);
  assert.equal(r.status,'geometry-recovered');assert.equal(r.baseline.geometryValid,false);
  assert.ok(r.adjustedWitness);verify(r);
  const old=await probeFreshRtreCoordinated('holdout-linear',opts,createSpatialDestructionBudget());
  assert.deepEqual(r.adjustedWitness.updates,old.adjustedWitness.updates);
});
test('Constrained mixed-small exact movement evaluates real landscape and defense before retaining any candidate',async()=>{
  const t=performance.now(),r=await probeFreshRtreConstrained('mixed-small',{...opts,maxCandidates:4},createSpatialPreservationBudget());
  reportRtreGeometryProbe(r,performance.now()-t);
  assert.notEqual(r.status,'unsupported-landscape');assert.ok(r.attempts<=4);
  assert.ok(r.baseline?.constraints?.finalChecked>0);
  assert.equal(r.baseline.valid,r.baseline.geometryValid&&r.baseline.constraints.finalBlockers.length===0);
  verify(r);
});
test('Constrained mixed-river never retains blocked final evidence or clips exact selected intent',async()=>{
  const t=performance.now(),r=await probeFreshRtreConstrained('mixed-river',{...opts,maxCandidates:4},createSpatialDestructionBudget());
  reportRtreGeometryProbe(r,performance.now()-t);
  assert.ok(r.attempts<=4);
  if(r.baseline?.constraints?.finalBlockers.length)assert.equal(r.baseline.valid,false);
  if(r.termination==='fixed-selected-constraint'){assert.equal(r.attempts,0);assert.equal(r.adjustedWitness,null);}
  verify(r);
});
test('Constrained strict and narrow scope never move neighbors, imports remain refused',async()=>{
  const s=await probeFreshRtreConstrained('dry-positive',{...opts,mode:'strict'},createSpatialPreservationBudget());
  assert.equal(s.status,'baseline-valid');assert.equal(s.attempts,0);assert.equal(s.adjustedWitness,null);
  const n=await probeFreshRtreConstrained('dry-positive',{...opts,maxObjects:1},createSpatialPreservationBudget());
  assert.equal(n.status,'preflight-refused');assert.equal(n.attempts,0);
  await assert.rejects(probeFreshRtreConstrained(materializeAresP3Case('dry-positive').project,opts,createSpatialPreservationBudget()),/recipe ID/);
});
