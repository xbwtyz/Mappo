import test from 'node:test';
import assert from 'node:assert/strict';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { vacant } from './helpers/vacant-frontage.js';
import { copyJson,createProjectDocument } from '../src/data/project-format.js';
import { previewAllocatedPropertyCreation,commitAllocatedPropertyCreation } from '../src/editor/allocated-property-creation.js';

const site=vacant();
function fixture({fail=false,adopt=true}={}){
 let count=0;
 const host=new SecureIdentityHost({cryptoSource:{getRandomValues(bytes){
  if(fail&&count>0)throw Error('entropy denied');
  bytes.fill(++count);return bytes;
 }}});
 if(adopt)host.adopt(site.project);
 return {host,calls:()=>count};
}
const doc=()=>createProjectDocument(site.project,site.workspace);
const preview=host=>previewAllocatedPropertyCreation(host,site.workspace,site.draft);
const commit=host=>commitAllocatedPropertyCreation(host,site.workspace,site.draft,preview(host));
const snap=host=>JSON.stringify({read:host.read(),history:host.copyHistory()});

test('IDA staging initial adoption does not establish a session or acquire entropy',()=>{
 const {host,calls}=fixture({adopt:false}),p=host.stageAdoption(doc());
 assert.equal(host.adopted,false);assert.equal(calls(),0);
 assert.ok(Object.isFrozen(p.token));assert.deepEqual(p.document.project,site.project);
 const out=host.commitAdoption(p.token);
 assert.equal(calls(),1);assert.equal(host.adopted,true);
 assert.deepEqual(out.project,site.project);assert.deepEqual(out.workspace,site.workspace);
 assert.deepEqual(out.project.identityAllocation.namespaces,{});
});
test('IDA staged adoption retains existing accepted project history and entropy until explicit publication',()=>{
 const {host,calls}=fixture();commit(host);const before=host.view(),snapshot=snap(host);
 const p=host.stageAdoption(doc());
 assert.equal(host.view(),before);assert.equal(snap(host),snapshot);assert.equal(calls(),1);
 const out=host.commitAdoption(p.token);
 assert.equal(calls(),2);assert.equal(out.context.revision,0);
 assert.notEqual(out.context.namespace,before.context.namespace);assert.equal(out.history.entries.length,0);
 assert.deepEqual(out.project,site.project);assert.equal(before.history.length,1);
});
test('IDA cancellation preserves exact outgoing view and makes token unusable',()=>{
 const {host,calls}=fixture();commit(host);const before=host.view(),p=host.stageAdoption(doc());
 assert.equal(host.cancelAdoption(p.token),true);
 assert.equal(host.cancelAdoption(p.token),false);
 assert.throws(()=>host.commitAdoption(p.token),/Unknown or consumed/);
 assert.equal(host.view(),before);assert.equal(calls(),1);
});
test('IDA malformed project or workspace staging preserves outgoing history and consumes no entropy',()=>{
 const {host,calls}=fixture();commit(host);const before=snap(host);
 const a=doc();a.project.identityAllocation.namespaces['f'.repeat(32)]={plot:-1};
 const b=doc();b.workspace.view.camera.zoom=-1;
 assert.throws(()=>host.stageAdoption(a));assert.throws(()=>host.stageAdoption(b));
 assert.equal(snap(host),before);assert.equal(calls(),1);
});
test('IDA staged document detaches both original input and returned preview',()=>{
 const {host}=fixture(),original=doc(),expected=copyJson(original),p=host.stageAdoption(original);
 original.project.city.name='Injected';original.workspace.view.camera.x+=999;
 p.document.project.city.name='Also injected';p.document.workspace.view.camera.x-=999;
 const out=host.commitAdoption(p.token);
 assert.deepEqual(out.document,expected);assert.deepEqual(out.project,expected.project);
 assert.deepEqual(out.workspace,expected.workspace);
 out.document.project.city.name='Post-commit injection';
 assert.deepEqual(host.view().project,expected.project);
});
test('IDA staged adoption refuses forged or foreign host tokens',()=>{
 const a=fixture(),b=fixture(),p=a.host.stageAdoption(doc()),before=b.host.view();
 assert.throws(()=>b.host.commitAdoption(p.token),/Unknown or consumed/);
 assert.throws(()=>b.host.commitAdoption({}),/Unknown or consumed/);
 assert.equal(b.host.view(),before);assert.equal(b.calls(),1);
 assert.doesNotThrow(()=>a.host.commitAdoption(p.token));
});
test('IDA stage becomes stale after accepted allocation without spending adoption entropy',()=>{
 const {host,calls}=fixture(),p=host.stageAdoption(doc());commit(host);const before=host.view();
 assert.throws(()=>host.commitAdoption(p.token),/Stale/);
 assert.throws(()=>host.commitAdoption(p.token),/Unknown or consumed/);
 assert.equal(host.view(),before);assert.equal(calls(),1);
});
test('IDA stage becomes stale after accepted Undo',()=>{
 const {host,calls}=fixture();const accepted=commit(host),p=host.stageAdoption(doc());
 host.replay({direction:'undo',context:accepted.context,workspace:site.workspace});
 const before=host.view();assert.throws(()=>host.commitAdoption(p.token),/Stale/);
 assert.equal(host.view(),before);assert.equal(calls(),1);
});
test('IDA competing adoption tokens cannot overwrite a newly adopted project',()=>{
 const {host,calls}=fixture(),a=host.stageAdoption(doc()),b=host.stageAdoption(doc());
 host.commitAdoption(a.token);const before=host.view();
 assert.throws(()=>host.commitAdoption(b.token),/Stale/);
 assert.throws(()=>host.commitAdoption(a.token),/Unknown or consumed/);
 assert.equal(host.view(),before);assert.equal(calls(),2);
});
test('IDA secure entropy failure at staged publication retains prior accepted session and history',()=>{
 const {host,calls}=fixture({fail:true});commit(host);const before=host.view(),snapshot=snap(host),p=host.stageAdoption(doc());
 assert.throws(()=>host.commitAdoption(p.token),/entropy denied/);
 assert.equal(host.view(),before);assert.equal(snap(host),snapshot);assert.equal(calls(),1);
 assert.throws(()=>host.commitAdoption(p.token),/Unknown or consumed/);
});
test('IDA staged older backup restores exact saved counters and new session rejects outgoing receipts',()=>{
 const {host}=fixture(),accepted=commit(host),receipt=host.reserve([{type:'plot',key:'unused'}]);
 const p=host.stageAdoption(doc()),out=host.commitAdoption(p.token);
 assert.deepEqual(out.project,site.project);assert.notEqual(out.context.namespace,accepted.context.namespace);
 assert.throws(()=>host.commit({requests:[{type:'plot',key:'unused'}],receipt,candidateCity:out.project.city,
  transaction:{family:'property',operation:'test',label:'Test',targetIds:[]},validateDomain:()=>true}),/Stale/);
});

