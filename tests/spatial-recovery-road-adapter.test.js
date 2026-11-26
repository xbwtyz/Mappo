import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { createSpatialPreservationBudget, createSpatialOperation } from '../src/core/spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from '../src/core/spatial-recovery-delta.js';
import { describeSpatialStrategy, describeSpatialCapability, spatialConstraint } from '../src/core/spatial-recovery-registry.js';
import { LARE_CONSTRAINTS } from '../src/core/reconciliation-constraints.js';
import { normalizeSpatialRoadGroup, discoverSpatialRoadScope, verifySpatialStrictRoadWitness, searchSpatialPreservingRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { prepareRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { copyJson } from '../src/data/project-format.js';
const budget=()=>createSpatialPreservationBudget();
const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ids=['RD-0113','RD-0114'],offset={x:.05,y:0};
const operation=()=>normalizeSpatialRoadGroup(project,1,ids,offset);
test('SRE registry separates recognized search permission from integration',()=>{
  assert.equal(describeSpatialStrategy('demolition',{}).permitted,false);
  assert.deepEqual(describeSpatialStrategy('demolition',{destruction:true}),{id:'demolition',version:1,permitted:true,integrated:false});
  assert.equal(describeSpatialStrategy('regeneration',{destruction:true}).permitted,false);
  assert.equal(describeSpatialStrategy('regeneration',{regeneration:true}).integrated,false);
  assert.throws(()=>describeSpatialStrategy('constructor',{}),/Unsupported/);
  assert.equal(spatialConstraint('storedProject'),LARE_CONSTRAINTS.storedProject);
  assert.throws(()=>spatialConstraint('missing'),/Unsupported/);
});
test('SRE capability descriptions never widen existing fixed and authored policies',()=>{
  const p={alternativeFrontage:true,uniformScaling:true,destruction:true,regeneration:true};
  for(const mode of ['fixed','decision-required','authorized-reshape','fixed-unsupported']){
    const c=describeSpatialCapability('property',{provenance:'generated',mode},p);
    assert.equal(c.eligible,false);assert.equal(c.retirement,false);
  }
  assert.equal(describeSpatialCapability('building',{provenance:'custom',mode:'rigid'},p).scaling,false);
  assert.equal(describeSpatialCapability('building',{provenance:'generated',mode:'fixed'},p).retirement,false);
  const generated=describeSpatialCapability('building',{provenance:'generated',mode:'rigid'},p);
  assert.equal(generated.retirement,true);assert.equal(generated.scaling,true);assert.equal(generated.regeneration,false);
  assert.equal(describeSpatialCapability('road',{provenance:'generated',mode:'rigid'},p).retirement,false);
});
test('SRE actual road-group adapter normalizes exact geometry and independently derives scope',()=>{
  const original=JSON.stringify(project),op=operation(),scope=discoverSpatialRoadScope(project,op,budget());
  assert.ok(scope.affectedBlocks.length);assert.ok(scope.refs.some(ref=>ref.collection==='nodes'));
  assert.ok(scope.capabilities.some(row=>row.ref.collection==='properties'));
  assert.ok(Object.isFrozen(scope.refs));assert.ok(Object.isFrozen(op.geometry.offset));
  assert.deepEqual(normalizeSpatialRoadGroup(project,1,ids.slice().reverse(),offset),op);
  assert.equal(JSON.stringify(project),original);
  assert.throws(()=>normalizeSpatialRoadGroup(project,1,ids,{x:0,y:0}),/offset/);
  assert.throws(()=>discoverSpatialRoadScope(project,{...op,permissions:{destruction:true}},budget()),/not integrated/);
  assert.throws(()=>discoverSpatialRoadScope(project,{...op,editedRefs:[{collection:'roads',id:'missing'}]},budget()),/Missing/);
});
test('SRE strict road witness round-trips a real B1R candidate and rejects fresh unauthorized deltas',async()=>{
  const original=JSON.stringify(project),op=operation();
  const baseline=prepareRoadGroupReflowB1(project,ids,offset);
  assert.ok(baseline.candidateProject,JSON.stringify(baseline.unresolved));
  const delta=await createSpatialDelta(project,baseline.candidateProject,op,1,budget());
  const candidate=await verifySpatialStrictRoadWitness(project,op,delta,budget());
  assert.equal(JSON.stringify(candidate),JSON.stringify(baseline.candidateProject));
  const changedIntent=createSpatialOperation({...op,geometry:{offset:{x:.06,y:0}}});
  await assert.rejects(reconstructSpatialDelta(project,changedIntent,1,delta,budget()),/Stale/);
  // A malicious producer can recompute fingerprints. The independent domain
  // gate must still reject edits outside the requested road movement.
  const forged=copyJson(candidate);forged.city.roads[0].opaque='not authorized';
  const forgedDelta=await createSpatialDelta(project,forged,op,1,budget());
  await assert.rejects(verifySpatialStrictRoadWitness(project,op,forgedDelta,budget()),/preservation refused/);
  assert.equal(JSON.stringify(project),original);
});

test('SRE E2 search bridge reuses progressive LARE and returns a verified detached delta',async()=>{
  const before=JSON.stringify(project),op=operation();
  const baseline=prepareRoadGroupReflowB1(project,ids,offset);
  const witness=await searchSpatialPreservingRoadGroup(project,op,budget());
  assert.equal(witness.status,'verified-witness');
  assert.ok(witness.delta);assert.ok(Object.isFrozen(witness));
  assert.equal(Object.hasOwn(witness,'candidateProject'),false);
  assert.equal(JSON.stringify(await reconstructSpatialDelta(project,op,1,witness.delta,budget())),
    JSON.stringify(baseline.candidateProject));
  const repeated=await searchSpatialPreservingRoadGroup(project,
    normalizeSpatialRoadGroup(project,1,ids.slice().reverse(),offset),budget());
  assert.deepEqual(repeated.delta,witness.delta);
  assert.deepEqual(repeated.stats,witness.stats);
  assert.equal(JSON.stringify(project),before);
});
test('SRE E2 search bridge refuses relaxed permissions and exhausted work without mutation',async()=>{
  const before=JSON.stringify(project),op=operation();
  for(const permissions of [{destruction:true},{regeneration:true},{uniformScaling:true},{alternativeFrontage:true}])
    await assert.rejects(searchSpatialPreservingRoadGroup(project,{...op,permissions},budget()),/not integrated/);
  await assert.rejects(searchSpatialPreservingRoadGroup(project,op,
    createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
  assert.equal(JSON.stringify(project),before);
});
