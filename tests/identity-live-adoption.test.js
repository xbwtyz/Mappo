import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectFiles } from '../src/ui/project-files.js';
import { createProject } from '../src/core/city-model.js';
import { copyJson,defaultWorkspace,createProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';
const city=createProject({seed:'ida-live-adoption',size:'small',morphology:'planned'});
const document=()=>createProjectDocument(city,defaultWorkspace(city));
function fixture(){
 const elements=new Map();let live=document(),applies=0,rollbacks=0,captures=0,checkpoints=0;
 const getElement=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',classList:{toggle(){}}});return elements.get(id);};
 const files=new ProjectFiles({getElement,capture:()=>{captures++;return live;},
  apply:d=>{applies++;live=copyJson(d);},
  captureAdoptionRollback:()=>{checkpoints++;return {cursor:42};},
  restoreAdoptionRollback:(d,c)=>{assert.equal(c.cursor,42);rollbacks++;live=copyJson(d);}
 });
 files.base=copyJson(live);
 return {files,getElement,live:()=>live,counts:()=>({applies,rollbacks,captures,checkpoints})};
}
test('IDA invalid staged project is rejected before capture, recovery or application',async()=>{
 const f=fixture(),before=f.live(),base=f.files.base,bad=document();
 bad.project.identityAllocation.namespaces['f'.repeat(32)]={plot:-1};
 f.files.stageDocument(bad,'file');
 assert.equal(await f.files.openPending(),false);
 assert.equal(f.live(),before);assert.equal(f.files.base,base);
 assert.deepEqual(f.counts(),{applies:0,rollbacks:0,captures:0,checkpoints:0});
 assert.equal(f.files.revision,0);
});
test('IDA invalid staged workspace leaves suspended recovery choice intact',async()=>{
 const f=fixture(),bad=document();bad.workspace.view.camera.zoom=-1;f.files.suspended=true;
 f.files.stageDocument(bad,'recovery');assert.equal(await f.files.openPending(),false);
 assert.equal(f.files.suspended,true);assert.equal(f.counts().rollbacks,0);
});
test('IDA capture failure does not call outgoing application or rollback',async()=>{
 const f=fixture(),before=f.live();f.files.capture=()=>{throw Error('capture refused');};
 f.files.stageDocument(document(),'file');assert.equal(await f.files.openPending(),false);
 assert.equal(f.live(),before);assert.equal(f.counts().applies,0);assert.equal(f.counts().rollbacks,0);
});
test('IDA changed workspace during async recovery refuses stale Open without replacement',async()=>{
 const f=fixture(),before=f.live();f.files.store={};let done;
 f.files.flush=()=>new Promise(resolve=>{done=resolve;});
 f.files.stageDocument(document(),'file');const p=f.files.openPending();
 f.files.revision++;done();assert.equal(await p,false);
 assert.equal(f.live(),before);assert.equal(f.counts().applies,0);assert.equal(f.counts().rollbacks,0);
 assert.match(f.getElement('fileStatus').textContent,/changed during Open/);
});
test('IDA entered Apply failure invokes rollback with outgoing document and checkpoint',async()=>{
 const f=fixture(),before=copyJson(f.live());f.files.apply=()=>{throw Error('interface failure');};
 f.files.stageDocument(document(),'file');assert.equal(await f.files.openPending(),false);
 assert.deepEqual(f.live().project,before.project);assert.deepEqual(f.counts(),{applies:0,rollbacks:1,captures:1,checkpoints:1});
 assert.equal(f.files.revision,0);
});
test('IDA failed rollback reports uncertainty rather than claiming city retained',async()=>{
 const f=fixture();f.files.apply=()=>{throw Error('apply failed');};
 f.files.restoreAdoptionRollback=()=>{throw Error('restore failed');};
 f.files.stageDocument(document(),'file');assert.equal(await f.files.openPending(),false);
 assert.match(f.getElement('fileStatus').textContent,/Workspace restoration failed/);
 assert.doesNotMatch(f.getElement('fileStatus').textContent,/Current city retained/);
});
function edit(app){
 const id=app.state().project.city.properties[0].id;
 app.state().propertyWorkspace.select({kind:'property',id});
 app.el('identityNameInput').value='Preserve this accepted edit';
 app.el('identityNameInput').handlers.input();
 assert.equal(app.el('identityApplyButton').handlers.click(),true);
}
const json=v=>JSON.stringify(v);
test('IDA compiled rejected staged load preserves existing D01 history and project reference',async()=>{
 const app=await buildingAppHarness();edit(app);
 const {project,acceptedHistoryD01:h,files}=app.state(),before=json(h),bad=files.captureDocument();
 bad.project.identityAllocation.namespaces['f'.repeat(32)]={plot:-1};
 files.stageDocument(bad,'file');assert.equal(await files.openPending(),false);
 assert.equal(app.state().project,project);assert.equal(json(h),before);
 assert.equal(app.el('workspaceUndoButton').handlers.click(),true);
});
test('IDA compiled failed adoption after publication restores accepted project and both history cursors',async()=>{
 const app=await buildingAppHarness();edit(app);
 assert.equal(app.el('workspaceUndoButton').handlers.click(),true);
 const {project,acceptedHistoryD01:h,files}=app.state(),before=json(h),apply=files.apply;
 const replacement=files.captureDocument();replacement.project.city.name='Replacement city';
 files.apply=d=>{apply(d);throw Error('simulated late UI failure');};
 files.stageDocument(replacement,'file');assert.equal(await files.openPending(),false);
 assert.equal(app.state().project,project);assert.equal(json(h),before);
 assert.equal(h.future.length,1);assert.equal(h.past.length,0);
 assert.equal(app.el('workspaceRedoButtonD01').handlers.click(),true);
 assert.equal(h.past.length,1);assert.equal(h.future.length,0);
});
