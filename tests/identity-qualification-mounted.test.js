import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAppHarness } from './helpers/building-app.js';
import { vacant } from './helpers/vacant-frontage.js';
import { createProjectDocument,encodeProjectDocument } from '../src/data/project-format.js';
const site=vacant(),copy=v=>JSON.parse(JSON.stringify(v));
const portable=encodeProjectDocument(createProjectDocument(site.project,site.workspace));
const target=(()=>{
 const [a,b]=site.original.boundary,n=site.original.frame.inward;
 return {x:(a.x+b.x)/2+n.x*.4,y:(a.y+b.y)/2+n.y*.4};
})();
const load=async()=>{const app=await buildingAppHarness();app.applyPortable(portable);return app;};
const view=app=>app.state().identityView;
const marks=app=>copy(view(app).project.identityAllocation);
function prepare(app){
 assert.equal(app.el('propertyCreateStartE1').handlers.click(),true);
 const {propertyCreationSessionE1:s,project}=app.state();
 assert.ok(s.choose(project.city,target));
 assert.equal(s.draft.blockId,site.draft.blockId);
 assert.ok(s.update(site.draft));assert.ok(s.validation.ok,JSON.stringify(s.validation.issues));
 return s;
}
function create(app){
 const prior=view(app),ns=prior.context.namespace;
 prepare(app);
 assert.equal(app.el('propertyCreateApplyE1').handlers.click(),true,app.el('propertyCreateStatusE1').textContent);
 const current=view(app),added=current.project.city.properties.filter(p=>!prior.project.city.properties.some(old=>old.id===p.id));
 assert.equal(added.length,1);assert.equal(app.state().project,current.project);
 assert.equal(current.context.revision,prior.context.revision+1);
 assert.equal(current.history.length,1);
 const p=added[0],counter=current.project.identityAllocation.namespaces[ns].property;
 assert.equal(p.id,'PROP-IDA-'+ns+'-'+String(counter).padStart(6,'0'));
 assert.equal(p.plotIds.length,1);
 assert.equal(p.plotIds[0],'PLOT-IDA-'+ns+'-'+String(current.project.identityAllocation.namespaces[ns].plot).padStart(6,'0'));
 assert.equal(app.state().workspaceShell.state.selection.id,p.id);
 return p;
}
function undo(app){assert.equal(app.el('propertyCreateUndoE1').handlers.click(),true);}
function redo(app){assert.equal(app.el('propertyCreateRedoE1').handlers.click(),true);}
test('IDA B4 history mounted property creation Undo/Redo preserves high-water marks and exact identities',async()=>{
 const app=await load(),before=copy(view(app).project.city),p=create(app),accepted=copy(view(app).project.city),allocated=marks(app);
 undo(app);assert.deepEqual(copy(view(app).project.city),before);assert.deepEqual(marks(app),allocated);
 redo(app);assert.deepEqual(copy(view(app).project.city),accepted);assert.deepEqual(marks(app),allocated);
 assert.equal(view(app).context.revision,3);assert.ok(view(app).project.city.properties.some(x=>x.id===p.id));
});
test('IDA B4 history mounted Undo then recreate never reuses abandoned property or plot identities',async()=>{
 const app=await load(),first=create(app);undo(app);
 const second=create(app),ns=view(app).context.namespace;
 assert.notEqual(first.id,second.id);assert.notEqual(first.plotIds[0],second.plotIds[0]);
 assert.deepEqual(marks(app).namespaces[ns],{property:2,plot:2});
 assert.equal(view(app).history.entry('redo'),null);
});
test('IDA B4 failure mounted invalid and cancelled property drafts leave exact accepted view and allocator intact',async()=>{
 const app=await load(),before=view(app),s=prepare(app);
 s.update({width:0});assert.equal(s.validation.ok,false);
 assert.equal(app.el('propertyCreateApplyE1').handlers.click(),false);
 assert.equal(view(app),before);app.el('propertyCreateCancelE1').handlers.click();
 assert.equal(view(app),before);assert.equal(view(app).history.length,0);
 const p=create(app);assert.match(p.id,/-000001$/);
});
test('IDA B4 copy two independently adopted compiled tabs allocate disjoint real property and plot identities',async()=>{
 const a=await load(),b=await load(),first=create(a),second=create(b);
 assert.notEqual(view(a).context.namespace,view(b).context.namespace);
 assert.notEqual(first.id,second.id);assert.notEqual(first.plotIds[0],second.plotIds[0]);
 assert.deepEqual(copy(view(a).project.city.properties.filter(p=>p.id!==first.id)),copy(view(b).project.city.properties.filter(p=>p.id!==second.id)));
});
test('IDA B4 copy mounted portable reopen after Undo preserves retired-only marks and rotates namespace',async()=>{
 const app=await load(),first=create(app),oldNs=view(app).context.namespace;undo(app);
 const allocated=marks(app),saved=app.state().files.captureDocument();
 app.applyPortable(JSON.stringify(saved));
 assert.deepEqual(marks(app),allocated);assert.equal(view(app).history.length,0);
 assert.notEqual(view(app).context.namespace,oldNs);assert.equal(view(app).context.revision,0);
 const second=create(app);assert.notEqual(first.id,second.id);assert.notEqual(first.plotIds[0],second.plotIds[0]);
 assert.deepEqual(marks(app).namespaces[oldNs],allocated.namespaces[oldNs]);
});
test('IDA B4 copy reopening older portable backup in same compiled tab never reuses previously committed IDs',async()=>{
 const app=await load(),first=create(app),oldNs=view(app).context.namespace;
 app.applyPortable(portable);assert.deepEqual(marks(app).namespaces,{});
 assert.notEqual(view(app).context.namespace,oldNs);assert.equal(view(app).history.length,0);
 const second=create(app);assert.notEqual(first.id,second.id);assert.notEqual(first.plotIds[0],second.plotIds[0]);
});
test('IDA B4 persistence legacy browser fixture adapter constructs validated portable envelope without changing city',async()=>{
 const app=await buildingAppHarness();
 app.apply({project:site.project,workspace:site.workspace});
 assert.deepEqual(copy(view(app).project),copy(site.project));
 const before=view(app),bad=copy(site.project);bad.identityAllocation.namespaces['f'.repeat(32)]={plot:-1};
 assert.throws(()=>app.apply({project:bad,workspace:site.workspace}));
 assert.equal(view(app),before);
});
