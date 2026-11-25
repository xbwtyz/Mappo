import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { copyJson, defaultWorkspace, createProjectDocument } from '../src/data/project-format.js';
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

function replaySession(session,direction,overrides={}){
  const {context,project}=session.read();
  return session.replay({direction,context,workspace:defaultWorkspace(project),...overrides});
}
test('IDA atomic replay restores city and history together while retaining allocation',()=>{
  const {session}=fixture(),before=session.read(),committed=session.commit(intent(session));
  const undone=replaySession(session,'undo');
  assert.deepEqual(undone.project.city,before.project.city);
  assert.deepEqual(undone.project.identityAllocation,committed.project.identityAllocation);
  assert.equal(undone.context.revision,9);
  assert.equal(undone.history.entries[0].direction,'redo');
  assert.deepEqual(session.copyHistory().baseline,undone.project);
  const redone=replaySession(session,'redo');
  assert.deepEqual(redone.project,committed.project);
  assert.equal(redone.context.revision,10);
  assert.equal(redone.history.entries[0].direction,'undo');
});
test('IDA repeated replay never allocates again',()=>{
  const {session}=fixture(),accepted=session.commit(intent(session));
  for(let i=0;i<3;i++){
    replaySession(session,'undo');
    const result=replaySession(session,'redo');
    assert.deepEqual(result.project,accepted.project);
    assert.equal(result.history.serial,1);
  }
  assert.equal(session.read().context.revision,14);
});
test('IDA replay invalidates pending allocation receipts on undo',()=>{
  const {session}=fixture();session.commit(intent(session));
  const stale=intent(session);replaySession(session,'undo');
  const before=snapshot(session);
  assert.throws(()=>session.commit(stale),/Stale/);
  assert.equal(snapshot(session),before);
});
test('IDA replay invalidates pending allocation receipts on redo',()=>{
  const {session}=fixture();session.commit(intent(session));replaySession(session,'undo');
  const stale=intent(session);replaySession(session,'redo');
  const before=snapshot(session);
  assert.throws(()=>session.commit(stale),/Stale/);
  assert.equal(snapshot(session),before);
});
test('IDA new edit after undo cuts redo branch but never reuses its ID',()=>{
  const {session}=fixture(),first=session.commit(intent(session));
  replaySession(session,'undo');
  const next=session.commit(intent(session));
  assert.notEqual(next.project.city.buildings[0].id,first.project.city.buildings[0].id);
  assert.equal(next.project.identityAllocation.namespaces[ns].building,2);
  assert.equal(session.copyHistory().future.length,0);
  assert.throws(()=>replaySession(session,'redo'),/No accepted redo/);
});
test('IDA undo deletion restores an original allocated building without a new reservation',()=>{
  const {session}=fixture(),created=session.commit(intent(session)),edit=intent(session,false);
  const building=edit.candidateCity.buildings.shift();
  const property=edit.candidateCity.properties.find(p=>p.id===building.propertyId);
  property.buildingIds=property.buildingIds.filter(id=>id!==building.id);
  session.commit(edit);
  const undone=replaySession(session,'undo');
  assert.deepEqual(undone.project,created.project);
  assert.equal(undone.project.identityAllocation.namespaces[ns].building,1);
});
test('IDA redo deletion keeps retired allocation high-water marks',()=>{
  const {session}=fixture();session.commit(intent(session));
  const edit=intent(session,false),building=edit.candidateCity.buildings.shift();
  const property=edit.candidateCity.properties.find(p=>p.id===building.propertyId);
  property.buildingIds=property.buildingIds.filter(id=>id!==building.id);
  const deleted=session.commit(edit);
  replaySession(session,'undo');
  const again=replaySession(session,'redo');
  assert.deepEqual(again.project,deleted.project);
  assert.equal(again.project.identityAllocation.namespaces[ns].building,1);
});
test('IDA history expiration limits replay without losing allocation history',()=>{
  const {session}=fixture({maxEntries:1});session.commit(intent(session));session.commit(intent(session));
  const undone=replaySession(session,'undo');
  assert.equal(undone.project.identityAllocation.namespaces[ns].building,2);
  const before=snapshot(session);
  assert.throws(()=>replaySession(session,'undo'),/No accepted undo/);
  assert.equal(snapshot(session),before);
  assert.equal(session.commit(intent(session)).project.identityAllocation.namespaces[ns].building,3);
});
test('IDA replay leaves supplied workspace and returned data detached',()=>{
  const {session}=fixture();session.commit(intent(session));
  const workspace=defaultWorkspace(session.read().project),before=JSON.stringify(workspace);
  const result=replaySession(session,'undo',{workspace}),after=snapshot(session);
  assert.equal(JSON.stringify(workspace),before);
  result.workspace.view.camera.zoom=123;
  result.project.city.name='Tampered';
  result.context.revision=999;
  result.history.entries[0].label='Tampered';
  assert.equal(snapshot(session),after);
});
test('IDA replay clears selection of entity removed by undo',()=>{
  const {session}=fixture(),accepted=session.commit(intent(session));
  // A real portable workspace includes the standard UI subrecords supplied
  // by createProjectDocument. Keep the exact roundtrip gate intact.
  const draft=defaultWorkspace(accepted.project);
  draft.ui={selection:{kind:'building',id:accepted.project.city.buildings[0].id}};
  const workspace=createProjectDocument(accepted.project,draft).workspace;
  const before=JSON.stringify(workspace),expected=copyJson(workspace);
  expected.ui.selection=null;
  const result=replaySession(session,'undo',{workspace});
  assert.equal(result.workspace.ui.selection,null);
  assert.deepEqual(result.workspace,expected);
  assert.equal(JSON.stringify(workspace),before);
  assert.equal(workspace.ui.selection.id,accepted.project.city.buildings[0].id);
});
test('IDA replay refuses a noncanonical partial UI workspace without publishing',()=>{
  const {session}=fixture(),accepted=session.commit(intent(session));
  const workspace=defaultWorkspace(accepted.project);
  workspace.ui={selection:{kind:'building',id:accepted.project.city.buildings[0].id}};
  const before=snapshot(session),workspaceBefore=JSON.stringify(workspace);
  assert.throws(()=>replaySession(session,'undo',{workspace}),/Portable project verification changed/);
  assert.equal(snapshot(session),before);
  assert.equal(JSON.stringify(workspace),workspaceBefore);
});
for(const [name,alter] of [
  ['stale revision',c=>({...c,revision:c.revision-1})],
  ['future revision',c=>({...c,revision:c.revision+1})],
  ['foreign project',c=>({...c,projectId:'wrong'})],
  ['foreign namespace',c=>({...c,namespace:other})],
  ['extra context field',c=>({...c,extra:true})],
  ['missing context',()=>undefined]
]){
  test('IDA replay rejects '+name+' without changing state',()=>{
    const {session}=fixture();session.commit(intent(session));
    const before=snapshot(session);
    assert.throws(()=>replaySession(session,'undo',{context:alter(session.read().context)}),/Stale/);
    assert.equal(snapshot(session),before);
  });
}
for(const [name,options] of [
  ['invalid direction',{direction:'rewind'}],
  ['no workspace',{workspace:undefined}],
  ['invalid workspace',{workspace:{schemaVersion:99}}],
  ['non-JSON workspace',{workspace:{invalid:Infinity}}]
]){
  test('IDA replay refuses '+name+' atomically',()=>{
    const {session}=fixture();session.commit(intent(session));
    const before=snapshot(session);
    assert.throws(()=>replaySession(session,'undo',options));
    assert.equal(snapshot(session),before);
  });
}
test('IDA replay refuses reentrant undo inside a domain validator',()=>{
  const {session}=fixture();session.commit(intent(session));
  const edit=intent(session),before=snapshot(session);
  edit.validateDomain=()=>replaySession(session,'undo');
  assert.throws(()=>session.commit(edit),/Reentrant/);
  assert.equal(snapshot(session),before);
});
test('IDA replay refuses a stale command after a prior undo',()=>{
  const {session}=fixture();session.commit(intent(session));session.commit(intent(session));
  const old=session.read().context;replaySession(session,'undo');
  const before=snapshot(session);
  assert.throws(()=>replaySession(session,'undo',{context:old}),/Stale/);
  assert.equal(snapshot(session),before);
});
test('IDA replay refuses revision exhaustion without moving the history cursor',()=>{
  const {session}=fixture(),accepted=session.commit(intent(session));
  const exhausted=new AcceptedIdentitySession({project:accepted.project,
    context:{...accepted.context,revision:Number.MAX_SAFE_INTEGER},history:session.copyHistory()});
  const before=snapshot(exhausted);
  assert.throws(()=>replaySession(exhausted,'undo'),/revision exhausted/);
  assert.equal(snapshot(exhausted),before);
});
test('IDA replay rejects empty history without creating a new revision',()=>{
  const {session}=fixture(),before=snapshot(session);
  assert.throws(()=>replaySession(session,'undo'),/No accepted undo/);
  assert.equal(snapshot(session),before);
});
test('IDA replay preserves original snapshots rather than rewriting their counters',()=>{
  const {session}=fixture();session.commit(intent(session));session.commit(intent(session));
  const original=session.copyHistory().past;
  replaySession(session,'undo');replaySession(session,'undo');
  assert.deepEqual(session.copyHistory().future.slice().reverse(),original);
  assert.equal(session.read().project.identityAllocation.namespaces[ns].building,2);
});

