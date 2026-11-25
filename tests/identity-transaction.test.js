import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { copyJson } from '../src/data/project-format.js';
import { issueIdentityReservation } from '../src/core/identity-verification.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';
import { prepareAcceptedIdentityTransaction } from '../src/core/identity-transaction.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';

const base=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ns='0123456789abcdef0123456789abcdef';
const other='f'.repeat(32);
function fixture({allocate=true,maxBytes}={}){
  const project=copyJson(base);
  project.identityAllocation={version:1,namespaces:{[other]:{building:19}}};
  const context={projectId:'session-project',revision:7,namespace:ns};
  const requests=allocate?[{type:'building',key:'replacement'}]:[];
  const receipt=structuredClone(issueIdentityReservation(project.identityAllocation,project.city,context,requests));
  const city=copyJson(project.city),oldId=city.buildings[0].id;
  if(allocate){
    const id=receipt.allocations[0].id;
    city.buildings[0].id=id;
    const p=city.properties.find(p=>p.id===city.buildings[0].propertyId);
    p.buildingIds=p.buildingIds.map(x=>x===oldId?id:x);
  }else city.buildings[0].customName='New name';
  const history=new AcceptedEditHistoryD01(maxBytes===undefined?{}:{maxBytes});
  history.clear(project);
  const transaction={family:'building',operation:'test-replacement',label:'Test edit',targetIds:[oldId]};
  // Test-only authority: production must use the applicable independent
  // domain validator and reviewed retirement/geometry policy.
  return {project,context,requests,receipt,candidateCity:city,transaction,history,validateDomain:()=>true};
}
function snapshot(f){
  return JSON.stringify({project:f.project,context:f.context,receipt:f.receipt,city:f.candidateCity,
    transaction:f.transaction,baseline:f.history.baseline,past:f.history.past,future:f.history.future,
    serial:f.history.serial,notice:f.history.notice});
}
test('IDA prepares a real allocated replacement with one detached project and next revision',()=>{
  const f=fixture(),before=snapshot(f),next=prepareAcceptedIdentityTransaction(f);
  assert.equal(snapshot(f),before);
  assert.equal(next.context.revision,8);
  assert.equal(next.context.namespace,ns);
  assert.equal(next.project.identityAllocation.namespaces[ns].building,1);
  assert.equal(next.project.identityAllocation.namespaces[other].building,19);
  assert.equal(next.project.city.buildings[0].id,formatAllocatedIdentity('building',ns,1));
  assert.notEqual(next.project.city,f.candidateCity);
  assert.notEqual(next.project.identityAllocation,f.receipt.nextState);
});
test('IDA discarding prepared allocation consumes no IDs or history',()=>{
  const f=fixture(),before=snapshot(f);
  const first=prepareAcceptedIdentityTransaction(f),second=prepareAcceptedIdentityTransaction(f);
  assert.deepEqual(first,second);
  assert.equal(snapshot(f),before);
  assert.equal(f.history.length,0);
});
test('IDA nonallocating edit advances accepted revision without persisting a fresh namespace',()=>{
  const f=fixture({allocate:false}),before=snapshot(f),next=prepareAcceptedIdentityTransaction(f);
  assert.equal(snapshot(f),before);
  assert.equal(next.context.revision,8);
  assert.deepEqual(next.project.identityAllocation,f.project.identityAllocation);
  assert.equal(Object.hasOwn(next.project.identityAllocation.namespaces,ns),false);
});
test('IDA domain guard sees the verified full project rather than a receipt-controlled root',()=>{
  const f=fixture();
  let calls=0;
  f.validateDomain=(before,after)=>{
    calls++;
    assert.equal(before.schemaVersion,11);
    assert.equal(after.identityAllocation.namespaces[ns].building,1);
    assert.equal(after.seed,before.seed);
    assert.deepEqual(after.options,before.options);
    return true;
  };
  prepareAcceptedIdentityTransaction(f);
  assert.equal(calls,1);
});
for(const [name,alter] of [
  ['stale revision',f=>f.context.revision++],
  ['wrong project binding',f=>f.context.projectId='other-project'],
  ['wrong session namespace',f=>f.context.namespace=other],
  ['changed host request',f=>f.requests[0].key='different'],
  ['receipt counter rollback',f=>f.receipt.nextState.namespaces[other].building--],
  ['receipt counter leap',f=>f.receipt.nextState.namespaces[ns].building++],
  ['missing reserved replacement',f=>f.candidateCity=copyJson(f.project.city)],
  ['unreserved new legacy ID',f=>f.candidateCity.buildings[0].id='BLD-NEW-LEGACY'],
  ['unreserved retired ID',f=>f.candidateCity.buildings[0].id=formatAllocatedIdentity('building',other,2)],
  ['invalid geometry',f=>f.candidateCity.buildings[0].area=-1],
  ['invalid JSON value',f=>f.candidateCity.extra=Infinity],
  ['invalid ownership',f=>f.candidateCity.buildings[0].propertyId='missing-property'],
  ['invalid accepted allocator',f=>delete f.project.identityAllocation],
  ['unsupported schema',f=>f.project.schemaVersion=10],
  ['missing domain validator',f=>delete f.validateDomain],
  ['refused domain permission',f=>f.validateDomain=()=>false],
  ['domain validator throws',f=>f.validateDomain=()=>{throw Error('domain failure');}],
  ['domain validator alters candidate',f=>f.validateDomain=(before,after)=>{after.city.name='Tampered';return true;}],
  ['domain validator alters baseline copy',f=>f.validateDomain=before=>{before.city.name='Tampered';return true;}],
  ['missing history baseline',f=>f.history.clear()],
  ['stale history baseline',f=>{const p=copyJson(f.project);p.city.name='Other';f.history.clear(p);}],
  ['missing transaction metadata',f=>delete f.transaction.label],
  ['revision exhausted',f=>f.context.revision=Number.MAX_SAFE_INTEGER]
]){
  test('IDA preparation rejects '+name+' without committing anything',()=>{
    const f=fixture();alter(f);const before=snapshot(f);
    assert.throws(()=>prepareAcceptedIdentityTransaction(f));
    assert.equal(snapshot(f),before);
  });
}
test('IDA oversized history refuses allocation without consuming it',()=>{
  const f=fixture({maxBytes:1024}),before=snapshot(f);
  assert.throws(()=>prepareAcceptedIdentityTransaction(f),/history preflight/);
  assert.equal(snapshot(f),before);
});
test('IDA no-op cannot consume a revision or create history',()=>{
  const f=fixture({allocate:false});
  f.candidateCity=copyJson(f.project.city);
  const before=snapshot(f);
  assert.throws(()=>prepareAcceptedIdentityTransaction(f),/no city change/);
  assert.equal(snapshot(f),before);
});

