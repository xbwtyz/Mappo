import test from 'node:test';
import assert from 'node:assert/strict';
import { probeFreshRtreCoordinated } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { reportRtreGeometryProbe } from '../scripts/development/research/ares-rtre-evidence.mjs';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { inspectFreshRtreNeighborhood } from '../scripts/development/research/ares-rtre-fresh-neighborhood.mjs';
import { buildRoadGraph,classifyRoad } from '../src/core/road-graph.js';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const opts={mode:'adaptive',maxObjects:10000,maxHops:4,maxCandidates:32,maxNeighbors:4};
async function verify(r,o,factory){
  assert.ok(r.attempts<=o.maxCandidates&&r.stats.expansions===r.attempts);
  if(!r.adjustedWitness)return;
  const {maxCandidates,maxNeighbors,...scope}=o,f=materializeAresP3Case(r.caseId),
    e=await inspectFreshRtreNeighborhood(r.caseId,scope,factory()),w=r.adjustedWitness,
    u=new Map(w.updates.map(x=>[x.id,x.point])),m=new Set(w.neighbors.map(x=>x.id)),
    selected=new Set(e.requested.map(x=>x.ref.id)),eligible=new Set(e.eligibleJunctions.map(x=>x.ref.id));
  assert.ok(m.size>=2&&m.size<=maxNeighbors);assert.equal(m.size,w.neighbors.length);
  assert.ok([...m].every(id=>eligible.has(id)&&!selected.has(id)));assert.equal(u.size,selected.size+m.size);
  for(const n of e.requested)assert.deepEqual(u.get(n.ref.id),n.point);
  for(const n of w.neighbors)assert.notDeepEqual(n.old,n.point);
  const g=buildRoadGraph(f.project.city),allowed=new Set([...m,...selected]),seen=new Set(),q=[w.neighbors[0].id];
  for(let i=0;i<q.length;i++){
    const id=q[i];if(seen.has(id))continue;seen.add(id);
    for(const n of g.adjacency.get(id))if(allowed.has(n)&&!seen.has(n))q.push(n);
  }
  assert.ok([...m].every(id=>seen.has(id)));
  const roads=f.project.city.roads.filter(x=>u.has(x.a)||u.has(x.b));
  assert.ok(roads.every(x=>!classifyRoad(x).protected));assert.deepEqual(w.changedRoadIds,roads.map(x=>x.id).sort());
  assert.equal(buildRoadGraph({...f.project.city,nodes:f.project.city.nodes.map(x=>u.has(x.id)?{...x,...u.get(x.id)}:x)}).valid,true);
}
async function run(id,o,factory){
  const t=performance.now(),r=await probeFreshRtreCoordinated(id,o,factory());
  reportRtreGeometryProbe(r,performance.now()-t);await verify(r,o,factory);return r;
}
test('Coordinated dry control actually adjusts two or more eligible connected neighbors',async()=>{
  const r=await run('dry-positive',opts,createSpatialPreservationBudget);
  assert.equal(r.status,'baseline-valid');assert.ok(r.adjustedWitness);
  assert.deepEqual(r,await probeFreshRtreCoordinated('dry-positive',opts,createSpatialPreservationBudget()));
});
test('Frozen large linear obstruction is investigated under explicit caps',async()=>{
  const r=await run('holdout-linear',{...opts,maxHops:6},createSpatialDestructionBudget);
  assert.ok(r.stats.work<=32000000);
});
test('Five-road branch and quadrilateral report actual geometry outcomes',async()=>{
  for(const id of ['historical-five-branch','historical-quad-control'])await run(id,opts,createSpatialDestructionBudget);
});
test('Strict, narrow scope and mixed domains dispatch no coordinated adjustment',async()=>{
  const s=await probeFreshRtreCoordinated('dry-positive',{...opts,mode:'strict'},createSpatialPreservationBudget());
  assert.equal(s.attempts,0);assert.equal(s.adjustedWitness,null);
  const n=await probeFreshRtreCoordinated('dry-positive',{...opts,maxObjects:1},createSpatialPreservationBudget());
  assert.equal(n.status,'preflight-refused');assert.equal(n.attempts,0);
  const m=await probeFreshRtreCoordinated('mixed-river',opts,createSpatialDestructionBudget());
  assert.equal(m.status,'unsupported-landscape');assert.equal(m.attempts,0);
  await assert.rejects(probeFreshRtreCoordinated('dry-positive',{...opts,maxNeighbors:1},createSpatialPreservationBudget()),/options/);
});
