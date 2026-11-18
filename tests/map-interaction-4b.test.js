import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/renderer/camera.js';
import { createProject } from '../src/core/city-model.js';
import { selectionFocusPoints4B, focusCameraOnSelection4B } from '../src/core/selection-focus-4b.js';
import { drawSelectionAccents4B } from '../src/renderer/selection-accents-4b.js';
import { buildingAppHarness } from './helpers/building-app.js';

function trial(){
  const city=createProject({seed:'dev4b-selection-focus',size:'small',morphology:'organic'}).city;
  return {city,property:city.properties.find(p=>p.buildingIds.length>0)};
}

test('Dev4b focuses exact property/building polygons, clamps zoom and preserves data',()=>{
  const {city,property}=trial();
  const before=JSON.stringify(city);
  const building=city.buildings.find(b=>b.id===property.buildingIds[0]);
  const camera=new Camera();
  camera.resize(390,650);
  const propRef={kind:'property',id:property.id};
  assert.strictEqual(selectionFocusPoints4B(city,propRef),property.boundary);
  assert.equal(focusCameraOnSelection4B(camera,city,propRef),true);
  assert.ok(camera.zoom>=.18&&camera.zoom<=12);
  const minX=Math.min(...property.boundary.map(p=>p.x)),maxX=Math.max(...property.boundary.map(p=>p.x));
  const minY=Math.min(...property.boundary.map(p=>p.y)),maxY=Math.max(...property.boundary.map(p=>p.y));
  assert.ok(Math.abs(camera.x-(minX+maxX)/2)<.0001);
  assert.ok(Math.abs(camera.y-(minY+maxY)/2)<.0001);
  const bRef={kind:'building',id:building.id};
  assert.strictEqual(selectionFocusPoints4B(city,bRef),building.footprint);
  assert.equal(focusCameraOnSelection4B(camera,city,bRef),true);
  assert.ok(camera.zoom>=.18&&camera.zoom<=12);
  const previous=[camera.x,camera.y,camera.zoom];
  for(const ref of [null,{kind:'property',id:'not-real'},{kind:'road',id:property.id}]){
    assert.equal(focusCameraOnSelection4B(camera,city,ref),false);
    assert.deepEqual([camera.x,camera.y,camera.zoom],previous);
  }
  assert.equal(JSON.stringify(city),before);
});

test('Dev4b selected property corners and plot dividers are view-only and layer aware',()=>{
  const polygon=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
  const city={properties:[{id:'p',boundary:polygon,plotIds:['a']}],
    buildings:[{id:'b',footprint:polygon,propertyId:'p'}],
    plots:[{id:'a',propertyId:'p',boundary:polygon}]};
  const before=JSON.stringify(city),events=[];
  const ctx={
    save(){events.push('save')},restore(){events.push('restore')},
    beginPath(){events.push('begin')},moveTo(){},lineTo(){},closePath(){},
    stroke(){events.push('stroke')},setLineDash(x){events.push('dash'+x.length)},
    fillRect(){events.push('marker')},strokeRect(){events.push('marker-stroke')}
  };
  const camera={worldToScreen:p=>p};
  drawSelectionAccents4B(ctx,camera,city,{plots:true},{kind:'property',id:'p'});
  assert.equal(events.filter(e=>e==='marker').length,4);
  assert.equal(events.filter(e=>e==='stroke').length,1);
  assert.equal(events[0],'save');assert.equal(events.at(-1),'restore');
  events.length=0;
  drawSelectionAccents4B(ctx,camera,city,{plots:false},{kind:'property',id:'p'});
  assert.equal(events.filter(e=>e==='marker').length,4);
  assert.equal(events.filter(e=>e==='stroke').length,0);
  events.length=0;
  drawSelectionAccents4B(ctx,camera,city,{buildings:false},{kind:'building',id:'b'});
  assert.equal(events.length,0);
  drawSelectionAccents4B(ctx,camera,city,{buildings:true},{kind:'building',id:'b'});
  assert.equal(events.filter(e=>e==='marker').length,4);
  assert.equal(JSON.stringify(city),before);
});

test('Dev4b compiled Inspector focuses selected property and building without editing city',async()=>{
  const app=await buildingAppHarness(),state=app.state();
  const building=state.project.city.buildings[0],id=building.propertyId;
  const original=JSON.stringify(state.project.city);
  state.propertyWorkspace.select({kind:'property',id});
  let buttons=app.el('workspaceSelectionSections').children.flatMap(c=>c.children??[]);
  const propertyFocus=buttons.find(b=>b.textContent==='Zoom to this property');
  assert.ok(propertyFocus,'Property Inspector must offer zoom-to-selection');
  propertyFocus.handlers.click();
  const property=state.project.city.properties.find(p=>p.id===id);
  const minX=Math.min(...property.boundary.map(p=>p.x)),maxX=Math.max(...property.boundary.map(p=>p.x));
  assert.ok(Math.abs(state.camera.x-(minX+maxX)/2)<.0001);
  state.buildingWorkspace.select({kind:'building',id:building.id});
  buttons=app.el('workspaceSelectionSections').children.flatMap(c=>c.children??[]);
  const buildingFocus=buttons.find(b=>b.textContent==='Zoom to this building');
  assert.ok(buildingFocus,'Building Inspector must offer zoom-to-selection');
  buildingFocus.handlers.click();
  const minY=Math.min(...building.footprint.map(p=>p.y)),maxY=Math.max(...building.footprint.map(p=>p.y));
  assert.ok(Math.abs(state.camera.y-(minY+maxY)/2)<.0001);
  assert.equal(JSON.stringify(state.project.city),original);
});
