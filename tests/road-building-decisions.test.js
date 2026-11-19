import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { roadBuildingOccupiedPlots } from '../src/core/road-building-decisions.js';
import { classifyRoadProvenance } from '../src/core/road-provenance.js';
import { defaultWorkspace, createProjectDocument, decodeProjectDocument, encodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

const fixture = morphology => createProject({seed:'c2-'+morphology,size:'small',morphology});
const hall='BLD-00061', street='RD-0113', offset={x:0,y:18};
const reflow=(p,decision)=>prepareNeighborhoodReflowC3(p,street,offset,undefined,
  decision ? new Map([[hall,decision]]) : undefined);

test('C5 preserves the identity of a custom building through automatic and exact authorized placement',()=>{
  const p=fixture('planned'), building=p.city.buildings.find(row=>row.id===hall);
  building.customName='Market Hall';
  const original=structuredClone(p);
  assert.equal(reflow(p).unresolved[0].code,'building-decision-required');
  assert.equal(reflow(p,{kind:'fixed'}).unresolved[0].code,'building-placement-blocked');
  assert.equal(reflow(p,{kind:'position',x:100000,y:0,angle:0}).unresolved[0].code,'building-placement-blocked');
  const auto=reflow(p,{kind:'auto'});
  assert.ok(auto.candidateProject,auto.unresolved[0]?.message);
  const next=auto.candidateProject.city.buildings.find(row=>row.id===hall);
  assert.equal(next.customName,building.customName);
  assert.equal(classifyRoadProvenance(next),'custom');
  assert.notDeepEqual(next.footprint,building.footprint);
  assert.equal(next.holes.length,building.holes.length);
  assert.equal(auto.ledger.find(row=>row.oldId===hall).disposition,'authorized-relocation');
  const parcel=auto.candidateProject.city.properties.find(row=>row.id===next.propertyId);
  assert.ok(parcel.buildingIds.includes(hall));
  const center=parcel.boundary.reduce((sum,point)=>({
    x:sum.x+point.x/parcel.boundary.length,y:sum.y+point.y/parcel.boundary.length,
  }),{x:0,y:0});
  const positioned=reflow(p,{kind:'position',...center,angle:next.orientation-building.orientation});
  assert.ok(positioned.candidateProject,positioned.unresolved[0]?.message);
  const exact=positioned.candidateProject.city.buildings.find(row=>row.id===hall);
  assert.ok(exact.footprint.every((point,i)=>Math.hypot(point.x-next.footprint[i].x,point.y-next.footprint[i].y)<1e-8));
  assert.deepEqual(p,original);
});

test('C5 keeps an older unknown footprint fixed and reconnects its entrance only with a choice',()=>{
  const p=fixture('organic'), id='BLD-00033';
  const before=p.city.buildings.find(row=>row.id===id);
  delete before.roadProvenance;
  const prepare=decisions=>prepareNeighborhoodReflowC3(p,'RD-0160',{x:0,y:15},undefined,decisions);
  assert.equal(prepare().unresolved[0].code,'building-decision-required');
  const fixed=prepare(new Map([[id,{kind:'fixed'}]]));
  assert.ok(fixed.candidateProject,fixed.unresolved[0]?.message);
  const after=fixed.candidateProject.city.buildings.find(row=>row.id===id);
  assert.deepEqual(after.footprint,before.footprint);
  assert.deepEqual(after.entrance,before.entrance);
  assert.notDeepEqual(after.accessPath,before.accessPath);
  assert.equal(classifyRoadProvenance(after),'unknown');
});

test('C5 automatically refits a generated multi-plot building and recomputes its access and plot occupancy',()=>{
  const p=fixture('organic'), id='BLD-00055';
  const before=p.city.buildings.find(row=>row.id===id);
  assert.ok(before.plotIds.length>1 || before.holes.length);
  const result=prepareNeighborhoodReflowC3(p,'RD-0160',{x:0,y:15});
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  assert.equal(result.ledger.find(row=>row.oldId===id).disposition,'relocated');
  const city=result.candidateProject.city, building=city.buildings.find(row=>row.id===id);
  assert.equal(building.holes.length,before.holes.length);
  assert.equal(classifyRoadProvenance(building),'generated');
  const property=city.properties.find(row=>row.id===building.propertyId);
  const plots=property.plotIds.map(plotId=>city.plots.find(row=>row.id===plotId));
  assert.deepEqual(roadBuildingOccupiedPlots(building,plots),building.plotIds);
  assert.deepEqual(building.accessPath[0],building.entrance);
});

test('C5 standalone clears decisions on a new road position and keeps Apply and history atomic',async()=>{
  const app=await buildingAppHarness(), p=fixture('planned');
  p.city.buildings.find(row=>row.id===hall).customName='Market Hall';
  app.apply({project:p,workspace:defaultWorkspace(p)});
  const state=app.state(), session=state.roadWorkspace.session;
  const before=JSON.stringify(state.project), revision=state.files.revision;
  state.roadWorkspace.start();
  session.schedule=fn=>{fn();};
  session.select({kind:'road',id:street});
  session.updateRoadIntent(offset,{defer:false});
  assert.equal(app.el('roadApplyB4').disabled,true);
  assert.equal(session.decideBuilding(hall,{kind:'auto'}),true);
  assert.equal(app.el('roadApplyB4').disabled,false);
  app.el('roadClearBuildingChoicesC5').handlers.click();
  assert.equal(app.el('roadApplyB4').disabled,true);
  session.decideBuilding(hall,{kind:'auto'});
  session.updateRoadIntent({x:0,y:18.5},{defer:false});
  assert.equal(session.buildingDecisions.size,0);
  session.updateRoadIntent(offset,{defer:false});
  session.decideBuilding(hall,{kind:'auto'});
  assert.equal(JSON.stringify(app.state().project),before);
  app.el('roadApplyB4').handlers.click();
  const applied=JSON.stringify(app.state().project);
  assert.notEqual(applied,before);
  assert.equal(state.files.revision,revision+1);
  const captured=app.capture();
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(captured.project,captured.workspace)));
  assert.equal(JSON.stringify(portable.project),applied);
  assert.equal(app.moveRoadHistory('undo'),true);
  assert.equal(JSON.stringify(app.state().project),before);
  assert.equal(app.moveRoadHistory('redo'),true);
  assert.equal(JSON.stringify(app.state().project),applied);
});

test('C5 preserves the courtyard hole and plot occupancy when a generated building reconnects',()=>{
  const p=fixture('organic'), id='BLD-00114';
  const before=p.city.buildings.find(row=>row.id===id);
  assert.equal(before.holes.length,1);
  const result=prepareNeighborhoodReflowC3(p,'RD-0187',{x:-15,y:0});
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  const city=result.candidateProject.city;
  const after=city.buildings.find(row=>row.id===id);
  const property=city.properties.find(row=>row.id===after.propertyId);
  assert.deepEqual(after.holes,before.holes);
  assert.deepEqual(after.footprint,before.footprint);
  assert.deepEqual(roadBuildingOccupiedPlots(after,property.plotIds.map(plotId=>
    city.plots.find(plot=>plot.id===plotId))),after.plotIds);
  assert.notDeepEqual(after.accessPath,before.accessPath);
});
