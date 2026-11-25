import test from 'node:test';
import assert from 'node:assert/strict';
import { AcceptedEditHistoryD01,stageAcceptedPublicationD01,stageAcceptedReplayD01,stageAcceptedReplacementD01 } from '../src/core/accepted-edit-history-d01.js';
import { createProject } from '../src/core/city-model.js';
import { copyJson,defaultWorkspace } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';
const initial=createProject({seed:'ida-central-publication',size:'small',morphology:'planned'});
const tx={family:'identity',operation:'identity-change',label:'Rename property',targetIds:[initial.city.properties[0].id]};
function renamed(project,name){const p=copyJson(project);p.city.properties[0].customName=name;return p;}
function history(maxBytes=64*1024*1024){const h=new AcceptedEditHistoryD01({maxBytes});h.clear(initial);return h;}
test('IDA legacy publication stages exactly one entry without modifying outgoing cursor',()=>{
 const h=history(),next=renamed(initial,'New name'),before=JSON.stringify(h);
 const staged=stageAcceptedPublicationD01(h,initial,next,tx);
 assert.equal(JSON.stringify(h),before);assert.equal(staged.status,'recorded');
 assert.deepEqual(staged.history.baseline,next);assert.equal(staged.history.length,1);
 assert.equal(staged.history.can('undo',next),true);
});
test('IDA stale publication and malformed metadata leave original history untouched',()=>{
 const h=history(),next=renamed(initial,'New name'),before=JSON.stringify(h);
 assert.throws(()=>stageAcceptedPublicationD01(h,next,initial,tx),/baseline/);
 assert.throws(()=>stageAcceptedPublicationD01(h,initial,next,{...tx,label:''}));
 assert.equal(JSON.stringify(h),before);
});
test('IDA legacy oversize barrier remains valid, reversible group still refuses oversize',()=>{
 const h=history(1024),next=renamed(initial,'New name'),before=JSON.stringify(h);
 const staged=stageAcceptedPublicationD01(h,initial,next,tx);
 assert.equal(staged.status,'oversize');assert.equal(staged.history.length,0);
 assert.deepEqual(staged.history.baseline,next);
 assert.throws(()=>stageAcceptedPublicationD01(h,initial,next,tx,{requireRecorded:true}),/recorded/);
 assert.equal(JSON.stringify(h),before);
});
test('IDA no-op publication never creates history',()=>{
 const h=history(),staged=stageAcceptedPublicationD01(h,initial,copyJson(initial),tx);
 assert.equal(staged.status,'unchanged');assert.equal(staged.history.length,0);
 assert.throws(()=>stageAcceptedPublicationD01(h,initial,initial,tx,{requireRecorded:true}));
});
test('IDA staged replay changes only the staged ledger until publication',()=>{
 const next=renamed(initial,'New name'),h=stageAcceptedPublicationD01(history(),initial,next,tx).history;
 const receipt=h.prepare('undo',next,defaultWorkspace(next));assert.ok(receipt.ok,receipt.reason);
 const before=JSON.stringify(h),staged=stageAcceptedReplayD01(h,next,'undo',receipt);
 assert.equal(JSON.stringify(h),before);assert.equal(staged.status,'replayed');
 assert.deepEqual(staged.history.baseline,initial);assert.equal(staged.history.can('redo',initial),true);
 assert.throws(()=>stageAcceptedReplayD01(h,initial,'undo',receipt),/stale/);
});
test('IDA generation or open replacement stages clean ledger without clearing outgoing history',()=>{
 const next=renamed(initial,'New name'),h=stageAcceptedPublicationD01(history(),initial,next,tx).history;
 const before=JSON.stringify(h),staged=stageAcceptedReplacementD01(h,initial,'Opened city.');
 assert.equal(JSON.stringify(h),before);assert.equal(staged.status,'replaced');
 assert.equal(staged.history.length,0);assert.equal(staged.history.notice,'Opened city.');
 assert.deepEqual(staged.history.baseline,initial);
});
test('IDA compiled identity Apply publishes D01 before subsequent workspace refresh and never double records',async()=>{
 const app=await buildingAppHarness(),property=app.state().project.city.properties[0];
 app.state().propertyWorkspace.select({kind:'property',id:property.id});
 const h=app.state().acceptedHistoryD01;
 app.el('identityNameInput').value='Atomic publication';
 app.el('identityNameInput').handlers.input();
 assert.equal(app.el('identityApplyButton').handlers.click(),true);
 assert.equal(app.state().acceptedHistoryD01,h);assert.equal(h.length,1);
 assert.equal(app.state().project,app.state().identityView.project);
 assert.equal(app.state().identityView.context.revision,1);
 assert.deepEqual(JSON.parse(JSON.stringify(h.baseline)),JSON.parse(JSON.stringify(app.state().project)));
 app.state().propertyWorkspace.select({kind:'property',id:property.id});
 assert.equal(h.length,1);
 assert.equal(app.el('workspaceUndoButton').handlers.click(),true);
 assert.equal(h.future.length,1);assert.equal(h.past.length,0);
 assert.equal(app.el('workspaceRedoButtonD01').handlers.click(),true);
 assert.equal(h.past.length,1);assert.equal(h.future.length,0);
});
