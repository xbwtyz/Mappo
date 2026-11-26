import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityAllocationState,formatAllocatedIdentity} from '../src/core/identity-allocation.js';
import {normalizeIdentityRequests,reserveAllocatedIdentities,MAX_IDENTITY_RESERVATION_REQUESTS}
  from '../src/core/identity-reservations.js';
const ns='0123456789abcdef0123456789abcdef',other='f'.repeat(32);
const req=(type,key)=>({type,key});
const state=(counters)=>({version:1,namespaces:{[ns]:counters}});
test('IDA reservations are deterministic and independent of input order',()=>{
  const input=[req('plot','z'),req('building','b'),req('building','a'),req('property','p')];
  const original=JSON.stringify(input),before=createIdentityAllocationState();
  const a=reserveAllocatedIdentities(before,ns,input);
  const b=reserveAllocatedIdentities(before,ns,input.slice().reverse());
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.deepEqual(a.allocations.map(x=>[x.type,x.key,x.sequence]),
    [['building','a',1],['building','b',2],['plot','z',1],['property','p',1]]);
  assert.equal(JSON.stringify(input),original);
  assert.deepEqual(before,createIdentityAllocationState());
});
test('IDA reservations continue each counter independently without using gaps',()=>{
  const before=state({building:145,plot:67});
  const snapshot=JSON.stringify(before);
  const result=reserveAllocatedIdentities(before,ns,[req('building','b'),req('plot','q'),req('property','p')]);
  assert.deepEqual(result.nextState.namespaces[ns],{building:146,plot:68,property:1});
  assert.equal(result.allocations[0].id,formatAllocatedIdentity('building',ns,146));
  assert.equal(JSON.stringify(before),snapshot);
});
test('IDA cancellation or retry does not consume a reservation',()=>{
  const before=state({building:2});
  const a=reserveAllocatedIdentities(before,ns,[req('building','candidate-a')]);
  const b=reserveAllocatedIdentities(before,ns,[req('building','candidate-b')]);
  assert.equal(a.allocations[0].id,b.allocations[0].id);
  assert.equal(before.namespaces[ns].building,2);
  // Only a hypothetical accepted nextState advances the subsequent reservation.
  const next=reserveAllocatedIdentities(a.nextState,ns,[req('building','next')]);
  assert.equal(next.allocations[0].sequence,4);
});
test('IDA reservations detach and deeply freeze their output',()=>{
  const before=state({building:2}),requests=[req('building','candidate')];
  const result=reserveAllocatedIdentities(before,ns,requests);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.allocations)&&Object.isFrozen(result.allocations[0]));
  assert.ok(Object.isFrozen(result.nextState)&&Object.isFrozen(result.nextState.namespaces)&&
    Object.isFrozen(result.nextState.namespaces[ns]));
  before.namespaces[ns].building=7;requests[0].key='changed';
  assert.equal(result.nextState.namespaces[ns].building,3);
  assert.equal(result.allocations[0].key,'candidate');
});
test('IDA reservations preserve prior namespaces and allocate in the selected namespace',()=>{
  const before=state({building:2,plot:1});
  const result=reserveAllocatedIdentities(before,other,[req('building','b')]);
  assert.deepEqual(result.nextState.namespaces[ns],before.namespaces[ns]);
  assert.notEqual(result.nextState.namespaces[ns],before.namespaces[ns]);
  assert.equal(result.nextState.namespaces[other].building,1);
  assert.notEqual(result.allocations[0].id,formatAllocatedIdentity('building',ns,1));
});
test('IDA empty reservations never create empty namespace metadata',()=>{
  const before=state({building:2});
  const result=reserveAllocatedIdentities(before,other,[]);
  assert.deepEqual(result.nextState,before);
  assert.deepEqual(result.allocations,[]);
  assert.equal(Object.hasOwn(result.nextState.namespaces,other),false);
});
test('IDA reservations canonicalize counter and namespace insertion order',()=>{
  const a={version:1,namespaces:{[other]:{property:1,building:2},[ns]:{plot:3,building:1}}};
  const b={version:1,namespaces:{[ns]:{building:1,plot:3},[other]:{building:2,property:1}}};
  assert.equal(JSON.stringify(reserveAllocatedIdentities(a,ns,[req('property','p')])),
    JSON.stringify(reserveAllocatedIdentities(b,ns,[req('property','p')])));
});
test('IDA counter exhaustion rejects the whole batch without mutation',()=>{
  const before=state({building:4,plot:Number.MAX_SAFE_INTEGER-1});
  const snapshot=JSON.stringify(before);
  const input=[req('building','b'),req('plot','p1'),req('plot','p2')];
  assert.throws(()=>reserveAllocatedIdentities(before,ns,input),/exhausted/);
  assert.equal(JSON.stringify(before),snapshot);
  const last=reserveAllocatedIdentities(before,ns,[req('plot','p1')]);
  assert.equal(last.allocations[0].sequence,Number.MAX_SAFE_INTEGER);
  assert.throws(()=>reserveAllocatedIdentities(last.nextState,ns,[req('plot','p2')]),/exhausted/);
});
test('IDA reservations reject unknown or ambiguous request keys and types',()=>{
  for(const input of [
    null,{},[null],[{}],[req('road','r')],[req('building','')],[req('building',' x')],
    [req('plot','x\n')],[req('plot','a'.repeat(129))],
    [req('building','same'),req('plot','same')],
    [{...req('plot','p'),unexpected:true}],new Array(1)
  ]) assert.throws(()=>normalizeIdentityRequests(input));
});
test('IDA reservations enforce a bounded batch size',()=>{
  const requests=Array.from({length:MAX_IDENTITY_RESERVATION_REQUESTS},(_,i)=>req('plot','p'+i));
  const result=reserveAllocatedIdentities(createIdentityAllocationState(),ns,requests);
  assert.equal(result.allocations.length,MAX_IDENTITY_RESERVATION_REQUESTS);
  assert.equal(result.nextState.namespaces[ns].plot,MAX_IDENTITY_RESERVATION_REQUESTS);
  assert.throws(()=>normalizeIdentityRequests([...requests,req('plot','overflow')]),/count/);
});
test('IDA reservation validates prior state and namespace even for an empty batch',()=>{
  assert.throws(()=>reserveAllocatedIdentities(state({building:0}),ns,[]));
  assert.throws(()=>reserveAllocatedIdentities(createIdentityAllocationState(),'not-a-namespace',[]));
});
