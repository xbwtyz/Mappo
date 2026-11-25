import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {createIdentityAllocationState,formatAllocatedIdentity} from '../src/core/identity-allocation.js';
import {validateActiveIdentityInventory} from '../src/core/identity-verification.js';
import {migrateSchema10ProjectS11} from '../src/data/migrate-schema11.js';
import {mixedCityFixtureS10} from './helpers/schema10-mixed-city.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const strip=project=>{
  const result=copy(project);delete result.identityAllocation;result.schemaVersion=10;return result;
};
const simple=()=>({schemaVersion:10,city:{
  buildings:[{id:'BLD-00001'}],properties:[{id:'PROP-00001'}],plots:[{id:'PLOT-00001'}]
}});
const ns='0123456789abcdef0123456789abcdef';
test('S11 migration preserves complete real city JSON and all existing identifiers',()=>{
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  validateStoredProject(project);
  const before=JSON.stringify(project),candidate=migrateSchema10ProjectS11(project);
  assert.equal(candidate.schemaVersion,11);
  assert.deepEqual(candidate.identityAllocation,createIdentityAllocationState());
  assert.equal(JSON.stringify(strip(candidate)),before);
  assert.equal(JSON.stringify(project),before);
  assert.notEqual(candidate.city,project.city);
  assert.equal(validateActiveIdentityInventory(candidate.identityAllocation,candidate.city),true);
});
test('S11 migration preserves mixed courtyard and joined-component geometry exactly',()=>{
  const {project}=mixedCityFixtureS10();
  const before=JSON.stringify(project),candidate=migrateSchema10ProjectS11(project);
  assert.equal(JSON.stringify(strip(candidate)),before);
  assert.equal(JSON.stringify(project),before);
});
test('S11 migration is deterministic and preserves opaque compatible JSON fields',()=>{
  const project=simple();
  project.extension={name:'legacy',nested:[1,null,{value:true}]};
  project.city.buildings[0].customName='Old house';
  project.city.buildings[0].opaque={geometry:[{x:1,y:2}]};
  const a=migrateSchema10ProjectS11(project),b=migrateSchema10ProjectS11(project);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.deepEqual(strip(a),project);
  a.extension.nested[2].value=false;
  assert.equal(project.extension.nested[2].value,true);
  assert.deepEqual(b.extension,project.extension);
});
for(const [name,mutate] of [
  ['already migrated',p=>p.schemaVersion=11],
  ['older schema',p=>p.schemaVersion=9],
  ['missing city',p=>delete p.city],
  ['missing collection',p=>delete p.city.buildings],
  ['existing allocator extension',p=>p.identityAllocation={opaque:true}],
  ['null allocator extension',p=>p.identityAllocation=null],
  ['valid reserved legacy ID',p=>p.city.buildings[0].id=formatAllocatedIdentity('building',ns,1)],
  ['malformed reserved legacy ID',p=>p.city.plots[0].id='PLOT-IDA-invalid'],
  ['reserved unsupported ID',p=>p.city.roads=[{id:formatAllocatedIdentity('building',ns,1)}]],
  ['reserved plaza ID',p=>p.city.plaza={id:formatAllocatedIdentity('property',ns,1)}],
  ['duplicate building ID',p=>p.city.buildings.push({...p.city.buildings[0]})],
  ['missing entity ID',p=>delete p.city.properties[0].id],
  ['non-finite value',p=>p.city.opaque=Infinity],
  ['unsafe JSON key',p=>p.city.opaque=JSON.parse('{"__proto__":1}')]
]){
  test('S11 migration refuses '+name+' without modifying source',()=>{
    const project=simple();mutate(project);
    const before=JSON.stringify(project);
    assert.throws(()=>migrateSchema10ProjectS11(project));
    assert.equal(JSON.stringify(project),before);
  });
}
test('S11 migration leaves historical legacy ID gaps intact and never estimates counters',()=>{
  const project=simple();
  project.city.properties[0].id='PROP-99999';
  const next=migrateSchema10ProjectS11(project);
  assert.equal(next.city.properties[0].id,'PROP-99999');
  assert.deepEqual(next.identityAllocation.namespaces,{});
});
