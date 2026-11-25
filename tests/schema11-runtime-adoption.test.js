import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { APP_VERSION, PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { validateStoredProject, iterateStoredProjectValidation } from '../src/data/project-validation.js';
import { createIdentityAllocationState, formatAllocatedIdentity } from '../src/core/identity-allocation.js';

const options={seed:'c2-planned',size:'small',morphology:'planned'};
const namespace='0123456789abcdef0123456789abcdef';
const base=createProject(options);
const clone=x=>JSON.parse(JSON.stringify(x));
test('runtime generates deterministic Schema 11 projects with empty persistent state',()=>{
  assert.equal(APP_VERSION,'0.2.25-dev');
  assert.equal(PROJECT_SCHEMA_VERSION,11);
  assert.equal(base.schemaVersion,11);
  assert.equal(base.generatorVersion,APP_VERSION);
  assert.deepEqual(base.identityAllocation,createIdentityAllocationState());
  assert.deepEqual(clone(base),clone(createProject(options)));
  validateStoredProject(base);
});
test('Schema 10 raw and envelope imports preserve canonical city and legacy identities',()=>{
  const legacy=clone(base);
  delete legacy.identityAllocation;
  legacy.schemaVersion=10;
  const envelope=createProjectDocument(base);
  envelope.project=legacy;
  for(const text of [JSON.stringify(legacy),JSON.stringify(envelope)]){
    const adopted=decodeProjectDocument(text);
    assert.equal(adopted.project.schemaVersion,11);
    assert.equal(adopted.formatVersion,1);
    assert.equal(adopted.workspace.schemaVersion,1);
    assert.deepEqual(clone(adopted.project.city),legacy.city);
    assert.deepEqual(adopted.project.identityAllocation,createIdentityAllocationState());
    assert.equal(typeof Object.getOwnPropertyDescriptor(adopted.project.city.buildings[0],'footprint')?.get,'function');
  }
});
test('stored retired-only counters survive project clone and portable reopen',()=>{
  const project=copyJson(base);
  project.identityAllocation={version:1,namespaces:{[namespace]:{building:29,property:11,plot:47}}};
  const doc=createProjectDocument(project);
  const reopened=decodeProjectDocument(encodeProjectDocument(doc));
  assert.deepEqual(clone(reopened.project),clone(project));
  assert.deepEqual(copyJson(doc).project.identityAllocation,project.identityAllocation);
  assert.equal(typeof Object.getOwnPropertyDescriptor(copyJson(project).city.buildings[0],'footprint')?.get,'function');
});
for(const [name,change] of [
  ['missing metadata',p=>delete p.identityAllocation],
  ['null metadata',p=>p.identityAllocation=null],
  ['unsupported version',p=>p.identityAllocation={version:2,namespaces:{}}],
  ['empty namespace',p=>p.identityAllocation={version:1,namespaces:{[namespace]:{}}}],
  ['unsafe counter',p=>p.identityAllocation={version:1,namespaces:{[namespace]:{building:Number.MAX_SAFE_INTEGER+1}}}],
  ['uncovered active ID',p=>p.city.buildings[0].id=formatAllocatedIdentity('building',namespace,1)],
  ['reserved unsupported ID',p=>p.city.roads[0].id=formatAllocatedIdentity('plot',namespace,1)],
  ['wrong registered type',p=>p.city.buildings[0].id=formatAllocatedIdentity('property',namespace,1)]
]){
  test('runtime rejects '+name+' without modifying the candidate',()=>{
    const p=copyJson(base);change(p);
    const before=JSON.stringify(p);
    assert.throws(()=>validateStoredProject(p),/identity|allocation/i);
    assert.throws(()=>decodeProjectDocument(before),/identity|allocation/i);
    assert.equal(JSON.stringify(p),before);
  });
}
test('stored project validation yields bounded identity inventory work',()=>{
  const project=copyJson(base);
  project.identityAllocation={version:1,namespaces:Object.fromEntries(
    Array.from({length:257},(_,i)=>[i.toString(16).padStart(32,'0'),{building:1}]))};
  const steps=iterateStoredProjectValidation(project);
  let saw=false;
  for(let step=steps.next();!step.done;step=steps.next()){
    if(step.value.stage==='project-identity-namespaces'){saw=true;break;}
  }
  assert.equal(saw,true);
  steps.return();
  validateStoredProject(project);
});
