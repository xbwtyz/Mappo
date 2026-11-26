import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from '../src/core/spatial-recovery-delta.js';
import { issueIdentityReservation } from '../src/core/identity-verification.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';

const ns='0123456789abcdef0123456789abcdef',other='abcdef0123456789abcdef0123456789';
const budget=()=>createSpatialPreservationBudget();
const intent={version:1,family:'road',operation:'translate-road-group',projectId:'city-1',revision:7,
  editedRefs:[{collection:'roads',id:'R'}],permissions:{destruction:true,regeneration:true}};
const ctx={projectId:'city-1',revision:7,namespace:ns};
const typeCollections={building:'buildings',property:'properties',plot:'plots'};
function setup(){
  const project={schemaVersion:11,identityAllocation:{version:1,namespaces:{[ns]:{building:4,plot:2},[other]:{property:9}}},
    metadata:{opaque:'preserve'},city:{id:'city-1',roads:[{id:'R'}],
    buildings:[{id:formatAllocatedIdentity('building',ns,4),custom:{preserve:true}}],
    properties:[{id:'P'}],plots:[{id:'Q'}]}};
  const requests=[{type:'property',key:'new-p'},{type:'building',key:'new-b'},{type:'plot',key:'new-q'}];
  const receipt=issueIdentityReservation(project.identityAllocation,project.city,ctx,requests);
  const auth={context:ctx,requests,receipt};
  const candidate=structuredClone(project);
  candidate.city.plots.shift();
  for(const row of receipt.allocations)candidate.city[typeCollections[row.type]].push({id:row.id});
  candidate.identityAllocation=structuredClone(receipt.nextState);
  return {project,candidate,auth};
}
const create=(f,a=f.auth,c=f.candidate,op=intent)=>createSpatialDelta(f.project,c,op,1,budget(),a);
const rebuild=(f,d,a=f.auth,op=intent)=>reconstructSpatialDelta(f.project,op,1,d,budget(),a);
test('SRE identity multi-type retirement and addition replay preserves survivor and opaque state',async()=>{
  const f=setup(),original=JSON.stringify(f.project),candidate=JSON.stringify(f.candidate);
  const d=await create(f);
  assert.equal(d.added.length,3);assert.deepEqual(d.retired,[{collection:'plots',id:'Q'}]);
  assert.equal(d.modified.length,0);
  assert.equal(JSON.stringify(await rebuild(f,d)),candidate);
  assert.equal(JSON.stringify(f.project),original);
  assert.equal(JSON.stringify(f.candidate),candidate);
  assert.equal(f.candidate.identityAllocation.namespaces[other].property,9);
  assert.deepEqual(await create(f),d);
});
const receiptCases=[
  ['wrong project binding',a=>{a.receipt.binding.projectId='elsewhere';}],
  ['stale receipt revision',a=>{a.receipt.binding.revision++;}],
  ['wrong namespace binding',a=>{a.receipt.binding.namespace=other;}],
  ['changed request key',a=>{a.receipt.allocations[0].key='forged';}],
  ['wrong sequence',a=>{a.receipt.allocations[0].sequence++;}],
  ['wrong allocation type',a=>{a.receipt.allocations[0].type='plot';}],
  ['missing allocation',a=>{a.receipt.allocations.pop();}],
  ['extra allocation',a=>{a.receipt.allocations.push(a.receipt.allocations[0]);}],
  ['unrelated counter change',a=>{a.receipt.nextState.namespaces[other].property++;}],
  ['counter rewind',a=>{a.receipt.nextState.namespaces[ns].building=3;}],
  ['extra namespace',a=>{a.receipt.nextState.namespaces['ffffffffffffffffffffffffffffffff']={plot:1};}],
  ['changed host request',a=>{a.requests[0].key='other-request';}],
  ['duplicate host request',a=>{a.requests.push(a.requests[0]);}],
];
for(const [name,mutate] of receiptCases)test('SRE refuses '+name+' on producer and reconstruction',async()=>{
  const f=setup(),d=await create(f),a=structuredClone(f.auth);mutate(a);
  await assert.rejects(create(f,a),/identity|reservation|counter|namespace/i);
  await assert.rejects(rebuild(f,d,a),/identity|reservation|counter|namespace/i);
});
const candidateCases=[
  ['unreserved legacy addition',c=>{c.city.buildings.push({id:'legacy-new'});}],
  ['retired sequence reuse',c=>{c.city.buildings.push({id:formatAllocatedIdentity('building',ns,3)});}],
  ['missing reserved addition',c=>{c.city.buildings.pop();}],
  ['allocated ID in wrong collection',c=>{c.city.plots.push(c.city.buildings.pop());}],
  ['candidate unrelated counter change',c=>{c.identityAllocation.namespaces[other].property++;}],
  ['candidate counter rewind',c=>{c.identityAllocation.namespaces[ns].building=3;}],
  ['infrastructure retirement',c=>{c.city.roads=[];}],
  ['root metadata modification',c=>{c.metadata.opaque='changed';}],
];
for(const [name,mutate] of candidateCases)test('SRE refuses '+name,async()=>{
  const f=setup(),c=structuredClone(f.candidate);mutate(c);
  await assert.rejects(create(f,f.auth,c),/identity|allocation|unauthorized|non-collection/i);
});
test('SRE rejects missing permissions, stale delta version and absent reservation during replay',async()=>{
  const f=setup(),d=await create(f);
  await assert.rejects(create(f,f.auth,f.candidate,{...intent,permissions:{destruction:true}}),/Unauthorized/);
  await assert.rejects(create(f,f.auth,f.candidate,{...intent,permissions:{regeneration:true}}),/Unauthorized/);
  await assert.rejects(rebuild(f,{...d,version:1}),/Stale/);
  await assert.rejects(reconstructSpatialDelta(f.project,intent,1,d,budget()),/fingerprint|Unreserved/);
});
test('SRE rejects altered replay membership and preserves baseline on refusal',async()=>{
  const f=setup(),d=await create(f),before=JSON.stringify(f.project);
  const wrong=structuredClone(d);wrong.added[0].record.id='different';
  await assert.rejects(rebuild(f,wrong),/addition/);
  const duplicate=structuredClone(d);duplicate.added.push(duplicate.added[0]);
  await assert.rejects(rebuild(f,duplicate),/Duplicate/);
  assert.equal(JSON.stringify(f.project),before);
});
test('SRE allocation verification consumes shared work budget on both paths',async()=>{
  const f=setup(),b=budget(),d=await createSpatialDelta(f.project,f.candidate,intent,1,b,f.auth);
  const used=b.snapshot().work;
  await assert.rejects(createSpatialDelta(f.project,f.candidate,intent,1,
    createSpatialPreservationBudget({work:used-1,stateExpansions:1}),f.auth),/budget/);
  const b2=budget();await reconstructSpatialDelta(f.project,intent,1,d,b2,f.auth);
  await assert.rejects(reconstructSpatialDelta(f.project,intent,1,d,
    createSpatialPreservationBudget({work:b2.snapshot().work-1,stateExpansions:1}),f.auth),/budget/);
});
