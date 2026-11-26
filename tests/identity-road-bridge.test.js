import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {SecureIdentityHost} from '../src/core/secure-identity-host.js';
import {prepareNeighborhoodReflowC3,prepareJunctionReflowC7,prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {prepareRoadTopologyReflowC3} from '../src/core/road-topology-reflow.js';
import {createLareDemolitionSession,iterateLareDemolition,authorizeLareDemolition,cancelLareDemolition} from '../src/core/reconciliation-demolition.js';
import {validateRoadApplyC2,validateRoadGroupApplyB1} from '../src/editor/road-application.js';
import {roadIdentityRequests,allocateRoadCandidate} from '../src/core/road-identity-delta.js';
import {reconcileRoadWorkspace} from '../src/editor/road-workspace.js';
import {junctionPreviewMessage,calculateJunctionPreviewP1} from '../src/worker/junction-preview-worker.js';
import {beginRoadIdentityApply,commitRoadIdentityApply,cancelRoadIdentityApply} from '../src/editor/road-transaction-bridge.js';
import {copyJson,defaultWorkspace,roundTripProjectDocument} from '../src/data/project-format.js';

function setup(seed,morphology,irregularProperties=false){
  let n=0;const h=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(++n);return a;}}});
  h.adopt(createProject({seed,morphology,size:'small',irregularProperties}));
  const p=h.view().project,w=defaultWorkspace(p);
  const s={project:p,city:p.city,revision:2,settledRevision:2,pending:true,active:true,
    acceptedFingerprint:JSON.stringify(p),previewGeometry:{verified:true},buildingDecisions:new Map(),
    ownershipChoices:new Map(),parcelChoices:new Map(),current(){return this.active&&h.view().project===p;}};
  return {h,p,w,s};
}
function road(){
  const f=setup('c2-planned','planned'),s=f.s;
  s.selection={kind:'road',id:'RD-0113'};s.roadIntentOffset={x:12,y:0};
  s.reconciliation=prepareNeighborhoodReflowC3(copyJson(f.p),s.selection.id,s.roadIntentOffset);
  assert.ok(s.reconciliation.candidateProject);return f;
}
function junction(){
  const f=setup('c2-organic','organic'),s=f.s;
  s.selection={kind:'junction',id:'N-0139'};
  const node=f.p.city.nodes.find(n=>n.id===s.selection.id);
  s.point={x:node.x,y:node.y+15};
  const preview=junctionPreviewMessage(calculateJunctionPreviewP1({project:copyJson(f.p),junctionId:s.selection.id,point:s.point}));
  s.reconciliation=preview.reconciliation;s.previewGeometry=preview.previewGeometry;
  assert.ok(s.reconciliation.candidateJson);return f;
}
function worker(request){
  const project=copyJson(JSON.parse(request.projectJson));
  return validateRoadApplyC2(project,request.workspace,{selection:{kind:'junction',id:request.junctionId},
    point:request.point,targetJunctionId:request.targetJunctionId,buildingDecisions:new Map(request.decisions),
    ownershipChoices:new Map(request.ownershipChoices),parcelChoices:new Map(request.parcelChoices)},request.inspected);
}
function begin(f,asyncWorker=false){return beginRoadIdentityApply(f.h,f.w,f.s,5,5,{asyncWorker,savedDistrictCount:0});}
function commit(f,b,reply){return commitRoadIdentityApply(f.h,b.token,f.w,f.s,5,reply);}
test('IDA road bridge applies actual neighborhood regeneration with one accepted history entry',()=>{
  const f=road(),view=f.h.view(),b=begin(f);
  assert.equal(f.h.view(),view);const out=commit(f,b);
  assert.ok(out.project.city.buildings.some(row=>row.id.startsWith('BLD-IDA-')));
  assert.equal(out.context.revision,1);
  assert.equal(f.h.view().history.length,1);
  assert.throws(()=>commit(f,b),/token/);
});
test('IDA road bridge applies actual topology removal with linked allocated development',()=>{
  const f=setup('c2-radial','radial'),s=f.s;
  s.selection={kind:'road',id:'RD-0099'};s.roadConnectionEdit={kind:'remove'};
  s.reconciliation=prepareRoadTopologyReflowC3(copyJson(f.p),s.selection.id,null,s.roadConnectionEdit);
  assert.ok(s.reconciliation.candidateProject);
  const out=commit(f,begin(f));
  for(const key of ['properties','plots','buildings'])
    assert.ok(out.project.city[key].some(row=>row.id.includes('-IDA-')),key);
  assert.ok(!out.project.city.roads.some(row=>row.id===s.selection.id));
});
test('IDA junction bridge accepts matching compact worker reconstruction',()=>{
  const f=junction(),view=f.h.view(),b=begin(f,true);
  assert.equal(f.h.view(),view);
  const reply=worker(b.workerRequest);assert.ok(reply.ok,JSON.stringify(reply.issues));
  const out=commit(f,b,reply);assert.equal(out.context.revision,1);
});
test('IDA junction bridge refuses altered or missing worker result without any accepted writes',()=>{
  const f=junction(),view=f.h.view();
  for(const mode of ['missing','altered']){
    const b=begin(f,true),reply=mode==='missing'?undefined:worker(b.workerRequest);
    if(reply)reply.ledger=[];
    assert.throws(()=>commit(f,b,reply),/Worker road Apply result/);
    assert.equal(f.h.view(),view);
  }
});
test('IDA road bridge rejects changed revisions, intent, cancellation and foreign session tokens',()=>{
  const f=road(),view=f.h.view();
  let b=begin(f);
  assert.throws(()=>commitRoadIdentityApply(f.h,b.token,f.w,f.s,6),/revision changed/);
  b=begin(f);f.s.roadIntentOffset.x++;
  assert.throws(()=>commit(f,b),/intent changed/);f.s.roadIntentOffset.x--;
  b=begin(f);assert.equal(cancelRoadIdentityApply(b.token),true);
  assert.throws(()=>commit(f,b),/token/);
  b=begin(f);const other=road();
  assert.throws(()=>commitRoadIdentityApply(other.h,b.token,other.w,other.s,5),/token/);
  assert.equal(f.h.view(),view);
  f.h.adopt(f.p);
  assert.throws(()=>commit(f,b),/revision changed/);
});
test('IDA ordinary group bridge uses empty reservation and preserves all entity memberships',()=>{
  const f=setup('c2-planned','planned'),s=f.s;
  s.roadGroupB1={eligible:true,selectedRoadIds:['RD-0113','RD-0114']};s.roadIntentOffset={x:.05,y:0};
  s.reconciliation=prepareRoadGroupReflowB1(f.p,s.roadGroupB1.selectedRoadIds,s.roadIntentOffset,{acceptedRevision:5});
  assert.ok(s.reconciliation.candidateProject,JSON.stringify(s.reconciliation.unresolved));
  const out=commit(f,begin(f));
  assert.deepEqual(out.project.identityAllocation,f.p.identityAllocation);
  for(const key of ['properties','plots','buildings'])assert.deepEqual(out.project.city[key].map(r=>r.id),f.p.city[key].map(r=>r.id));
});
test('IDA authorized demolition bridge rejects fabricated authorization and commits only reviewed removal',()=>{
  const f=setup('lare-linear-2','linear',true),s=f.s;
  const ids=['RD-0174','RD-0252'],offset={x:4,y:3},intent={selectedRoadIds:ids,offset,revision:5};
  s.roadGroupB1={eligible:true,selectedRoadIds:ids};s.roadIntentOffset=offset;
  s.reconciliation=prepareRoadGroupReflowB1(f.p,ids,offset,{acceptedRevision:5});
  assert.equal(s.reconciliation.candidateProject,null);
  const session=createLareDemolitionSession(f.p,intent,s.reconciliation);
  const iter=iterateLareDemolition(session);let step=iter.next();while(!step.done)step=iter.next();
  const reviewed=step.value.candidate;assert.deepEqual(reviewed.removalIds,['BLD-00153']);
  const authorization=authorizeLareDemolition(session,reviewed,f.p,5),view=f.h.view();
  s.demolition={candidate:reviewed,authorization:{}};
  assert.throws(()=>commit(f,begin(f)),/authorization/i);assert.equal(f.h.view(),view);
  s.demolition.authorization=authorization;
  const out=commit(f,begin(f));
  assert.deepEqual(out.project.identityAllocation,f.p.identityAllocation);
  assert.deepEqual(f.p.city.buildings.filter(b=>!out.project.city.buildings.some(n=>n.id===b.id)).map(b=>b.id),reviewed.removalIds);
  const undo=f.h.replay({direction:'undo',context:f.h.view().context,workspace:out.workspace});
  assert.deepEqual(undo.project,f.p);
  cancelLareDemolition(session);
});

