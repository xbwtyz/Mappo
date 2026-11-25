import test from 'node:test';
import assert from 'node:assert/strict';
import { stageLocalEditorRecord,checkLocalEditorRecord,publishLocalEditorRecord } from '../src/editor/local-editor-record.js';
import { PropertyCreationHistoryE1 } from '../src/editor/property-creation-e1.js';
import { PropertyDeletionHistory4A,preparePropertyDeletion4A } from '../src/editor/property-deletion.js';
import { AcceptedEditHistoryD01,stageAcceptedPublicationD01 } from '../src/core/accepted-edit-history-d01.js';
import { createProject } from '../src/core/city-model.js';
import { copyJson,defaultWorkspace } from '../src/data/project-format.js';
import { vacant } from './helpers/vacant-frontage.js';
import { preparePropertyCreationE1 } from '../src/editor/property-creation-e1.js';
const site=vacant(),created=preparePropertyCreationE1(site.project,site.workspace,site.draft);
const tx={family:'property',operation:'property-create',label:'Create property',targetIds:[created.propertyId]};
test('IDA local creation stage does not cut redo or consume history before accepted publication',()=>{
 assert.ok(created.ok);
 const h=new PropertyCreationHistoryE1(1);
 h.record(site.project,created.candidate,created.propertyId);
 const row=h.past.pop();h.future.push(row);
 const token=stageLocalEditorRecord(h,site.project,created.candidate,created.propertyId);
 assert.equal(h.past.length,0);assert.deepEqual(h.future,[row]);
 assert.ok(checkLocalEditorRecord(token));
 publishLocalEditorRecord(token);
 assert.equal(h.past.length,1);assert.equal(h.future.length,0);
 assert.throws(()=>checkLocalEditorRecord(token),/Unknown/);
});
test('IDA local stage discarded after canonical preflight refusal leaves cursor intact',()=>{
 const h=new PropertyCreationHistoryE1(),canonical=new AcceptedEditHistoryD01();
 canonical.clear(site.project);
 const stage=stageLocalEditorRecord(h,site.project,created.candidate,created.propertyId);
 assert.ok(checkLocalEditorRecord(stage));
 assert.throws(()=>stageAcceptedPublicationD01(canonical,site.project,created.candidate,{...tx,label:''}));
 assert.equal(h.past.length,0);assert.equal(h.future.length,0);assert.equal(canonical.length,0);
});
test('IDA local stale stage refuses changed cursor before accepted publication',()=>{
 const h=new PropertyCreationHistoryE1();
 const stage=stageLocalEditorRecord(h,site.project,created.candidate,created.propertyId);
 h.record(site.project,created.candidate,created.propertyId);
 assert.throws(()=>checkLocalEditorRecord(stage),/changed/);
 assert.equal(h.past.length,1);
});
test('IDA local stage retains no-op record refusal',()=>{
 const h=new PropertyCreationHistoryE1();
 assert.equal(stageLocalEditorRecord(h,site.project,site.project,created.propertyId),null);
 assert.equal(h.past.length,0);
});
test('IDA local property deletion undefined success return stages actual retired property',()=>{
 const h=new PropertyDeletionHistory4A(),p=created.candidate;
 const receipt=preparePropertyDeletion4A(p,defaultWorkspace(p),created.propertyId);
 assert.ok(receipt.ok,receipt.reason);
 const stage=stageLocalEditorRecord(h,p,receipt.candidate,created.propertyId);
 assert.ok(stage);assert.equal(h.lastDeleted,null);
 checkLocalEditorRecord(stage);publishLocalEditorRecord(stage);
 assert.equal(h.lastDeleted,created.propertyId);
});
