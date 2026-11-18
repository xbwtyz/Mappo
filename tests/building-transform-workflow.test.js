import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAppHarness } from './helpers/building-app.js';
import { buildingPreviewHandles } from '../src/core/building-transform.js';
import { hitBuilding } from '../src/core/building-selection.js';
import { createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';

const copy=value=>JSON.parse(JSON.stringify(value));
function open(app) {
  const state=app.state();
  const property=state.project.city.properties.find(p=>p.buildingIds.length>1);
  assert.ok(property);
  state.propertyWorkspace.select({kind:'property',id:property.id});
  const buttons=app.el('workspaceSelectionSections').children.flatMap(s=>s.children??[]);
  const child=buttons.find(b=>b.attributes?.['data-inspector-kind']==='building'&&b.attributes?.['data-inspector-id']===property.buildingIds[0]);
  assert.ok(child);child.handlers.click();
  const edit=app.el('workspaceSelectionSections').children.flatMap(s=>s.children??[])
    .find(b=>b.textContent==='Edit building footprint');
  assert.ok(edit);edit.handlers.click();
  return { property, building:state.project.city.buildings.find(b=>b.id===property.buildingIds[0]) };
}
function roofPoint(app,building) {
  const {project,camera}=app.state(),c=building.footprint.reduce((p,v)=>({x:p.x+v.x/building.footprint.length,y:p.y+v.y/building.footprint.length}),{x:0,y:0});
  for(let i=0;i<building.footprint.length;i++){
    const a=building.footprint[i],b=building.footprint[(i+1)%building.footprint.length];
    const point={x:.45*(a.x+b.x)+.1*c.x,y:.45*(a.y+b.y)+.1*c.y};
    if(hitBuilding(point,project.city.buildings,camera.zoom)?.id===building.id)return camera.worldToScreen(point);
  }
  assert.fail('Expected a roof point');
}
test('3G-B compiled numeric controls preview move/rotate/resize without changing portable city',async()=>{
  const app=await buildingAppHarness(), state=app.state(), before=JSON.stringify(state.project.city);
  const {building}=open(app),session=state.buildingEditSession;
  assert.equal(app.el('buildingTransformPanel').hidden,false);
  assert.equal(session.isActive,true);
  app.el('buildingOffsetX').value='9.5';app.el('buildingOffsetX').handlers.change();
  assert.equal(session.transform.dx,9.5);
  assert.equal(session.isPending,true);
  assert.notDeepEqual(copy(session.previewFor(state.project.city).footprint),copy(building.footprint));
  app.el('buildingToolRotate').handlers.click();
  app.el('buildingAngle').value='30';app.el('buildingAngle').handlers.change();
  assert.ok(Math.abs(session.transform.angle-Math.PI/6)<1e-9);
  app.el('buildingToolResize').handlers.click();
  const base=building.footprint.map(p=>p.x),width=Math.max(...base)-Math.min(...base);
  app.el('buildingWidth').value=String(width*1.25);
  app.el('buildingWidth').handlers.change();
  assert.ok(Math.abs(session.transform.scaleX-1.25)<1e-8);
  assert.equal(JSON.stringify(state.project.city),before);
  const captured=app.capture();
  const doc=decodeProjectDocument(encodeProjectDocument(createProjectDocument(captured.project,captured.workspace)));
  assert.equal(doc.project.schemaVersion,9);
  assert.equal(JSON.stringify(doc.project.city),before);
  assert.equal(JSON.stringify(captured.workspace).includes('buildingTransform'),false);
  assert.equal(JSON.stringify(captured.workspace).includes('buildingEditSession'),false);
  app.el('buildingPreviewReset').handlers.click();
  assert.equal(session.isPending,false);
  assert.equal(session.isActive,true);
  app.el('buildingPreviewCancel').handlers.click();
  assert.equal(session.isActive,false);
  assert.equal(JSON.stringify(state.project.city),before);
});
test('3G-B compiled Canvas gestures translate, rotate and scale previews while leaving panning intact',async()=>{
  const app=await buildingAppHarness(),state=app.state(),before=JSON.stringify(state.project.city);
  const {building}=open(app), session=state.buildingEditSession;
  const point=roofPoint(app,building), shifted={x:point.x+17,y:point.y+11};
  app.fire('pointerdown',point);app.fire('pointermove',shifted);app.fire('pointerup',shifted);
  assert.ok(Math.abs(session.transform.dx)>0.01);
  assert.equal(JSON.stringify(state.project.city),before);
  session.reset();session.setTool('rotate');
  const rotate=buildingPreviewHandles(building,session.transform,state.camera.zoom).find(h=>h.kind==='rotate');
  const handle=state.camera.worldToScreen(rotate), next={x:handle.x+15,y:handle.y+18};
  app.fire('pointerdown',handle);app.fire('pointermove',next);app.fire('pointerup',next);
  assert.ok(Math.abs(session.transform.angle)>0.01);
  session.reset();session.setTool('resize');
  const corner=buildingPreviewHandles(building,session.transform,state.camera.zoom).find(h=>h.sx===1&&h.sy===1);
  const cornerPoint=state.camera.worldToScreen(corner),target={x:cornerPoint.x+13,y:cornerPoint.y+9};
  app.fire('pointerdown',cornerPoint);app.fire('pointermove',target);app.fire('pointerup',target);
  assert.ok(session.transform.scaleX>1||session.transform.scaleY>1);
  const checkpoint=copy(session.transform);
  app.fire('pointerdown',point,{button:1});
  app.fire('pointermove',{x:point.x+22,y:point.y});
  app.fire('pointerup',{x:point.x+22,y:point.y},{button:1});
  assert.deepEqual(copy(session.transform),checkpoint);
  assert.equal(JSON.stringify(state.project.city),before);
  app.apply(decodeProjectDocument(encodeProjectDocument(createProjectDocument(app.capture().project,app.capture().workspace))));
  assert.equal(app.state().buildingEditSession.isActive,false);
  assert.equal(JSON.stringify(app.state().project.city),before);
});