test('IDA synchronous lifecycle reconciliation sees exact new view and completes adoption',()=>{
 const {host}=fixture(),before=host.view(),p=host.stageAdoption(doc());
 let seen;
 const out=host.commitAdoption(p.token,{applyView(view,workspace){
  seen=view;assert.equal(host.view(),view);assert.notEqual(view,before);
  assert.deepEqual(workspace,site.workspace);workspace.view.camera.x+=5;
  assert.throws(()=>host.adopt(site.project),/Reentrant/);
  assert.throws(()=>host.replay({direction:'undo',context:view.context,workspace}),/Reentrant/);
 }});
 assert.equal(host.view(),seen);assert.deepEqual(out.workspace,site.workspace);
 assert.deepEqual(out.project.identityAllocation.namespaces,{});
});
test('IDA failed lifecycle callback restores exact outgoing view including redo and allocation counters',()=>{
 const {host}=fixture();const accepted=commit(host);
 host.replay({direction:'undo',context:accepted.context,workspace:site.workspace});
 const before=host.view(),snapshot=snap(host),p=host.stageAdoption(doc());let provisional,receipt;
 assert.throws(()=>host.commitAdoption(p.token,{applyView(view){
  provisional=view.context.namespace;receipt=host.reserve([{type:'plot',key:'unused'}]);
  throw Error('UI reconciliation failed');
 }}),/UI reconciliation failed/);
 assert.equal(host.view(),before);assert.equal(snap(host),snapshot);assert.equal(before.history.entry('redo').family,'property');
 assert.throws(()=>host.commitAdoption(p.token),/Unknown or consumed/);
 const next=host.commitAdoption(host.stageAdoption(doc()).token);
 assert.notEqual(next.context.namespace,provisional);
 assert.throws(()=>host.commit({requests:[{type:'plot',key:'unused'}],receipt,candidateCity:next.project.city,
  transaction:{family:'property',operation:'property-create',label:'Test',targetIds:[]},validateDomain:()=>true}),/Stale/);
});
test('IDA lifecycle rollback privately excludes abandoned entropy even if source repeats it',()=>{
 let n=0;const values=[1,2,2,3];
 const host=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(values[n++]);return a;}}});
 host.adopt(site.project);const before=host.view();
 assert.throws(()=>host.adopt(site.project,{applyView(){throw Error('UI refused');}}),/UI refused/);
 assert.equal(host.view(),before);
 host.adopt(site.project);assert.equal(host.view().context.namespace,'03'.repeat(16));assert.equal(n,4);
});
test('IDA initial generation callback failure leaves host unadopted',()=>{
 const {host}=fixture({adopt:false});
 assert.throws(()=>host.adopt(site.project,{applyView(){throw Error('UI refused');}}),/UI refused/);
 assert.equal(host.adopted,false);
 const out=host.adopt(site.project);
 assert.equal(out.context.namespace,'02'.repeat(16));assert.deepEqual(out.project.identityAllocation.namespaces,{});
});
test('IDA rejects async lifecycle callback and nonundefined callback result without publishing',()=>{
 const {host}=fixture(),before=host.view();let called=false;
 assert.throws(()=>host.commitAdoption(host.stageAdoption(doc()).token,{async applyView(){called=true;}}),/synchronous/);
 assert.equal(called,false);assert.equal(host.view(),before);
 assert.throws(()=>host.commitAdoption(host.stageAdoption(doc()).token,{applyView(){return true;}}),/undefined synchronously/);
 assert.equal(host.view(),before);
});
test('IDA lifecycle entropy failure occurs before any UI callback',()=>{
 const {host}=fixture({fail:true}),before=host.view();let called=false;
 assert.throws(()=>host.commitAdoption(host.stageAdoption(doc()).token,{applyView(){called=true;}}),/entropy denied/);
 assert.equal(called,false);assert.equal(host.view(),before);
});
