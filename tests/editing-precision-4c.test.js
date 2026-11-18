import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { BuildingEditSession } from '../src/editor/building.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { BuildingPlacementSession3H } from '../src/editor/building-structures.js';
import { nudgeBuilding4C,nudgePropertyCorner4C,nudgeStructure4C,
  buildingMeasurements4C,propertyMeasurements4C,placementMeasurements4C,
  formatPrecision4C } from '../src/core/editing-precision-4c.js';

function setup() {
  const project=createProject({seed:'precision4c-qa',size:'small',morphology:'organic'});
  const city=project.city;
  const property=city.properties.find(p=>p.boundary?.length===4 && p.buildingIds?.length);
  assert.ok(property);
  return {city,property,building:city.buildings.find(b=>b.id===property.buildingIds[0])};
}

test('Dev4c building nudges and rotation/scale measurements stay preview-only',()=>{
  const {city,building}=setup(),initial=JSON.stringify(city),session=new BuildingEditSession();
  assert.equal(session.start(city,{buildings:true},building.id),true);
  assert.equal(nudgeBuilding4C(session,'dx',1,.5),true);
  assert.equal(nudgeBuilding4C(session,'dx',-1,.1),true);
  assert.equal(session.transform.dx,.4);
  assert.equal(nudgeBuilding4C(session,'x',1,.5),false);
  assert.equal(nudgeBuilding4C(session,'dy',1,.3),false);
  assert.equal(session.setTransform({angle:Math.PI/4,scaleX:1.25,scaleY:0.8}),true);
  const m=buildingMeasurements4C(city,session);
  assert.ok(m.width>0 && m.depth>0 && m.area>0);
  assert.ok(Math.abs(m.areaDelta)>0);
  assert.equal(JSON.stringify(city),initial);
  session.drag={};
  assert.equal(nudgeBuilding4C(session,'dx',1,1),false);
  session.drag=null;
  session.reset();
  assert.equal(session.isPending,false);
  assert.equal(JSON.stringify(city),initial);
});

test('Dev4c property corner nudges retain ownership and measure draft deltas',()=>{
  const {city,property}=setup(),before=JSON.stringify(city),session=new PropertyEditSession3I();
  assert.equal(session.start(city,property.id),true);
  assert.equal(nudgePropertyCorner4C(session,'x',1,.1),false);
  session.selectCorner(0);
  const initial=session.boundary[0].x;
  assert.equal(nudgePropertyCorner4C(session,'x',1,.1),true);
  assert.ok(Math.abs(session.boundary[0].x-initial-.1)<1e-7);
  const m=propertyMeasurements4C(city,session);
  assert.ok(m && Number.isFinite(m.areaDelta) && m.width>0 && m.depth>0);
  assert.equal(nudgePropertyCorner4C(session,'x',1,9),false);
  assert.equal(JSON.stringify(city),before);
  session.reset();
  assert.equal(session.isPending,false);
});

test('Dev4c placement nudge shares placement update/preview validation, not accepted geometry',()=>{
  const {city,property}=setup(),before=JSON.stringify(city),session=new BuildingPlacementSession3H();
  assert.equal(session.start(city,property.id),true);
  const old=session.spec.u;
  assert.equal(nudgeStructure4C(session,'u',1,1),true);
  assert.equal(session.spec.u,old+1);
  assert.equal(nudgeStructure4C(session,'v',-1,.5),true);
  assert.equal(nudgeStructure4C(session,'bad',1,1),false);
  const metrics=placementMeasurements4C(city,session);
  assert.ok(metrics===null || metrics.width>0 && Number.isFinite(metrics.area));
  assert.equal(JSON.stringify(city),before);
  session.stop();
  assert.equal(nudgeStructure4C(session,'u',1,1),false);
  assert.equal(formatPrecision4C(1.23456),'1.23');
});