test('S1-B2 validator snapshots cannot alias the prepared root, geometry or original inputs',()=>{
  const f=fixture();
  f.project.opaqueS1={nested:{label:'retained'},items:[1,{tag:'original'}]};
  f.history.clear(f.project);
  const baseline=JSON.stringify(f.project),keys=Object.keys(f.project);
  let oldInput,newInput;
  f.validateDomain=(before,after)=>{
    oldInput=before;newInput=after;
    assert.equal(JSON.stringify(before),baseline);
    assert.deepEqual(Object.keys(after),keys);
    assert.notEqual(before.opaqueS1,after.opaqueS1);
    assert.ok(Object.getOwnPropertyDescriptor(before.city.buildings[0],'footprint')?.get);
    assert.ok(Object.getOwnPropertyDescriptor(after.city.buildings[0],'footprint')?.get);
    return true;
  };
  const next=prepareAcceptedIdentityTransaction(f),exact=JSON.stringify(next.project);
  assert.deepEqual(Object.keys(next.project),keys);
  assert.deepEqual(next.project.opaqueS1,f.project.opaqueS1);
  assert.notEqual(next.project.opaqueS1,oldInput.opaqueS1);
  oldInput.opaqueS1.nested.label='retained callback mutated old';
  oldInput.options.center.x+=1;
  oldInput.city.buildings[0].geometry.regions[0].ring[0].x+=1;
  newInput.opaqueS1.items[1].tag='retained callback mutated new';
  newInput.city.buildings[0].customName='wrong';
  assert.equal(JSON.stringify(next.project),exact);
  assert.equal(JSON.stringify(f.project),baseline);
  assert.equal(JSON.stringify(f.history.baseline),baseline);
});

test('S1-B2 baseline and opaque root mutation during validation still refuse atomically',()=>{
  for(const mutate of [
    before=>{before.options.center.x+=1;},
    before=>{before.opaqueS1.nested.label='wrong';},
    before=>{const value=before.opaqueS1;delete before.opaqueS1;before.opaqueS1=value;before.seed='changed';}
  ]){
    const f=fixture();
    f.project.opaqueS1={nested:{label:'retained'}};
    f.history.clear(f.project);
    const baseline=snapshot(f);
    f.validateDomain=before=>{mutate(before);return true;};
    assert.throws(()=>prepareAcceptedIdentityTransaction(f),/Independent domain validation/);
    assert.equal(snapshot(f),baseline);
  }
});

test('S1-B2 external baseline changes during validation remain independently detected',()=>{
  const f=fixture();
  f.validateDomain=()=>{f.project.options.center.x+=1;return true;};
  const history=JSON.stringify(f.history);
  assert.throws(()=>prepareAcceptedIdentityTransaction(f),/baseline changed/);
  assert.equal(JSON.stringify(f.history),history);
});
