import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { preparePropertyApply3I, inspectPropertyEdit3I } from '../src/editor/property-application.js';
import { PropertyGeometryHistory3I } from '../src/editor/property-history.js';

function ready(seed='b04-flexible'){
 const project=createProject({seed,size:'small',morphology:'planned'});
 for(const property of project.city.properties){
   const session=new PropertyEditSession3I();
   if(!session.start(project.city,property.id)||!session.beginFlexible(project.city))continue;
   const selected=session.flexible.selected;
   if(selected.boundary.length!==4)continue;
   session.updateFlexible({edgeA:0,ratioA:.5,edgeB:2,ratioB:.5});
   if(!session.splitFlexible(project.city))continue;
   const candidate=preparePropertyApply3I(project,defaultWorkspace(project),session);
   if(candidate.ok)return {project,property,session,candidate};
 }
 throw Error('No viable B04 plot split in generated city.');
}
function readyMultiple(seed='b04-flexible-multi'){
 const project=createProject({seed,size:'small',morphology:'planned'});
 const rejected=[];
 for(const property of project.city.properties){
   const session=new PropertyEditSession3I();
   if(!session.start(project.city,property.id)||!session.beginFlexible(project.city))continue;
   if(session.flexible.selected?.boundary.length!==4)continue;
   session.updateFlexible({edgeA:0,ratioA:.5,edgeB:2,ratioB:.5});
   if(!session.splitFlexible(project.city))continue;
   for(const plot of [...session.flexible.plots]){
     const n=plot.boundary.length;
     if(n<4)continue;
     for(const [edgeA,edgeB] of [[0,2],[1,3]]){
       if(edgeA>=n||edgeB>=n)continue;
       session.updateFlexible({selectedId:plot.id,edgeA,edgeB,ratioA:.5,ratioB:.5});
       if(!session.splitFlexible(project.city)){
         if(rejected.length<4)rejected.push({property:property.id,plot:plot.id,error:session.flexible.error});
         continue;
       }
       const candidate=preparePropertyApply3I(project,defaultWorkspace(project),session);
       if(candidate.ok)return {project,property,session,candidate};
       session.undoFlexible();
       if(rejected.length<4)rejected.push({property:property.id,plot:plot.id,issues:candidate.issues});
     }
   }
 }
 throw Error('No valid two-step generated-city draft: '+JSON.stringify(rejected));
}
test('B04 multi-operation draft is nonmutating and accepts one schema-9 transaction',()=>{
 const {project,property,session,candidate:saved}=readyMultiple(),before=JSON.stringify(project.city);
 assert.equal(session.flexible.operations.length,2);
 assert.equal(saved.ok,true,JSON.stringify(saved.issues));
 validateStoredProject(saved.candidate);
 assert.equal(saved.candidate.schemaVersion,10);
 assert.equal(JSON.stringify(project.city),before);
 assert.equal(saved.candidate.city.properties.find(p=>p.id===property.id).plotIds.length,property.plotIds.length+2);
 const history=new PropertyGeometryHistory3I();
 assert.equal(history.record(project,saved.candidate,property.id),true);
 assert.equal(history.count('undo',property.id),1);
 const undo=history.prepare(saved.candidate,defaultWorkspace(saved.candidate),property.id,'undo');
 assert.equal(undo.ok,true,undo.reason);
 assert.equal(JSON.stringify(undo.candidate.city),before);
 history.accept(undo.entry,'undo');
 const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),property.id,'redo');
 assert.equal(redo.ok,true,redo.reason);
 assert.deepEqual(redo.candidate.city,saved.candidate.city);
});
test('B04 choice of retained identity, reverse-step and Reset retain accepted geometry',()=>{
 const {project,property}=ready('b04-retain'),before=JSON.stringify(project.city);
 const s=new PropertyEditSession3I();
 assert.equal(s.start(project.city,property.id),true);
 assert.equal(s.beginFlexible(project.city),true);
 const originalBoundary=JSON.stringify(s.boundary);
 assert.equal(s.selectCorner(0),false);
 assert.equal(s.setCorner(0,{x:s.boundary[0].x+1,y:s.boundary[0].y}),false);
 assert.equal(JSON.stringify(s.boundary),originalBoundary);
 const original=s.flexible.selectedId;
 s.updateFlexible({edgeA:0,ratioA:.4,edgeB:2,ratioB:.6,retain:'second'});
 assert.equal(s.splitFlexible(project.city),true);
 assert.equal(s.flexible.plots.filter(p=>p.id===original).length,1);
 assert.equal(s.undoFlexible(),true);
 assert.equal(s.flexible.plots.filter(p=>p.id===original).length,1);
 assert.equal(s.isPending,false);
 assert.equal(s.reset(),true);
 assert.equal(s.flexibleMode,false);
 assert.equal(JSON.stringify(project.city),before);
});
test('B04 authored metadata requires consent and remains in accepted original-record receipt',()=>{
 const {project,property}=ready('b04-authored');
 const source=project.city.plots.find(p=>p.id===property.plotIds[0]);
 source.customName='Mill rights';
 const s=new PropertyEditSession3I();
 assert.equal(s.start(project.city,property.id),true);
 assert.equal(s.beginFlexible(project.city),true);
 s.updateFlexible({selectedId:source.id,edgeA:0,edgeB:2,ratioA:.5,ratioB:.5});
 assert.equal(s.splitFlexible(project.city),true);
 assert.equal(inspectPropertyEdit3I(project,s).ok,false);
 assert.equal(preparePropertyApply3I(project,defaultWorkspace(project),s).candidate,null);
 assert.equal(s.approveFlexible(true),true);
 const candidate=preparePropertyApply3I(project,defaultWorkspace(project),s);
 assert.equal(candidate.ok,true,JSON.stringify(candidate.issues));
 const changed=candidate.candidate.city.properties.find(p=>p.id===property.id);
 assert.equal(changed.plotPartitionHistory027.at(-1).sourceRecords.find(p=>p.id===source.id).customName,'Mill rights');
 assert.equal(candidate.candidate.city.plots.find(p=>p.id===source.id).customName,'Mill rights');
});
test('B04 rejects invalid cut without changing accepted or draft partition',()=>{
 const {project,property}=ready('b04-blocked');
 const s=new PropertyEditSession3I(),before=JSON.stringify(project.city);
 s.start(project.city,property.id);s.beginFlexible(project.city);
 const draft=JSON.stringify(s.flexible.plots);
 s.updateFlexible({edgeA:0,edgeB:0});
 assert.equal(s.splitFlexible(project.city),false);
 assert.match(s.flexible.error,/distinct/);
 assert.equal(JSON.stringify(s.flexible.plots),draft);
 assert.equal(JSON.stringify(project.city),before);
});