test('S1-C1 trusted road evidence rejects valid but different candidate at atomic acceptance',()=>{
  const f=road(),before=f.h.view(),snapshot=JSON.stringify(f.h.read()),b=begin(f);
  const original=f.h.commit.bind(f.h);
  f.h.commit=command=>{
    const changed=copyJson(command.candidateCity);
    changed.buildings[0].customName='Unexpected authored name';
    return original({...command,candidateCity:changed});
  };
  assert.throws(()=>commit(f,b),/Independent domain validation/);
  assert.equal(f.h.view(),before);
  assert.equal(JSON.stringify(f.h.read()),snapshot);
  assert.throws(()=>commit(f,b),/token/);
  f.h.commit=original;
  assert.equal(commit(f,begin(f)).context.revision,1);
});

test('S1-C1 private road evidence rejects intent, workspace and draft revision changes during acceptance',()=>{
  for(const alter of [
    f=>{f.s.roadIntentOffset.x+=1;},
    f=>{f.w.view.camera.zoom+=1;},
    f=>{f.s.revision+=1;}
  ]){
    const f=road(),before=f.h.view(),snapshot=JSON.stringify(f.h.read()),b=begin(f);
    const original=f.h.commit.bind(f.h);
    f.h.commit=command=>{alter(f);return original(command);};
    assert.throws(()=>commit(f,b),/Independent domain validation/);
    assert.equal(f.h.view(),before);
    assert.equal(JSON.stringify(f.h.read()),snapshot);
    assert.throws(()=>commit(f,b),/token/);
  }
});

