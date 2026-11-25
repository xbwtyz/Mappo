import test from 'node:test';
import assert from 'node:assert/strict';
import { SecureIdentityHost } from '../src/core/secure-identity-host.js';
import { vacant } from './helpers/vacant-frontage.js';
import { stageMountedIdentityEdit,acceptMountedIdentityEdit } from '../src/editor/mounted-identity-transaction.js';
import { buildingAppHarness } from './helpers/building-app.js';
const site=vacant();
function fixture(){let n=0;const h=new SecureIdentityHost({cryptoSource:{getRandomValues(a){a.fill(++n);return a;}}});h.adopt(site.project);return h;}
test('IDA host rollback checkpoint restores immediately outgoing exact accepted view including history',()=>{
 const h=fixture(),p=stageMountedIdentityEdit(h,site.workspace,'property-create',site.draft,1);
 acceptMountedIdentityEdit(h,p.token,site.workspace,'property-create',site.draft,1);
 const before=h.view(),checkpoint=h.captureAdoptionRollback();
 h.adopt(site.project);assert.notEqual(h.view(),before);
 assert.equal(h.restoreAdoptionRollback(checkpoint),true);assert.equal(h.view(),before);
 assert.throws(()=>h.restoreAdoptionRollback(checkpoint),/Unknown/);
 h.adopt(site.project);assert.notEqual(h.view().context.namespace,'02'.repeat(16));
});
test('IDA rollback checkpoint refuses after accepted mutation of newly adopted session',()=>{
 const h=fixture(),checkpoint=h.captureAdoptionRollback();h.adopt(site.project);
 const p=stageMountedIdentityEdit(h,site.workspace,'property-create',site.draft,1);
 acceptMountedIdentityEdit(h,p.token,site.workspace,'property-create',site.draft,1);
 const before=h.view();
 assert.throws(()=>h.restoreAdoptionRollback(checkpoint),/Stale/);assert.equal(h.view(),before);
});
test('IDA rollback checkpoint on failed adoption retains outgoing view and cannot be reused',()=>{
 const h=fixture(),before=h.view(),checkpoint=h.captureAdoptionRollback();
 assert.throws(()=>h.adopt(site.project,{applyView(){throw Error('refused');}}),/refused/);
 assert.equal(h.restoreAdoptionRollback(checkpoint),false);assert.equal(h.view(),before);
 assert.throws(()=>h.restoreAdoptionRollback(checkpoint),/Unknown/);
});
test('IDA compiled initial generation and identity edit use exact immutable host views',async()=>{
 const app=await buildingAppHarness(),initial=app.state(),property=initial.project.city.properties[0];
 assert.equal(initial.project,initial.identityView.project);
 assert.ok(Object.isFrozen(initial.project.city));assert.equal(initial.identityView.context.revision,0);
 app.state().propertyWorkspace.select({kind:'property',id:property.id});
 app.el('identityNameInput').value='Secure mounted edit';app.el('identityNameInput').handlers.input();
 assert.equal(app.el('identityApplyButton').handlers.click(),true);
 const edited=app.state();assert.equal(edited.project,edited.identityView.project);assert.equal(edited.identityView.context.revision,1);
 assert.equal(edited.project.city.properties.find(p=>p.id===property.id).customName,'Secure mounted edit');
 assert.equal(app.el('workspaceUndoButton').handlers.click(),true);
 const undone=app.state();assert.equal(undone.identityView.context.revision,2);assert.equal(undone.project,undone.identityView.project);
 assert.equal(app.el('workspaceRedoButtonD01').handlers.click(),true);
 assert.equal(app.state().identityView.context.revision,3);
});
