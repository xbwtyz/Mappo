import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {SecureIdentityHost} from '../src/core/secure-identity-host.js';
import {prepareNeighborhoodReflowC3,prepareJunctionReflowC7,prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {prepareRoadTopologyReflowC3} from '../src/core/road-topology-reflow.js';
import {createLareDemolitionSession,iterateLareDemolition,authorizeLareDemolition,cancelLareDemolition} from '../src/core/reconciliation-demolition.js';
import {validateRoadApplyC2} from '../src/editor/road-application.js';
import {junctionPreviewMessage,calculateJunctionPreviewP1} from '../src/worker/junction-preview-worker.js';
import {beginRoadIdentityApply,commitRoadIdentityApply,cancelRoadIdentityApply} from '../src/editor/road-transaction-bridge.js';
import {copyJson,defaultWorkspace} from '../src/data/project-format.js';

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
