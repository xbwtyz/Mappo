import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialRef, spatialRefKey, createSpatialPermissions, createSpatialOperation,
  createSpatialInventory, createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';

const ref = (collection,id) => ({ collection,id });
const intent = { version:1, family:'road', operation:'translate-road-group', projectId:'city-1', revision:3,
  editedRefs:[ref('roads','R2'),ref('roads','R1')] };
const project = { schemaVersion:10, city:{id:'city-1',roads:[{id:'R2',customName:'Keep'},{id:'R1'}],
  properties:[{id:'R1',unknown:{value:1}}],waterFeatures:[{id:'W1'}]} };

test('SRE typed references distinguish collections and refuse unknown collections', () => {
  assert.notEqual(spatialRefKey(ref('roads','R1')),spatialRefKey(ref('properties','R1')));
  assert.throws(()=>createSpatialRef(ref('constructor','x')),/Unsupported/);
  assert.throws(()=>createSpatialRef({collection:'roads',id:'x',extra:true}),/Invalid/);
});
test('SRE permissions are strict by default and unified destruction does not enable other flags', () => {
  assert.deepEqual(createSpatialPermissions(),{alternativeFrontage:false,uniformScaling:false,maxLinearReduction:0,destruction:false,regeneration:false});
  assert.equal(createSpatialPermissions({destruction:true}).regeneration,false);
  assert.equal(createSpatialPermissions({uniformScaling:true}).maxLinearReduction,0.1);
  for (const bad of [{destruction:'yes'},{demolishBuildings:true},{maxLinearReduction:0.1},{uniformScaling:true,maxLinearReduction:0.3}])
    assert.throws(()=>createSpatialPermissions(bad));
});
test('SRE operation normalizes targets deterministically, detached and frozen',()=>{
  const mutable=structuredClone(intent);
  const result=createSpatialOperation(mutable);
  mutable.editedRefs[0].id='changed';
  assert.deepEqual(result.editedRefs,[ref('roads','R1'),ref('roads','R2')]);
  assert.ok(Object.isFrozen(result.editedRefs[0]));
  assert.ok(Object.isFrozen(result.permissions));
  assert.deepEqual(result,createSpatialOperation({...intent,editedRefs:intent.editedRefs.slice().reverse()}));
});
test('SRE operation refuses unknown version, cross-family target, duplicate and invalid revision',()=>{
  for (const bad of [{version:2},{family:'unknown'},{revision:-1},{editedRefs:[ref('roads','R1'),ref('roads','R1')]},{editedRefs:[ref('walls','W1')]}])
    assert.throws(()=>createSpatialOperation({...intent,...bad}));
});
test('SRE inventory preserves original, uses deterministic typed references and charges shared budget',()=>{
  const before=JSON.stringify(project);
  const budget=createSpatialPreservationBudget({work:10,stateExpansions:2});
  const result=createSpatialInventory(project,intent,budget);
  assert.equal(result.refs.length,4);
  assert.equal(budget.snapshot().work,4);
  assert.equal(JSON.stringify(project),before);
  assert.ok(Object.isFrozen(result.refs));
  assert.deepEqual(result,createSpatialInventory({...project,city:{...project.city,roads:project.city.roads.slice().reverse()}},intent,createSpatialPreservationBudget()));
});
test('SRE inventory refuses missing targets, duplicate IDs, wrong identity and exhausted budget',()=>{
  assert.throws(()=>createSpatialInventory(project,{...intent,editedRefs:[ref('roads','missing')]},createSpatialPreservationBudget()),/Missing/);
  assert.throws(()=>createSpatialInventory({...project,city:{...project.city,roads:[{id:'R1'},{id:'R1'}]}},intent,createSpatialPreservationBudget()),/Duplicate/);
  assert.throws(()=>createSpatialInventory(project,{...intent,projectId:'other'},createSpatialPreservationBudget()),/identity/);
  assert.throws(()=>createSpatialInventory(project,intent,createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
});
