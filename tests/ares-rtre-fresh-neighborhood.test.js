import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFreshRtreNeighborhood } from '../scripts/development/research/ares-rtre-fresh-neighborhood.mjs';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { observeAresRtreNeighborhood } from '../src/core/ares-rtre-neighborhood.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget, spatialRefKey } from '../src/core/spatial-recovery-contract.js';
import { classifyRoad } from '../src/core/road-graph.js';

const options={mode:'adaptive',maxObjects:10000,maxHops:4};
test('Fresh frozen recipe yields bounded eligible neighboring junctions with closed incident scope',async()=>{
  const a=await inspectFreshRtreNeighborhood('dry-positive',options,createSpatialPreservationBudget());
  assert.equal(a.status,'research-eligible');assert.ok(a.eligibleJunctions.length>0);
  assert.equal(a.authorship,'fresh-frozen-generator-recipe');
  assert.equal(a.snapshotFingerprint,'9a537f0aa98abf8f5d1a6763a7eb84cc1299215eff305ea1b8804f7c32966fa6');
  const f=materializeAresP3Case('dry-positive'),admitted=new Set(a.entries.map(e=>spatialRefKey(e.ref)));
  const selected=new Set(a.requested.map(e=>e.ref.id)),byId=new Map(f.project.city.nodes.map(n=>[n.id,n]));
  for(const e of a.eligibleJunctions){
    assert.ok(!selected.has(e.ref.id));assert.ok(e.depth<=options.maxHops);
    assert.ok(e.incidentRefs.every(r=>admitted.has(spatialRefKey(r))));
    assert.ok(!a.entries.some(r=>r.ref.id===e.ref.id&&r.ref.collection==='nodes'&&r.role==='protected-anchor'));
    const incident=f.project.city.roads.filter(r=>r.a===e.ref.id||r.b===e.ref.id);
    assert.ok(incident.every(r=>!classifyRoad(r).protected&&e.incidentRefs.some(s=>s.collection==='roads'&&s.id===r.id)));
    for(const r of incident)for(const id of [r.a,r.b])assert.ok(e.incidentRefs.some(s=>s.collection==='nodes'&&s.id===id));
    const n=byId.get(e.ref.id);assert.deepEqual(e.old,{x:n.x,y:n.y});
  }
  assert.ok(Object.isFrozen(a.eligibleJunctions));
  assert.deepEqual(a,await inspectFreshRtreNeighborhood('dry-positive',options,createSpatialPreservationBudget()));
});
test('Strict and incomplete selected scope never yield research eligibility',async()=>{
  const strict=await inspectFreshRtreNeighborhood('dry-positive',{...options,mode:'strict'},createSpatialPreservationBudget());
  assert.equal(strict.status,'strict-no-adjustment');assert.deepEqual(strict.eligibleJunctions,[]);
  for(const limits of [{maxObjects:1,maxHops:4},{maxObjects:10000,maxHops:0}]){
    const a=await inspectFreshRtreNeighborhood('dry-positive',{mode:'adaptive',...limits},createSpatialPreservationBudget());
    assert.equal(a.status,'required-scope-incomplete');assert.deepEqual(a.eligibleJunctions,[]);
  }
});
test('Fresh research accepts no imported city, caller trust flag or extra budget',async()=>{
  const f=materializeAresP3Case('dry-positive');
  await assert.rejects(inspectFreshRtreNeighborhood(f.project,options,createSpatialPreservationBudget()),/recipe ID/);
  await assert.rejects(inspectFreshRtreNeighborhood('not-a-frozen-case',options,createSpatialPreservationBudget()),/recipe/);
  await assert.rejects(inspectFreshRtreNeighborhood('dry-positive',{...options,trusted:true},createSpatialPreservationBudget()),/options/);
  await assert.rejects(inspectFreshRtreNeighborhood('dry-positive',options,createSpatialDestructionBudget()),/allowance/);
  const saved=await observeAresRtreNeighborhood(f.project,f.context,{mode:'adaptive'},
    {maxObjects:options.maxObjects,maxHops:options.maxHops},createSpatialPreservationBudget());
  assert.deepEqual(saved.writableRefs,[]);
});
test('Mixed generated fixture retains protected anchors and does not clip exact intent',async()=>{
  const a=await inspectFreshRtreNeighborhood('mixed-river',options,createSpatialDestructionBudget());
  assert.ok(a.geometryDiagnostics.some(d=>d.code==='unnormalized-crossing'));
  assert.ok(a.entries.some(r=>r.role==='protected-anchor'));
  const anchors=new Set(a.entries.filter(r=>r.ref.collection==='nodes'&&r.role==='protected-anchor').map(r=>r.ref.id));
  assert.ok(a.eligibleJunctions.every(e=>!anchors.has(e.ref.id)));
  const f=materializeAresP3Case('mixed-river'),nodes=new Map(f.project.city.nodes.map(n=>[n.id,n]));
  for(const e of a.requested){
    const n=nodes.get(e.ref.id),o=f.context.operation.geometry.offset;
    assert.deepEqual(e.point,{x:n.x+o.x,y:n.y+o.y});
  }
});
