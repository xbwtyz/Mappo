import test from 'node:test';
import assert from 'node:assert/strict';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { vacant } from './helpers/vacant-frontage.js';
import { copyJson } from '../src/data/project-format.js';
import { previewAllocatedPropertyCreation,commitAllocatedPropertyCreation } from '../src/editor/allocated-property-creation.js';

const site=vacant();
function fixture(){
 let seed=0;
 const host=new SecureIdentityHost({cryptoSource:{getRandomValues(bytes){bytes.fill(++seed);return bytes;}}});
 host.adopt(site.project);return host;
}
const preview=host=>previewAllocatedPropertyCreation(host,site.workspace,site.draft);
const commit=(host,p=preview(host))=>commitAllocatedPropertyCreation(host,site.workspace,site.draft,p);
test('IDA publication view is unavailable before accepted adoption',()=>{
 assert.throws(()=>new SecureIdentityHost({cryptoSource:null}).view(),/No accepted identity session/);
});
test('IDA publication view keeps stable project and history references for unchanged accepted revision',()=>{
 const host=fixture(),a=host.view();
 host.read();host.reserve([]);preview(host);
 assert.equal(host.view(),a);assert.equal(host.view().project,a.project);assert.equal(host.view().history,a.history);
 assert.deepEqual(a.project,site.project);assert.equal(a.context.revision,0);
});
test('IDA publication view deeply freezes canonical accepted data and context',()=>{
 const host=fixture(),view=host.view();
 assert.throws(()=>view.project.city.name='Changed',TypeError);
 assert.throws(()=>view.project.city.properties.push({}),TypeError);
 assert.throws(()=>view.project.city.properties[0].boundary[0].x=0,TypeError);
 assert.throws(()=>view.project.identityAllocation.namespaces.fake={plot:3},TypeError);
 assert.throws(()=>view.context.revision=50,TypeError);
 assert.equal(host.view(),view);
 assert.deepEqual(host.read().project,site.project);
});
test('IDA publication view updates project context and history together on accepted allocation',()=>{
 const host=fixture(),a=host.view(),out=commit(host),b=host.view();
 assert.notEqual(a,b);assert.notEqual(a.project,b.project);
 assert.deepEqual(b.project,out.project);assert.deepEqual(b.context,out.context);
 assert.deepEqual(b.history.summaries(),out.history.entries);
 assert.equal(b.history.length,1);assert.equal(b.history.serial,1);
 assert.equal(b.history.can('undo',b.project),true);assert.equal(b.history.can('redo',b.project),false);
 assert.deepEqual(a.project,site.project);assert.equal(a.history.length,0);
 assert.equal(a.history.can('undo',a.project),false);assert.equal(a.context.revision,0);
});
test('IDA publication history facade exposes no accepted-state mutation or raw cursor',()=>{
 const host=fixture();commit(host);
 const h=host.view().history;
 for(const key of ['record','observe','clear','accept','prepare','past','future','baseline'])
   assert.equal(h[key],undefined);
 assert.ok(Object.isFrozen(h));
 const entry=h.entry('undo');
 assert.equal(h.entry('undo'),entry);
 assert.throws(()=>entry.targetIds.push('fake'),TypeError);
 assert.throws(()=>entry.from.city.properties.pop(),TypeError);
 assert.throws(()=>h.summaries()[0].label='fake',TypeError);
 assert.equal(host.copyHistory().entry('undo').label,'Create property');
});
test('IDA history view retains legacy read-only preflight and query semantics',()=>{
 const host=fixture(),p=preview(host),v=host.view(),ledger=host.copyHistory();
 assert.equal(v.history.fits(v.project,p.result.candidate),ledger.fits(v.project,p.result.candidate));
 assert.equal(v.history.canRecord(v.project,p.result.candidate),true);
 assert.equal(v.history.canRecord(v.project,v.project),false);
 assert.equal(v.history.entry('invalid'),null);
});
test('IDA failed commit keeps the exact same published snapshot',()=>{
 const host=fixture(),a=host.view(),p=structuredClone(preview(host));
 p.receipt.allocations[0].key='bad';
 assert.throws(()=>commit(host,p));assert.equal(host.view(),a);
 assert.equal(host.view().history.length,0);
});
test('IDA committed history replay publishes the matching detached entry and workspace',()=>{
 const host=fixture(),accepted=commit(host),a=host.view(),entry=a.history.entry('undo');
 const undo=host.replay({direction:'undo',context:a.context,workspace:site.workspace}),b=host.view();
 assert.deepEqual(undo.entry,entry);assert.deepEqual(undo.project,b.project);assert.equal(b.context.revision,2);
 assert.deepEqual(b.project.identityAllocation,accepted.project.identityAllocation);
 assert.equal(b.history.can('redo',b.project),true);
 assert.equal(a.history.can('undo',a.project),true);
 // Default workspace has no required UI selection object. Mutate a required
 // nested camera field instead, then verify the original workspace and view.
 const originalWorkspace=copyJson(site.workspace);
 assert.deepEqual(undo.workspace,originalWorkspace);
 undo.entry.from.city.name='Injected';undo.workspace.view.camera.x+=123;
 assert.notEqual(undo.workspace.view.camera.x,site.workspace.view.camera.x);
 assert.deepEqual(site.workspace,originalWorkspace);
 assert.deepEqual(b.history.entry('redo'),entry);
 const redo=host.replay({direction:'redo',context:b.context,workspace:site.workspace}),c=host.view();
 assert.deepEqual(redo.project,accepted.project);assert.equal(c.context.revision,3);
 assert.deepEqual(redo.entry,entry);assert.equal(c.history.can('undo',c.project),true);
});
test('IDA failed replay does not invalidate current render references',()=>{
 const host=fixture(),a=host.view();
 assert.throws(()=>host.replay({direction:'undo',context:a.context,workspace:site.workspace}));
 assert.equal(host.view(),a);
});
test('IDA adopted replacement invalidates previous render context and history but does not mutate older views',()=>{
 const host=fixture();commit(host);const a=host.view();
 host.adopt(site.project);const b=host.view();
 assert.notEqual(a.context.namespace,b.context.namespace);
 assert.equal(b.context.revision,0);assert.equal(b.history.length,0);
 assert.equal(a.history.length,1);assert.deepEqual(b.project,site.project);
 assert.throws(()=>host.replay({direction:'undo',context:a.context,workspace:site.workspace}),/Stale/);
 assert.equal(host.view(),b);
});
test('IDA existing detached read and history exports remain independently mutable',()=>{
 const host=fixture();commit(host);const a=host.view(),r=host.read(),ledger=host.copyHistory();
 r.project.city.name='Injected';r.history.entries[0].label='Changed';ledger.clear(r.project);
 assert.equal(host.view(),a);assert.notEqual(a.project.city.name,'Injected');
 assert.equal(a.history.entry('undo').label,'Create property');
});
