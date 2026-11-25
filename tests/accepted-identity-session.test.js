import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { copyJson } from '../src/data/project-format.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { AcceptedIdentitySession } from '../src/core/accepted-identity-session.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';

const base=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ns='0123456789abcdef0123456789abcdef',other='f'.repeat(32);
const context={projectId:'adopted-session',revision:7,namespace:ns};
const transaction={family:'building',operation:'test-replacement',label:'Replace building',targetIds:[]};
function fixture(options={}){
  const project=copyJson(base);
  project.identityAllocation={version:1,namespaces:{[other]:{building:19}}};
  const history=new AcceptedEditHistoryD01(options);
  history.clear(project);
  const session=new AcceptedIdentitySession({project,context,history});
  return {project,history,session};
}
function intent(session,allocate=true){
  const {project}=session.read(),candidateCity=copyJson(project.city);
  const requests=allocate?[{type:'building',key:'replacement'}]:[];
  const receipt=structuredClone(session.reserve(requests));
  if(allocate){
    const building=candidateCity.buildings[0],oldId=building.id;
    building.id=receipt.allocations[0].id;
    const property=candidateCity.properties.find(p=>p.id===building.propertyId);
    property.buildingIds=property.buildingIds.map(id=>id===oldId?building.id:id);
  }else candidateCity.buildings[0].customName='New name';
  // Test-only stand-in for a trusted domain authority.
  return {requests,receipt,candidateCity,transaction,validateDomain:()=>true};
}
function snapshot(session){return JSON.stringify({read:session.read(),ledger:session.copyHistory()});}
test('IDA coordinator commits city, allocation, revision and one D01 entry together',()=>{
  const {session,history}=fixture(),edit=intent(session),before=session.read();
  const result=session.commit(edit),ledger=session.copyHistory();
  assert.equal(result.context.revision,8);
  assert.equal(result.project.city.buildings[0].id,formatAllocatedIdentity('building',ns,1));
  assert.equal(result.project.identityAllocation.namespaces[ns].building,1);
  assert.equal(result.project.identityAllocation.namespaces[other].building,19);
  assert.equal(ledger.length,1);
  assert.deepEqual(ledger.entry('undo').from,before.project);
  assert.deepEqual(ledger.entry('undo').to,result.project);
  assert.deepEqual(ledger.baseline,result.project);
  assert.equal(history.length,0);
  assert.deepEqual(session.read(),{project:result.project,context:result.context,history:result.history});
});
test('IDA coordinator rejects a second competing receipt after successful acceptance',()=>{
  const {session}=fixture(),a=intent(session),b=intent(session);
  session.commit(a);
  const before=snapshot(session);
  assert.throws(()=>session.commit(b),/Stale/);
  assert.equal(snapshot(session),before);
  const next=session.commit(intent(session));
  assert.equal(next.project.identityAllocation.namespaces[ns].building,2);
  assert.equal(next.context.revision,9);
});
test('IDA coordinator nonallocating acceptance invalidates old reservations',()=>{
  const {session}=fixture(),stale=intent(session);
  const result=session.commit(intent(session,false));
  assert.equal(result.context.revision,8);
  assert.equal(Object.hasOwn(result.project.identityAllocation.namespaces,ns),false);
  const before=snapshot(session);
  assert.throws(()=>session.commit(stale),/Stale/);
  assert.equal(snapshot(session),before);
});
test('IDA coordinator reserves and cancels without publishing a state or history change',()=>{
  const {session}=fixture(),before=snapshot(session);
  const first=intent(session),second=intent(session);
  assert.deepEqual(first.receipt,second.receipt);
  assert.equal(snapshot(session),before);
});
test('IDA coordinator imports and returns detached accepted state and ledger',()=>{
  const {session,project,history}=fixture();
  project.city.name='External change';
  history.clear(project);
  const before=session.read();
  const result=session.commit(intent(session));
  const saved=snapshot(session);
  result.project.city.name='Caller change';
  result.project.identityAllocation.namespaces[ns].building=999;
  result.context.revision=999;
  result.history.entries[0].label='Caller change';
  const exposed=session.copyHistory();
  exposed.past[0].to.city.name='Ledger change';
  exposed.clear();
  const read=session.read();read.project.city.name='Read change';
  assert.notEqual(before.project.city.name,project.city.name);
  assert.equal(snapshot(session),saved);
});
test('IDA coordinator preserves bounded history pruning without rewinding counters',()=>{
  const {session}=fixture({maxEntries:1});
  session.commit(intent(session));
  const next=session.commit(intent(session));
  assert.equal(next.pruned,1);
  assert.equal(next.history.entries.length,1);
  assert.equal(next.history.entries[0].serial,2);
  assert.equal(next.project.identityAllocation.namespaces[ns].building,2);
  assert.equal(session.copyHistory().length,1);
});
test('IDA coordinator rejects reentrant acceptance and leaves all state unchanged',()=>{
  const {session}=fixture(),edit=intent(session),before=snapshot(session);
  edit.validateDomain=()=>session.commit(intent(session,false));
  assert.throws(()=>session.commit(edit),/Reentrant/);
  assert.equal(snapshot(session),before);
  assert.equal(session.commit(intent(session)).context.revision,8);
});
for(const [name,alter] of [
  ['domain refusal',e=>e.validateDomain=()=>false],
  ['domain exception',e=>e.validateDomain=()=>{throw Error('domain failure');}],
  ['async domain result',e=>e.validateDomain=()=>Promise.resolve(true)],
  ['mutated domain copy',e=>e.validateDomain=(a,b)=>{b.city.name='Wrong';return true;}],
  ['bad geometry',e=>e.candidateCity.buildings[0].area=-1],
  ['bad counter',e=>e.receipt.nextState.namespaces[ns].building++],
  ['bad request',e=>e.requests[0].key='wrong'],
  ['bad history metadata',e=>e.transaction={family:'building'}],
  ['foreign revision',e=>e.receipt.binding.revision++],
  ['foreign project',e=>e.receipt.binding.projectId='elsewhere'],
  ['foreign namespace',e=>e.receipt.binding.namespace=other]
]){
  test('IDA coordinator fails atomically on '+name,()=>{
    const {session}=fixture(),e=intent(session);alter(e);
    const before=snapshot(session);
    assert.throws(()=>session.commit(e));
    assert.equal(snapshot(session),before);
    assert.equal(session.commit(intent(session)).project.identityAllocation.namespaces[ns].building,1);
  });
}
test('IDA coordinator refuses an oversized history entry without publishing',()=>{
  const {session}=fixture({maxBytes:1024}),before=snapshot(session);
  assert.throws(()=>session.commit(intent(session)),/history preflight/);
  assert.equal(snapshot(session),before);
});
test('IDA coordinator refuses adoption with unrelated history baseline',()=>{
  const {project,history}=fixture();
  const altered=copyJson(project);altered.city.name='Other';history.clear(altered);
  assert.throws(()=>new AcceptedIdentitySession({project,context,history}),/baseline/);
});
test('IDA coordinator preserves existing history when adopting a trusted ledger',()=>{
  const {project,history}=fixture();
  const next=copyJson(project);next.city.buildings[0].customName='Earlier edit';
  assert.equal(history.record(project,next,transaction).status,'recorded');
  const session=new AcceptedIdentitySession({project:next,context,history});
  assert.equal(session.read().history.entries.length,1);
  const result=session.commit(intent(session));
  assert.equal(result.history.entries.length,2);
  assert.equal(history.length,1);
});
test('IDA coordinator refuses exhausted history serial before accepting',()=>{
  const {project,history}=fixture();history.serial=Number.MAX_SAFE_INTEGER;
  const session=new AcceptedIdentitySession({project,context,history}),before=snapshot(session);
  assert.throws(()=>session.commit(intent(session)),/serial exhausted/);
  assert.equal(snapshot(session),before);
});
