import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { buildingFrame, previewBuildingGeometry } from '../src/core/building-transform.js';
import { drawBuildingSelection } from '../src/renderer/building-selection.js';
import { hitBuilding } from '../src/core/building-selection.js';
import { pointInPolygon } from '../src/core/geometry.js';
import { BuildingEditSession } from '../src/editor/building.js';
import { prepareBuildingApply } from '../src/editor/building-application.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { classifyRoadProvenance } from '../src/core/road-provenance.js';

const clone = value => JSON.parse(JSON.stringify(value));
function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

const makeCity = () => createProject({seed:'S10-B-raw-renderer-regression', size:'small', morphology:'planned'});

test('S10-B raw serialized project validates while deeply frozen without adding display fields', () => {
  const raw=freezeTree(clone(makeCity()));
  const prior=JSON.stringify(raw);
  assert.equal(raw.schemaVersion,10);
  assert.equal(Object.hasOwn(raw.city.buildings[0],'footprint'),false);
  assert.equal(validateStoredProject(raw),raw);
  assert.equal(JSON.stringify(raw),prior);
});

test('S10-B frame and preview read detached canonical records without rehydration or mutation', () => {
  const raw=freezeTree(clone(makeCity().city.buildings[0]));
  const prior=JSON.stringify(raw);
  const frame=buildingFrame(raw), preview=previewBuildingGeometry(raw, {dx:0.12,dy:-0.08});
  assert.ok(frame.width>0 && frame.height>0);
  assert.ok(preview.footprint.length>=3);
  assert.notEqual(preview.footprint[0].x,raw.geometry.regions[0].ring[0].x);
  assert.equal(JSON.stringify(raw),prior);
  assert.equal(Object.hasOwn(raw,'footprint'),false);
});

test('S10-B selection and hit-testing accept raw canonical geometry without writable legacy fields', () => {
  const project=makeCity(),building=freezeTree(clone(project.city.buildings[0]));
  const prior=JSON.stringify(building);
  const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},setLineDash(){},stroke(){}};
  let drawCalls=0;
  const camera={worldToScreen:p=>{drawCalls++;return p;}};
  drawBuildingSelection(ctx,camera,[building],{buildings:true}, {kind:'building',id:building.id},null);
  assert.ok(drawCalls>=3);
  const footprint=building.geometry.regions.find(r=>r.parentId===null).ring;
  const center={x:footprint.reduce((a,p)=>a+p.x,0)/footprint.length,y:footprint.reduce((a,p)=>a+p.y,0)/footprint.length};
  const point=pointInPolygon(center,footprint)?center:footprint[0];
  assert.deepEqual(hitBuilding(point,[building],1,{buildings:true}),{kind:'building',id:building.id});
  assert.equal(JSON.stringify(building),prior);
});

test('S10-B transient vertex editing actually updates canonical geometry without a second persisted footprint', () => {
  const project=createProject({seed:'s10b-p3-edit-draft',size:'small',morphology:'planned'});
  const source=project.city.buildings.find(b=>b.geometry.regions[0].ring.length===4);
  assert.ok(source,'requires one generated four-corner building');
  const original=JSON.stringify(project);
  const originalRegion=clone(source.geometry.regions[0].ring);
  assert.equal(classifyRoadProvenance(source),'generated');
  const session=new BuildingEditSession();
  assert.equal(session.start(project.city,{buildings:true},source.id),true);
  assert.equal(session.setTool('edges'),true);
  assert.equal(session.selectDirectHandle(project.city,1),true);
  assert.equal(session.editDirectGeometry(project.city,'insert',undefined),true);
  const result=prepareBuildingApply(project,defaultWorkspace(project),source.id,session.transform,session.draft);
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  const edited=result.candidate.city.buildings.find(b=>b.id===source.id);
  assert.equal(edited.geometry.regions[0].ring.length,originalRegion.length+1);
  assert.notDeepEqual(edited.geometry.regions[0].ring,originalRegion);
  assert.equal(classifyRoadProvenance(edited),'custom');
  assert.equal(edited.id,source.id);
  const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(result.candidate,defaultWorkspace(result.candidate))));
  const persisted=JSON.parse(JSON.stringify(saved.project.city.buildings.find(b=>b.id===source.id)));
  assert.equal(Object.hasOwn(persisted,'footprint'),false);
  assert.equal(Object.hasOwn(persisted,'holes'),false);
  assert.deepEqual(persisted.geometry,edited.geometry);
  assert.equal(JSON.stringify(project),original);
});
