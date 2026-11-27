import test from 'node:test';
import assert from 'node:assert/strict';
import { probeFreshRtreSingleJunction } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { inspectFreshRtreNeighborhood } from '../scripts/development/research/ares-rtre-fresh-neighborhood.mjs';
import { buildRoadGraph, classifyRoad } from '../src/core/road-graph.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
const opts={mode:'adaptive',maxObjects:10000,maxHops:4,maxCandidates:32};
test('Fresh dry control produces a real single-neighbor geometry witness without replacing valid baseline',async()=>{
  const r=await probeFreshRtreSingleJunction('dry-positive',opts,createSpatialPreservationBudget());
  assert.equal(r.status,'baseline-valid');assert.equal(r.baseline.valid,true);
  assert.ok(r.adjustedWitness,'Expected a detached adjustment demonstration on a graph-valid control');
  const f=materializeAresP3Case('dry-positive'),before=aresReplayJson(f.project);
  const w=r.adjustedWitness,{maxCandidates,...scope}=opts;
  const e=await inspectFreshRtreNeighborhood('dry-positive',scope,createSpatialPreservationBudget());
  assert.ok(e.eligibleJunctions.some(n=>n.ref.id===w.neighbor.id));
  assert.equal(w.updates.length,e.requested.length+1);
  const updates=new Map(w.updates.map(u=>[u.id,u.point]));
  for(const n of e.requested)assert.deepEqual(updates.get(n.ref.id),n.point);
  assert.notDeepEqual(w.neighbor.old,w.neighbor.point);
  assert.ok(f.project.city.roads.filter(r=>w.changedRoadIds.includes(r.id)).every(r=>!classifyRoad(r).protected));
  const candidate={...f.project.city,nodes:f.project.city.nodes.map(n=>updates.has(n.id)?{...n,...updates.get(n.id)}:n)};
  assert.ok(buildRoadGraph(candidate).valid);
  assert.equal(aresReplayJson(f.project),before);
  assert.ok(r.attempts<=opts.maxCandidates&&r.stats.expansions===r.attempts);
  assert.equal(w.kind,'geometry-only');assert.ok(Object.isFrozen(w));
  assert.deepEqual(r,await probeFreshRtreSingleJunction('dry-positive',opts,createSpatialPreservationBudget()));
});
test('Strict and incomplete scope dispatch no neighboring adjustment',async()=>{
  const s=await probeFreshRtreSingleJunction('dry-positive',{...opts,mode:'strict'},createSpatialPreservationBudget());
  assert.equal(s.status,'baseline-valid');assert.equal(s.attempts,0);assert.equal(s.adjustedWitness,null);
  const t=await probeFreshRtreSingleJunction('dry-positive',{...opts,maxObjects:1},createSpatialPreservationBudget());
  assert.equal(t.status,'preflight-refused');assert.equal(t.attempts,0);assert.equal(t.adjustedWitness,null);
});
test('Large frozen linear obstruction stays bounded; any retained witness is independently planar',async()=>{
  const r=await probeFreshRtreSingleJunction('holdout-linear',{...opts,maxCandidates:3},createSpatialDestructionBudget());
  assert.ok(r.attempts<=3);
  if(r.adjustedWitness){
    const f=materializeAresP3Case('holdout-linear'),u=new Map(r.adjustedWitness.updates.map(x=>[x.id,x.point]));
    assert.ok(buildRoadGraph({...f.project.city,nodes:f.project.city.nodes.map(n=>u.has(n.id)?{...n,...u.get(n.id)}:n)}).valid);
  }
  assert.ok(['preflight-refused','search-refused','geometry-recovered','work-limit','baseline-valid'].includes(r.status));
});
test('Mixed landscape is deferred and arbitrary cities or injected options are rejected',async()=>{
  const r=await probeFreshRtreSingleJunction('mixed-river',opts,createSpatialDestructionBudget());
  assert.equal(r.status,'unsupported-landscape');assert.equal(r.attempts,0);assert.equal(r.adjustedWitness,null);
  const f=materializeAresP3Case('dry-positive');
  await assert.rejects(probeFreshRtreSingleJunction(f.project,opts,createSpatialPreservationBudget()),/recipe ID/);
  await assert.rejects(probeFreshRtreSingleJunction('dry-positive',{...opts,eligibleJunctions:[]},createSpatialPreservationBudget()),/options/);
  await assert.rejects(probeFreshRtreSingleJunction('dry-positive',{...opts,maxCandidates:0},createSpatialPreservationBudget()),/options/);
});
