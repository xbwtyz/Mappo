import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {validateRoadGroupApplyB1} from '../src/editor/road-application.js';
import {prepareRoadGroupIntentB1} from '../src/core/road-intent-c1.js';
import {verifyLareGroupPreservation} from '../src/core/reconciliation-preservation.js';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
import {copyJson,defaultWorkspace} from '../src/data/project-format.js';
import {AcceptedEditHistoryD01} from '../src/core/accepted-edit-history-d01.js';
import {partitionPropertyPolygon024} from '../src/core/property-polygons-024.js';
import {validatePlotTiling027} from '../src/core/plot-partition-027.js';
import {reshapeRoadParcelPolygon} from '../src/core/road-parcel-shape-reflow.js';
import {STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../src/core/placement.js';

const offset={x:.05,y:0};
for(const [morphology,seed,ids,parcels] of [
  ['organic','b1-organic',['RD-0116','RD-0123'],['PROP-00048','PROP-00050','PROP-00054']],
  ['radial','b1-radial',['RD-0100','RD-0152'],['PROP-00059']],
  ['linear','b1-linear',['RD-0122','RD-0123'],['PROP-00049','PROP-00070']]
])test('Irregular road reflow: '+morphology+' previously blocked five-corner parcels',()=>{
  const project=createProject({seed,size:'small',morphology,irregularProperties:true});
  const before=JSON.stringify(project);
  const preview=prepareRoadGroupReflowB1(project,ids,offset);
  assert.ok(preview.candidateProject,JSON.stringify(preview.unresolved));
  const receipt=validateRoadGroupApplyB1(project,defaultWorkspace(project),{selectedRoadIds:ids,offset},preview);
  assert.ok(receipt.ok,JSON.stringify(receipt.issues));
  // Accepted geometry must use the same numeric representation as portable
  // storage and history (including canonical +0 rather than -0).
  assert.deepEqual(receipt.candidate,copyJson(receipt.candidate));
  assert.deepEqual(receipt.workspace,copyJson(receipt.workspace));
  assert.equal(JSON.stringify(receipt.candidate),JSON.stringify(preview.candidateProject));
  for(const id of parcels){
    const original=project.city.properties.find(p=>p.id===id),next=receipt.candidate.city.properties.find(p=>p.id===id);
    assert.equal(original.boundary.length,5);assert.equal(next.boundary.length,5);
    assert.deepEqual(next.plotIds,original.plotIds);
    assert.ok(preview.changed.some(row=>row.kind==='property'&&row.id===id));
  }
  for(const collection of ['properties','plots','buildings'])
    assert.deepEqual(receipt.candidate.city[collection].map(r=>r.id).sort(),project.city[collection].map(r=>r.id).sort());
  const h=new AcceptedEditHistoryD01();h.clear(project);
  assert.equal(h.record(project,receipt.candidate,receipt.transaction).status,'recorded');
  const undo=h.prepare('undo',receipt.candidate,receipt.workspace);
  assert.ok(undo.ok,undo.reason);assert.equal(JSON.stringify(undo.candidate),before);
  h.accept('undo',undo.entry,undo.candidate);
  const redo=h.prepare('redo',undo.candidate,undo.workspace);
  assert.ok(redo.ok,redo.reason);assert.deepEqual(redo.candidate,receipt.candidate);
  assert.equal(JSON.stringify(project),before);
});
test('Irregular authored parcel still requires a choice and preserves its name and identities',()=>{
  const project=createProject({seed:'b1-organic',size:'small',morphology:'organic',irregularProperties:true});
  const parcel=project.city.properties.find(p=>p.id==='PROP-00048');
  parcel.customName='Irregular authored yard';
  const before=JSON.stringify(project),ids=['RD-0116','RD-0123'];
  const blocked=prepareRoadGroupReflowB1(project,ids,offset);
  assert.equal(blocked.candidateProject,null);
  assert.ok(blocked.unresolved.some(row=>row.id===parcel.id&&row.code==='parcel-decision-required'));
  const choices=new Map([[parcel.id,{kind:'reshape'}]]);
  const result=prepareRoadGroupReflowB1(project,ids,offset,{parcelChoices:choices});
  assert.ok(result.candidateProject,JSON.stringify(result.unresolved));
  const receipt=validateRoadGroupApplyB1(project,defaultWorkspace(project),{
    selectedRoadIds:ids,offset,parcelChoices:choices,
  },result);
  assert.ok(receipt.ok,JSON.stringify(receipt.issues));
  const next=result.candidateProject.city.properties.find(p=>p.id===parcel.id);
  assert.equal(next.customName,parcel.customName);assert.deepEqual(next.plotIds,parcel.plotIds);
  for(const id of parcel.buildingIds){
    const old=project.city.buildings.find(b=>b.id===id),updated=result.candidateProject.city.buildings.find(b=>b.id===id);
    assert.deepEqual(updated.geometry,old.geometry);
    assert.deepEqual(updated.entrance,old.entrance);
    assert.deepEqual(updated.accessPath[0],old.accessPath[0]);
    assert.equal(updated.frontageRoadId,old.frontageRoadId);
  }
  const reconnected=result.changed.find(row=>row.kind==='building'&&parcel.buildingIds.includes(row.id)&&row.fields.includes('accessPath'));
  assert.ok(reconnected);
  const altered=copyJson(result.candidateProject), alteredBuilding=altered.city.buildings.find(row=>row.id===reconnected.id);
  alteredBuilding.accessPath[1].x+=.01;
  assert.equal(verifyLareGroupPreservation(project,altered,prepareRoadGroupIntentB1(project,ids,offset),
    choices,createLareBudget()).code,'lare-protected-access');
  assert.equal(JSON.stringify(project),before);
});
test('Concave affine reflow preserves all convex plot cells and refuses an impossible fixed building',()=>{
  const kind='primary',front=(STREET_WIDTHS[kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK+.05;
  const boundary=[{x:20,y:front},{x:40,y:front},{x:40,y:front+24},{x:30,y:front+14},{x:20,y:front+24}];
  const plots=partitionPropertyPolygon024(boundary).map((boundary,i)=>({id:'P'+i,boundary}));
  assert.ok(plots.length>1);
  const property={id:'X',boundary,plotIds:plots.map(p=>p.id)};
  const before=JSON.stringify({property,plots});
  const points=[{x:0,y:1},{x:100,y:1},{x:100,y:100},{x:0,y:100}];
  const edges=points.map((a,i)=>({a,b:points[(i+1)%4],road:{id:'R'+i,kind}}));
  const result=reshapeRoadParcelPolygon(property,plots,edges[0],edges,front,[{x:25,y:front+10}]);
  assert.equal(result.property.boundary.length,boundary.length);
  assert.deepEqual(result.plots.map(p=>p.id),property.plotIds);
  assert.equal(validatePlotTiling027(result.property.boundary,result.plots).plotCount,plots.length);
  assert.throws(()=>reshapeRoadParcelPolygon(property,plots,edges[0],edges,front,[{x:500,y:500}]),/No safe polygon reshape/);
  assert.equal(JSON.stringify({property,plots}),before);
});