test('IDA explicitly opted-in ordinary oversized edit publishes counters with the existing D01 barrier',()=>{
 const {session}=fixture({maxBytes:1024});
 const e=intent(session);e.transaction={family:'property',operation:'property-create',label:'Create property',targetIds:[]};
 e.historyPolicy='legacy-ordinary';
 const out=session.commit(e);
 assert.equal(out.historyStatus,'oversize');assert.equal(out.context.revision,8);
 assert.equal(out.history.entries.length,0);assert.match(out.history.notice,/exceeded/);
 assert.equal(out.project.identityAllocation.namespaces[ns].building,1);
 assert.deepEqual(session.copyHistory().baseline,out.project);
 assert.equal(session.view().history.can('undo',out.project),false);
 const next=intent(session);next.transaction=e.transaction;next.historyPolicy=e.historyPolicy;
 assert.equal(session.commit(next).project.identityAllocation.namespaces[ns].building,2);
});
test('IDA legacy oversize policy cannot bypass group, demolition or component history protection',()=>{
 const {session}=fixture({maxBytes:1024}),before=snapshot(session);
 for(const [family,operation] of [['road','translate-road-group'],['road','translate-road-group-demolition'],['building','building-structure']]){
  const e=intent(session);e.transaction={family,operation,label:'Protected',targetIds:[]};e.historyPolicy='legacy-ordinary';
  assert.throws(()=>session.commit(e),/history policy/);assert.equal(snapshot(session),before);
 }
});
test('IDA ordinary capacity policy does not bypass domain refusal or stale receipt',()=>{
 const {session}=fixture({maxBytes:1024}),before=snapshot(session);
 const e=intent(session);e.transaction={family:'identity',operation:'identity-change',label:'Rename',targetIds:[]};
 e.historyPolicy='legacy-ordinary';e.validateDomain=()=>false;
 assert.throws(()=>session.commit(e),/domain validation/);assert.equal(snapshot(session),before);
 e.validateDomain=()=>true;e.receipt.binding.revision++;
 assert.throws(()=>session.commit(e),/Stale/);assert.equal(snapshot(session),before);
});

