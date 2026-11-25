import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityAllocationState,formatAllocatedIdentity} from '../src/core/identity-allocation.js';
import {issueIdentityReservation,verifyIdentityReservation,verifyIdentityAdditions,
  validateActiveIdentityInventory} from '../src/core/identity-verification.js';
const ns='0123456789abcdef0123456789abcdef',other='f'.repeat(32);
const context={projectId:'document-instance',revision:7,namespace:ns};
const req=[{type:'building',key:'b'},{type:'plot',key:'p'}];
const empty=()=>({buildings:[{id:'BLD-00001'}],properties:[{id:'PROP-00001'}],plots:[{id:'PLOT-00001'}]});
const state=()=>({version:1,namespaces:{[ns]:{building:4},[other]:{property:5}}});
const issue=()=>issueIdentityReservation(state(),empty(),context,req);
const verify=(receipt,override={})=>verifyIdentityReservation(override.state??state(),override.city??empty(),
  override.context??context,override.requests??req,receipt);
const clone=structuredClone;

test('IDA independently verifies exact reservation and returns a detached frozen state',()=>{
  const receipt=issue(),result=verify(receipt);
  assert.deepEqual(result,receipt.nextState);
  assert.notEqual(result,receipt.nextState);
  assert.ok(Object.isFrozen(result.namespaces[ns]));
  assert.equal(result.namespaces[ns].building,5);
  assert.equal(result.namespaces[other].property,5);
});
test('IDA active inventory permits retired gaps and covered identifiers',()=>{
  const city=empty();city.buildings.push({id:formatAllocatedIdentity('building',ns,1)});
  assert.equal(validateActiveIdentityInventory(state(),city),true);
  assert.equal(validateActiveIdentityInventory(state(),empty()),true);
});
for(const [name,alter] of [
  ['wrong type',c=>c.plots.push({id:formatAllocatedIdentity('building',ns,1)})],
  ['counter ahead',c=>c.buildings.push({id:formatAllocatedIdentity('building',ns,5)})],
  ['unknown namespace',c=>c.buildings.push({id:formatAllocatedIdentity('building',other,1)})],
  ['malformed reserved ID',c=>c.buildings.push({id:'BLD-IDA-bad'})],
  ['duplicate ID',c=>c.buildings.push({...c.buildings[0]})],
  ['unsupported collection',c=>c.roads=[{id:formatAllocatedIdentity('building',ns,1)}]],
  ['missing inventory',c=>delete c.plots]
]){
  test('IDA inventory rejects '+name,()=>{const city=empty();alter(city);
    assert.throws(()=>validateActiveIdentityInventory(state(),city));});
}
for(const [name,mutate] of [
  ['stale revision',r=>r.binding.revision++],
  ['different project',r=>r.binding.projectId='other'],
  ['different namespace',r=>r.binding.namespace=other],
  ['wrong version',r=>r.version=2],
  ['missing row',r=>r.allocations.pop()],
  ['extra row',r=>r.allocations.push(r.allocations[0])],
  ['wrong request key',r=>r.allocations[0].key='forged'],
  ['wrong sequence',r=>r.allocations[0].sequence--],
  ['reused ID',r=>r.allocations[0].id=formatAllocatedIdentity('building',ns,4)],
  ['wrong type',r=>r.allocations[0].type='property'],
  ['counter rollback',r=>r.nextState.namespaces[ns].building--],
  ['counter leap',r=>r.nextState.namespaces[ns].building++],
  ['unrelated counter edit',r=>r.nextState.namespaces[other].property++],
  ['removed namespace',r=>delete r.nextState.namespaces[other]],
  ['extra namespace',r=>r.nextState.namespaces['e'.repeat(32)]={plot:1}],
  ['extra allocation field',r=>r.allocations[0].extra=true]
]){
  test('IDA independent verification rejects '+name,()=>{const receipt=clone(issue());mutate(receipt);
    assert.throws(()=>verify(receipt));});
}
test('IDA verifies against current host inputs, not receipt supplied state',()=>{
  const receipt=issue();
  assert.throws(()=>verify(receipt,{context:{...context,revision:8}}),/Stale/);
  assert.throws(()=>verify(receipt,{state:{version:1,namespaces:{[ns]:{building:5},[other]:{property:5}}}}));
  assert.throws(()=>verify(receipt,{requests:[{type:'building',key:'other'},{type:'plot',key:'p'}]}));
});
test('IDA empty reservation preserves state and does not introduce a namespace',()=>{
  const current=createIdentityAllocationState(),city=empty();
  const receipt=issueIdentityReservation(current,city,context,[]);
  assert.deepEqual(verifyIdentityReservation(current,city,context,[],receipt),current);
});
test('IDA candidate must contain exactly the newly reserved identities',()=>{
  const receipt=issue(),before=empty(),candidate=clone(before);
  for(const row of receipt.allocations)candidate[row.type==='building'?'buildings':'plots'].push({id:row.id});
  assert.deepEqual(verifyIdentityAdditions(state(),before,context,req,receipt,candidate),receipt.nextState);
  const missing=clone(candidate);missing.plots.pop();
  assert.throws(()=>verifyIdentityAdditions(state(),before,context,req,receipt,missing),/missing/);
  const extra=clone(candidate);extra.buildings.push({id:'BLD-LEGACY-NEW'});
  assert.throws(()=>verifyIdentityAdditions(state(),before,context,req,receipt,extra),/Unreserved/);
  const retired=clone(candidate);retired.buildings.push({id:formatAllocatedIdentity('building',ns,3)});
  assert.throws(()=>verifyIdentityAdditions(state(),before,context,req,receipt,retired),/Unreserved/);
  assert.deepEqual(before,empty());
});
