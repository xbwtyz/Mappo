import assert from 'node:assert/strict';
import test from 'node:test';
import { polygonSignedArea } from '../src/core/geometry.js';
import { joinBuildingExteriors } from '../src/core/building-footprint-union.js';
import { createS10GeometryBudget } from '../src/core/building-topology-s10.js';
import { prepareBuildingComponents } from '../src/editor/building-component-application.js';
import { prepareBuildingApply } from '../src/editor/building-application.js';
import { copyJson } from '../src/data/project-format.js';
import { buildingComponentFixture } from './helpers/building-component-fixture.js';

const rect = (x,y,w=4,h=4) => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
test('footprint unions resolve aligned seams, partial seams, crossings and concavity deterministically', () => {
  const source = rect(0,0);
  for (const [incoming,area] of [[rect(4,0),32],[rect(4,1),32],[rect(2,1),26]]) {
    const result = joinBuildingExteriors(source,incoming);
    assert.equal(polygonSignedArea(result),area);
    assert.deepEqual(result,joinBuildingExteriors(source,incoming));
    assert.equal(polygonSignedArea(joinBuildingExteriors(incoming,source)),area);
  }
  const concave = [{x:0,y:0},{x:4,y:0},{x:4,y:1},{x:1,y:1},{x:1,y:4},{x:0,y:4}];
  assert.equal(polygonSignedArea(joinBuildingExteriors(concave,rect(3,-1,2,2))),10);
  const rotated = rect(2,1).map(({x,y})=>({x:2+(x-2)*.8-(y-1)*.6,y:1+(x-2)*.6+(y-1)*.8}));
  assert.ok(polygonSignedArea(joinBuildingExteriors(source,rotated)) > 16);
});

test('footprint unions reject point contact, gaps, containment, newly enclosed voids and exhausted work', () => {
  const source=rect(0,0);
  assert.throws(()=>joinBuildingExteriors(source,rect(4,4)),/corner|seam/);
  assert.throws(()=>joinBuildingExteriors(source,rect(4.00000005,0)),/one outline|seam/);
  assert.throws(()=>joinBuildingExteriors(source,rect(1,1,2,2)),/contained/);
  const openCourtyard = [{x:0,y:0},{x:6,y:0},{x:6,y:6},{x:4,y:6},{x:4,y:2},{x:2,y:2},{x:2,y:6},{x:0,y:6}];
  assert.throws(()=>joinBuildingExteriors(openCourtyard,rect(1,5,4,2)),/one outline|courtyard/);
  assert.throws(()=>joinBuildingExteriors(source,rect(2,1),createS10GeometryBudget(10)),/budget/);
});

const {project,workspace,original,first,second} = buildingComponentFixture();
const building = model => model.city.buildings.find(b=>b.id===original.id);
const edit = (model,request,options) => prepareBuildingComponents(model,workspace,original.id,request,options);
function accepted(result) {
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  return result.candidate;
}
const multipart = accepted(edit(project,first));
const sourceId = building(multipart).components.find(c=>c.name===first.name).id;
const main = {action:'join',componentId:'BC-ROOT',incomingId:sourceId,transform:{dy:5.5},confirmJoin:true};

test('join confirms named retirement, preserves the destination and keeps the outline directly editable', () => {
  const before = JSON.stringify(multipart);
  const unconfirmed = {...main,confirmJoin:false};
  assert.match(edit(multipart,unconfirmed).issues[0].message,/Confirm/);
  assert.equal(edit(multipart,unconfirmed,{previewOnly:true}).preview.join.retiredName,first.name);
  const outcome = accepted(edit(multipart,main));
  const result = building(outcome);
  assert.equal(result.id,original.id);
  assert.equal(result.geometry.version,1);
  assert.equal(result.geometry.regions[0].id,original.geometry.regions[0].id);
  assert.equal(result.components.length,1);
  assert.equal(result.propertyId,original.propertyId);
  assert.ok(result.accessPath.length>=2);
  assert.equal(prepareBuildingApply(outcome,workspace,result.id,{dx:.1}).ok,true);
  assert.equal(JSON.stringify(multipart),before);
});

test('join retains other parts and rejects loss of metadata and child components', () => {
  const triple = accepted(edit(multipart,second));
  const merged = building(accepted(edit(triple,main)));
  const untouched = building(triple).components.find(c=>c.name===second.name);
  assert.equal(merged.geometry.version,3);
  assert.deepEqual(merged.components.find(c=>c.id===untouched.id),untouched);
  assert.deepEqual(merged.geometry.regions.find(r=>r.componentId===untouched.id),
    building(triple).geometry.regions.find(r=>r.componentId===untouched.id));
  const withChildren = accepted(edit(multipart,{...second,componentId:sourceId}));
  assert.match(edit(withChildren,main).issues[0].message,/children/);
  const annotated = copyJson(multipart);
  building(annotated).components.find(c=>c.id===sourceId).extension = {authored:true};
  assert.match(edit(annotated,main).issues[0].message,/metadata/);
});

test('join preserves intact courtyard IDs and blocks a footprint that fills them', () => {
  const withHole = copyJson(multipart), record = building(withHole);
  const root = record.geometry.regions.find(r=>r.componentId==='BC-ROOT');
  const hole = {id:'REG-COURT-TEST',kind:'void',parentId:root.id,ring:rect(first.x-.5,first.y+5+.5,1,1)};
  root.ring = rect(first.x-2,first.y+5,4,5);
  record.geometry.regions.push(hole);
  const moved = edit(withHole,{...main,transform:{dy:4.5}});
  assert.match(moved.issues[0].message,/existing courtyard/);
  const joined = accepted(edit(withHole,{...main,transform:{dy:3.5}}));
  assert.deepEqual(building(joined).geometry.regions.find(r=>r.id===hole.id),hole);
});

test('join rejects a new obstruction along another building’s accepted route', () => {
  const model = copyJson(multipart);
  const neighbor = model.city.buildings.find(b => b.id !== original.id);
  // The test route crosses only the new wing position, below the keep wall.
  const y = first.y + 4.25;
  neighbor.accessPath = [{x:first.x-3,y},{x:first.x+3,y}];
  assert.match(edit(model,main).issues[0].message,/block access for/);
});