test('S1-C1 local reconstruction remains independent of a candidate with matching worker ledger',()=>{
  const f=junction(),before=f.h.view(),b=begin(f,true),reply=worker(b.workerRequest);
  assert.ok(reply.ok);
  reply.candidate.city.buildings[0].customName='Unreviewed worker edit';
  assert.throws(()=>commit(f,b,reply),/Worker road Apply result/);
  assert.equal(f.h.view(),before);
  assert.equal(f.h.view().history.length,0);
  const next=begin(f,true);
  assert.equal(commit(f,next,worker(next.workerRequest)).context.revision,1);
});

test('S4 nonallocating connected-road acceptance exactly matches independent portable result and replay',()=>{
  const f=setup('c2-planned','planned'),s=f.s;
  s.roadGroupB1={eligible:true,selectedRoadIds:['RD-0113','RD-0114']};
  s.roadIntentOffset={x:.05,y:0};
  s.reconciliation=prepareRoadGroupReflowB1(f.p,s.roadGroupB1.selectedRoadIds,s.roadIntentOffset,{acceptedRevision:5});
  assert.ok(s.reconciliation.candidateProject);
  const fresh=validateRoadGroupApplyB1(copyJson(f.p),f.w,{
    selectedRoadIds:s.roadGroupB1.selectedRoadIds,offset:s.roadIntentOffset,
    parcelChoices:new Map(),revision:5,acceptedRevision:5
  },s.reconciliation);
  assert.ok(fresh.ok,JSON.stringify(fresh.issues));
  const domain={phase:'B1',status:'candidate-only',candidateProject:fresh.candidate,
    validation:{project:'valid',parcels:'pass'},unresolved:[],ledger:fresh.ledger,changed:fresh.changed};
  const requests=roadIdentityRequests(f.p,domain);
  assert.deepEqual(requests,[]);
  const allocation=allocateRoadCandidate(f.p,domain,f.h.view().context,f.h.reserve(requests));
  const expected=roundTripProjectDocument(allocation.candidate,
    reconcileRoadWorkspace(f.w,f.p.city,allocation.candidate.city));
  // Prove this fixture actually qualifies for the S4 evidence reuse path.
  assert.equal(JSON.stringify(fresh.candidate)===JSON.stringify(allocation.candidate),true);
  assert.equal(JSON.stringify(fresh.workspace)===JSON.stringify(expected.workspace),true);
  const out=commit(f,begin(f));
  assert.deepEqual(out.project,expected.project);
  assert.deepEqual(out.workspace,expected.workspace);
  assert.deepEqual(out.project.identityAllocation,f.p.identityAllocation);
  assert.notEqual(out.workspace,f.w);
  const undo=f.h.replay({direction:'undo',context:f.h.view().context,workspace:out.workspace});
  assert.deepEqual(undo.project,f.p);
  const redo=f.h.replay({direction:'redo',context:f.h.view().context,workspace:undo.workspace});
  assert.deepEqual(redo.project,out.project);
});

