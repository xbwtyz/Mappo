import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { inspectPropertyEdit3I,preparePropertyApply3I } from '../src/editor/property-application.js';
import { PropertyGeometryHistory3I } from '../src/editor/property-history.js';
import { resolvePropertyFrontageGuideSFS, projectFrontageCornerSFS,translateFrontageSFS,
  editedFrontageAlignedSFS,frontageMidpointSFS } from '../src/core/property-frontage-constraints.js';
import { beginPropertyFrontageGestureSFS, proposePropertyFrontageGestureSFS,
  proposePropertyFrontageCoordinateSFS } from '../src/editor/property-frontage-snap.js';

function fixture(){
  const base=createProject({seed:'024-manual-polygon',size:'small',morphology:'planned'});
  for(const p of base.city.properties.filter(p=>p.boundary.length===4&&p.plotIds.length===1)){
    const edit=new PropertyEditSession3I();
    if(!edit.start(base.city,p.id)||!edit.addVertex(2))continue;
    const applied=preparePropertyApply3I(base,defaultWorkspace(base),edit);
    if(applied.ok)return {project:applied.candidate,id:p.id};
  }
  throw Error('No eligible five-sided property');
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const shift=(point,tangent,s)=>({x:point.x+tangent.x*s,y:point.y+tangent.y*s});

test('SFS P1: assigned road determines snapping, positive orientation, and seven-unit frontage',()=>{
  const {project,id}=fixture(),property=project.city.properties.find(p=>p.id===id);
  const guide=resolvePropertyFrontageGuideSFS(project.city,property);
  assert.ok(guide);
  assert.equal(guide.roadId,property.frontageRoadId);
  const boundary=property.boundary;
  for(const i of [0,1]){
    const moved=projectFrontageCornerSFS(boundary,guide,i,{
      x:boundary[i].x+guide.inward.x*4,
      y:boundary[i].y+guide.inward.y*4
    });
    assert.ok(editedFrontageAlignedSFS(moved,guide));
    assert.ok(Math.hypot(moved[0].x-moved[1].x,moved[0].y-moved[1].y)>=7-1e-7);
    assert.deepEqual(moved[1-i],boundary[1-i],'Opposite endpoint is fixed');
  }
  const far=projectFrontageCornerSFS(boundary,guide,1,boundary[0]);
  assert.ok(Math.abs(Math.hypot(far[0].x-far[1].x,far[0].y-far[1].y)-7)<1e-6);
  const translated=translateFrontageSFS(boundary,guide,{x:.25,y:1});
  assert.ok(editedFrontageAlignedSFS(translated,guide));
  assert.ok(Math.abs(Math.hypot(translated[0].x-translated[1].x,translated[0].y-translated[1].y)-guide.length)<1e-6);
  assert.ok(frontageMidpointSFS(boundary));
  const detached=structuredClone(property);
  detached.frontageRoadId='INVALID-ROAD';
  assert.equal(resolvePropertyFrontageGuideSFS(project.city,detached),null);
});

test('SFS P2/P3: frontage corner and midpoint gestures are safely constrained, draft-only',()=>{
  const {project,id}=fixture(),originalCity=JSON.stringify(project.city);
  const session=new PropertyEditSession3I();
  assert.ok(session.start(project.city,id));
  const guide=resolvePropertyFrontageGuideSFS(project.city,session.source(project.city));
  for(const index of [0,1]){
    const start=session.boundary[index];
    const gesture=beginPropertyFrontageGestureSFS(project,session,'corner',index,start);
    assert.equal(gesture.validStart,true);
    const pointer={x:start.x+guide.tangent.x*(index===0?-.2:.2)+guide.inward.x*12,
      y:start.y+guide.tangent.y*(index===0?-.2:.2)+guide.inward.y*12};
    const result=proposePropertyFrontageGestureSFS(project,session,gesture,pointer);
    assert.equal(result.ok,true,result.reason);
    const before=structuredClone(session.boundary);
    assert.ok(session.setFrontage(result.frontage));
    assert.equal(inspectPropertyEdit3I(project,session).ok,true);
    assert.deepEqual(session.boundary.slice(2),before.slice(2));
    session.reset();
  }
  const mid=frontageMidpointSFS(session.boundary);
  const gesture=beginPropertyFrontageGestureSFS(project,session,'edge',null,mid);
  const target={x:mid.x+guide.inward.x*100,y:mid.y+guide.inward.y*100};
  const result=proposePropertyFrontageGestureSFS(project,session,gesture,target);
  assert.equal(result.ok,true,result.reason);
  session.setFrontage(result.frontage);
  assert.equal(inspectPropertyEdit3I(project,session).ok,true);
  assert.equal(session.source(project.city).frontageRoadId,guide.roadId);
  assert.equal(JSON.stringify(project.city),originalCity,'Drag cannot mutate accepted city');
  session.reset();
  assert.deepEqual(session.boundary,session.source(project.city).boundary);
});

test('SFS P4: numeric constraints, historical frame drift, Apply, Undo/Redo and portable save',()=>{
  const {project,id}=fixture(),accepted=project.city.properties.find(p=>p.id===id);
  const before=JSON.stringify(project.city),guide=resolvePropertyFrontageGuideSFS(project.city,accepted);
  const originalFrame=structuredClone(accepted.frame);
  accepted.frame.inward={x:originalFrame.inward.x+.02*originalFrame.tangent.x,
    y:originalFrame.inward.y+.02*originalFrame.tangent.y};
  const savedBefore=JSON.stringify(project.city);
  const session=new PropertyEditSession3I();
  session.start(project.city,id);
  const axis=Math.abs(guide.tangent.x)>.5?'x':'y';
  const value=session.boundary[1][axis]+guide.tangent[axis]*.1;
  const result=proposePropertyFrontageCoordinateSFS(project,session,1,axis,value);
  assert.equal(result.ok,true,result.reason);
  assert.ok(editedFrontageAlignedSFS(result.frontage,guide));
  session.setFrontage(result.frontage);
  assert.equal(inspectPropertyEdit3I(project,session).ok,true);
  assert.equal(JSON.stringify(project.city),savedBefore,'Only the draft changes');
  if(session.frontageChanged){
    const receipt=preparePropertyApply3I(project,defaultWorkspace(project),session);
    assert.equal(receipt.ok,true,JSON.stringify(receipt.issues));
    validateStoredProject(receipt.candidate);
    const opened=decodeProjectDocument(encodeProjectDocument(
      createProjectDocument(receipt.candidate,defaultWorkspace(receipt.candidate))));
    assert.deepEqual(opened.project.city,receipt.candidate.city);
    const history=new PropertyGeometryHistory3I(20);
    assert.equal(history.record(project,receipt.candidate,id),true);
    const undo=history.prepare(receipt.candidate,defaultWorkspace(receipt.candidate),id,'undo');
    assert.equal(undo.ok,true);
    history.accept(undo.entry,'undo');
    const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),id,'redo');
    assert.equal(redo.ok,true);
    assert.deepEqual(redo.candidate.city,receipt.candidate.city);
  }
  assert.notEqual(JSON.stringify(project.city),before,'Fixture frame intentionally changed');
});

test('SFS P5: invalid draft is not silently rewritten by snapping',()=>{
  const {project,id}=fixture();
  const session=new PropertyEditSession3I();
  session.start(project.city,id);
  const inward=session.source(project.city).frame.inward,tip=session.boundary[1];
  session.setCorner(1,{x:tip.x+inward.x*2,y:tip.y+inward.y*2});
  assert.equal(inspectPropertyEdit3I(project,session).ok,false);
  const snapshot=structuredClone(session.boundary);
  const gesture=beginPropertyFrontageGestureSFS(project,session,'corner',1,session.boundary[1]);
  assert.equal(gesture.validStart,false);
  const moved=proposePropertyFrontageGestureSFS(project,session,gesture,shift(tip,inward,4));
  assert.equal(moved.ok,false);
  assert.deepEqual(session.boundary,snapshot);
});