test('S1-B1 history availability memoizes only the exact published revision',()=>{
  const {session}=fixture();
  session.commit(intent(session));
  const first=session.view(),original=AcceptedEditHistoryD01.prototype.can;
  let calls=0;
  AcceptedEditHistoryD01.prototype.can=function(...args){calls++;return original.apply(this,args);};
  try{
    for(let i=0;i<5;i++){
      assert.equal(first.history.can('undo',first.project),true);
      assert.equal(first.history.can('redo',first.project),false);
    }
    assert.equal(calls,2,'one original comparison per direction and view');
    const detached=copyJson(first.project);
    assert.equal(first.history.can('undo',detached),true);
    detached.city.name='Different city';
    assert.equal(first.history.can('undo',detached),false);
    detached.city.name=first.project.city.name;
    assert.equal(first.history.can('undo',detached),true);
    assert.equal(calls,5,'mutable caller-owned input is never cached');
    const beforeReplay=calls;
    replaySession(session,'undo');
    assert.ok(calls>beforeReplay,'actual replay independently checks the ledger');
    const second=session.view();
    assert.notEqual(second,first);
    assert.equal(second.history.can('undo',second.project),false);
    assert.equal(second.history.can('redo',second.project),true);
    assert.equal(second.history.can('redo',first.project),false);
    assert.equal(first.history.can('undo',first.project),true,'historical view remains historical');
    replaySession(session,'redo');
    const third=session.view();
    assert.equal(third.history.can('undo',third.project),true);
    assert.equal(third.history.can('redo',third.project),false);
    assert.deepEqual(third.project,first.project);
  }finally{AcceptedEditHistoryD01.prototype.can=original;}
});

test('S1-B1 cached availability follows branching and oversize history barriers',()=>{
  const {session}=fixture({maxEntries:1});
  session.commit(intent(session));replaySession(session,'undo');
  const undone=session.view();
  assert.equal(undone.history.can('redo',undone.project),true);
  const oldCounter=undone.project.identityAllocation.namespaces[ns].building;
  session.commit(intent(session));
  const branched=session.view();
  assert.equal(branched.history.can('redo',branched.project),false);
  assert.equal(branched.history.can('undo',branched.project),true);
  assert.equal(branched.project.identityAllocation.namespaces[ns].building,oldCounter+1);
  const tiny=fixture({maxBytes:1024}).session,edit=intent(tiny);
  edit.transaction={family:'property',operation:'property-create',label:'Create property',targetIds:[]};
  edit.historyPolicy='legacy-ordinary';
  tiny.commit(edit);
  const view=tiny.view();
  assert.equal(view.history.can('undo',view.project),false);
  assert.equal(view.history.can('redo',view.project),false);
  assert.throws(()=>replaySession(tiny,'undo'),/No accepted undo/);
});