test('S4 allocating junction acceptance matches independent allocation and final portable result',()=>{
  const f=junction(),b=begin(f,true),reply=worker(b.workerRequest);
  assert.ok(reply.ok);
  const domain={phase:f.s.reconciliation.phase,status:'candidate-only',candidateProject:reply.candidate,
    validation:{project:'valid',parcels:'pass'},unresolved:[],ledger:reply.ledger,changed:reply.changed};
  const requests=roadIdentityRequests(f.p,domain);
  assert.ok(requests.length>0,'fixture regenerates entities');
  const allocation=allocateRoadCandidate(f.p,domain,f.h.view().context,f.h.reserve(requests));
  const expected=roundTripProjectDocument(allocation.candidate,
    reconcileRoadWorkspace(f.w,f.p.city,allocation.candidate.city));
  const out=commit(f,b,reply);
  assert.deepEqual(out.project,expected.project);
  assert.deepEqual(out.workspace,expected.workspace);
  assert.deepEqual(out.ledger,allocation.ledger);
  assert.deepEqual(out.changed,allocation.changed);
  const undo=f.h.replay({direction:'undo',context:f.h.view().context,workspace:out.workspace});
  assert.deepEqual(undo.project,{...f.p,identityAllocation:out.project.identityAllocation});
  const redo=f.h.replay({direction:'redo',context:f.h.view().context,workspace:undo.workspace});
  assert.deepEqual(redo.project,out.project);
});

test('S4 allocating road acceptance still matches complete final portable roundtrip',()=>{
  const f=road(),out=commit(f,begin(f));
  assert.ok(out.project.city.buildings.some(b=>b.id.startsWith('BLD-IDA-')));
  const decoded=roundTripProjectDocument(out.project,out.workspace);
  assert.deepEqual(decoded.project,out.project);
  assert.deepEqual(decoded.workspace,out.workspace);
});

test('S4 exact intent text detects changed inspected result and map choices before acceptance',()=>{
  for(const change of [
    f=>{f.s.reconciliation.candidateJson+=' ';},
    f=>{f.s.reconciliation.ledger[0].disposition='tampered';},
    f=>{f.s.parcelChoices.set('unknown-parcel','unexpected-choice');},
    f=>{f.s.ownershipChoices.set('unknown-building','unexpected-choice');}
  ]){
    const f=junction(),before=f.h.view(),b=begin(f,true),reply=worker(b.workerRequest);
    change(f);
    assert.throws(()=>commit(f,b,reply),/intent changed/);
    assert.equal(f.h.view(),before);
    assert.throws(()=>commit(f,b,reply),/token/);
  }
});

test('S4 exact intent text remains private and rechecks inspected ledger during host acceptance',()=>{
  const f=junction(),before=f.h.view(),b=begin(f,true),reply=worker(b.workerRequest);
  const original=f.h.commit.bind(f.h);
  f.h.commit=command=>{
    f.s.reconciliation={...f.s.reconciliation,ledger:[...f.s.reconciliation.ledger,{unexpected:'change'}]};
    return original(command);
  };
  assert.throws(()=>commit(f,b,reply),/Independent domain validation/);
  assert.equal(f.h.view(),before);
  assert.equal(before.history.length,0);
});
