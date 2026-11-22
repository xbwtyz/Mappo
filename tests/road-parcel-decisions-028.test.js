import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { RoadGeometryHistoryB4 } from '../src/editor/road-history.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';

const road='RD-0116',offset={x:5,y:0};
const local=(project,choices=new Map())=>prepareNeighborhoodReflowC3(
  project,road,offset,undefined,new Map(),{parcelChoices:choices});
export function b05LocalFixture() {
  const baseline=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  const generated=local(baseline);
  assert.ok(generated.candidateProject,generated.unresolved[0]?.message);
  const touched=generated.ledger.filter(r=>r.kind==='property'&&r.disposition==='reshaped')
    .map(r=>r.oldId);
  const issues=[];
  for(const id of touched){
    const project=structuredClone(baseline);
    const parcel=project.city.properties.find(p=>p.id===id);
    parcel.customName='B05 named yard';
    const blocked=local(project);
    const review=blocked.parcelReview?.find(row=>row.id===id);
    if(!review?.options.some(p=>p.kind==='reshape'))continue;
    const result=local(project,new Map([[id,{kind:'reshape'}]]));
    if(result.candidateProject)return {project,parcel,blocked,result};
    if(issues.length<3)issues.push(result.unresolved[0]?.message);
  }
  throw Error('No safe authored C2 reshape fixture: '+JSON.stringify(issues));
}
test('B05 customized local parcel stays blocked until a genuine reshape choice',()=>{
 const {project,parcel,blocked,result}=b05LocalFixture();
 const before=structuredClone(project),id=parcel.id;
 assert.equal(blocked.candidateProject,null);
 assert.ok(blocked.unresolved.some(row=>row.code==='parcel-decision-required'&&row.id===id));
 assert.ok(blocked.parcelReview.find(p=>p.id===id).options.some(o=>o.kind==='reshape'));
 validateStoredProject(result.candidateProject);
 const modified=result.candidateProject.city.properties.find(p=>p.id===id);
 assert.equal(modified.customName,'B05 named yard');
 const archive=result.candidateProject.city.roadParcelDecisionHistory028;
 assert.ok(Array.isArray(archive)&&archive.length,'Accepted authored decision needs a durable original-record audit');
 assert.equal(archive.at(-1).source.property.customName,'B05 named yard');
 assert.equal(modified.id,id);
 assert.deepEqual(modified.plotIds,parcel.plotIds);
 assert.deepEqual(modified.buildingIds,parcel.buildingIds);
 for(const buildingId of parcel.buildingIds){
   const previous=project.city.buildings.find(b=>b.id===buildingId);
   const current=result.candidateProject.city.buildings.find(b=>b.id===buildingId);
   assert.deepEqual(current.footprint,previous.footprint);
   assert.deepEqual(current.holes,previous.holes);
 }
 assert.deepEqual(project,before);
 const ws=defaultWorkspace(project),history=new RoadGeometryHistoryB4();
 const candidate=result.candidateProject;
 assert.equal(history.record(project,candidate,road),true);
 const undo=history.prepare(candidate,ws,'undo');
 assert.equal(undo.ok,true,undo.reason);
 assert.deepEqual(undo.candidate,project);
 history.accept(undo.entry,'undo');
 const redo=history.prepare(project,ws,'redo');
 assert.equal(redo.ok,true,redo.reason);
 assert.deepEqual(redo.candidate,candidate);
 const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,ws)));
 assert.deepEqual(portable.project,JSON.parse(JSON.stringify(candidate)));
});
test('B05 unknown provenance remains unknown; incorrect and stale choices reject atomically',()=>{
 const {project,parcel}=b05LocalFixture();
 delete project.city.properties.find(p=>p.id===parcel.id).roadProvenance;
 const before=JSON.stringify(project);
 const invalid=local(project,new Map([[parcel.id,{kind:'transfer',targetId:'BLK-MISSING'}]]));
 assert.equal(invalid.candidateProject,null);
 assert.ok(invalid.unresolved?.length);
 const chosen=local(project,new Map([[parcel.id,{kind:'reshape'}]]));
 assert.ok(chosen.candidateProject,chosen.unresolved[0]?.message);
 assert.equal(chosen.candidateProject.city.properties.find(p=>p.id===parcel.id).roadProvenance,undefined);
 assert.equal(JSON.stringify(project),before);
});
test('B05 complex topology reports authored parcel choices, preserves the original city on rejection',()=>{
 const project=createProject({seed:'c2-radial',size:'small',morphology:'radial'});
 const baseline=prepareNeighborhoodReflowC3(project,'RD-0103',{x:0,y:15});
 assert.ok(baseline.candidateProject,baseline.unresolved[0]?.message);
 const retired=baseline.ledger.find(row=>row.kind==='property'&&row.oldId&&!row.newId);
 assert.ok(retired);
 project.city.properties.find(p=>p.id===retired.oldId).customName='Custom workshop';
 const before=JSON.stringify(project);
 const blocked=prepareNeighborhoodReflowC3(project,'RD-0103',{x:0,y:15});
 assert.equal(blocked.candidateProject,null);
 assert.ok(blocked.unresolved.some(x=>x.code==='parcel-decision-required'));
 const report=blocked.parcelReview?.find(r=>r.id===retired.oldId);
 assert.ok(report,'Expected authored parcel eligibility data');
 assert.equal(Array.isArray(report.options),true);
 const forbidden=prepareNeighborhoodReflowC3(project,'RD-0103',{x:0,y:15},
   undefined,new Map(),{parcelChoices:new Map([[retired.oldId,{kind:'retire',targetId:'wrong'}]])});
 assert.equal(forbidden.candidateProject,null);
 assert.equal(JSON.stringify(project),before);
});
