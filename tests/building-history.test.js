import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument, copyJson } from '../src/data/project-format.js';
import { prepareBuildingApply, prepareBuildingCandidate } from '../src/editor/building-application.js';
import { BuildingGeometryHistory } from '../src/editor/building-history.js';
import { buildingAppHarness } from './helpers/building-app.js';

const shifts = [{dx:.2},{dx:-.2},{dy:.2},{dy:-.2},{scaleX:.98,scaleY:.98},{scaleX:.95,scaleY:.95}];
function safeEdit(project) {
  for (const building of project.city.buildings.slice(0,90)) {
    for (const transform of shifts) {
      if (prepareBuildingCandidate(project,building.id,transform).ok) return {building,transform};
    }
  }
  throw new Error('Could not locate a safe generated building edit.');
}
function selectBuilding(app,building) {
  const state=app.state();
  state.propertyWorkspace.select({kind:'property',id:building.propertyId});
  const children=app.el('workspaceSelectionSections').children.flatMap(s=>s.children??[]);
  const link=children.find(b=>b.attributes?.['data-inspector-kind']==='building'&&b.attributes?.['data-inspector-id']===building.id);
  assert.ok(link); link.handlers.click();
  const edit=app.el('workspaceSelectionSections').children.flatMap(s=>s.children??[])
    .find(b=>b.textContent==='Edit building footprint');
  assert.ok(edit); edit.handlers.click();
  return state.buildingEditSession;
}
test('3G-D1 bounded scoped history restores geometry and preserves unrelated identity',()=>{
  const original=createProject({seed:'3gd-history-pure',size:'small',morphology:'organic'});
  const choice=safeEdit(original);
  const changed=prepareBuildingApply(original,defaultWorkspace(original),choice.building.id,choice.transform);
  assert.equal(changed.ok,true,JSON.stringify(changed.issues));
  const history=new BuildingGeometryHistory(2);
  assert.equal(history.record(original,changed.candidate,choice.building.id),true);
  assert.equal(history.count('undo',choice.building.id),1);
  assert.equal(history.can('undo',changed.candidate,choice.building.id),true);
  const withIdentity=copyJson(changed.candidate);
  const namedBuilding = withIdentity.city.buildings.find(b=>b.id===choice.building.id);
  namedBuilding.customName='Cedar Hall';
  namedBuilding.type='inn';
  const undo=history.prepare(withIdentity,defaultWorkspace(withIdentity),choice.building.id,'undo');
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(undo.candidate.city.buildings.find(b=>b.id===choice.building.id).customName,'Cedar Hall');
  assert.equal(undo.candidate.city.buildings.find(b=>b.id===choice.building.id).type,'inn');
  assert.deepEqual(undo.candidate.city.buildings.find(b=>b.id===choice.building.id).footprint,
    original.city.buildings.find(b=>b.id===choice.building.id).footprint);
  history.accept(undo.entry,'undo');
  assert.equal(history.can('redo',undo.candidate,choice.building.id),true);
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),choice.building.id,'redo');
  assert.equal(redo.ok,true,redo.reason);
  history.accept(redo.entry,'redo');
  assert.deepEqual(redo.candidate.city.buildings.find(b=>b.id===choice.building.id).footprint,
    changed.candidate.city.buildings.find(b=>b.id===choice.building.id).footprint);
  assert.equal(redo.candidate.city.buildings.find(b=>b.id===choice.building.id).customName,'Cedar Hall');
  assert.equal(redo.candidate.city.buildings.find(b=>b.id===choice.building.id).type,'inn');
  assert.equal(history.count('redo',choice.building.id),0);
  history.clear(); assert.equal(history.count('undo',choice.building.id),0);
});
test('3G-D1 history capacity and unrelated building records remain independent',()=>{
  const poly=x=>[{x,y:0},{x:x+2,y:0},{x:x+2,y:2},{x,y:2}];
  const record=(id,dx)=>({id,propertyId:'p',footprint:poly(dx),holes:[],area:4,orientation:0,
    plotIds:['pl'],frontageRoadId:'r',entrance:{x:dx,y:0},accessPath:[{x:dx,y:0},{x:dx,y:-1}]});
  const project=(a,b)=>({city:{buildings:[record('a',a),record('b',b)]}});
  const history=new BuildingGeometryHistory(2);
  history.record(project(1,5),project(2,5),'a');
  history.record(project(2,5),project(2,6),'b');
  history.record(project(2,6),project(3,6),'a');
  assert.equal(history.past.length,2);
  assert.equal(history.count('undo','a'),1);
  assert.equal(history.count('undo','b'),1);
  assert.equal(history.can('undo',project(3,6),'a'),true);
  assert.equal(history.can('undo',project(3,6),'b'),true);
  const second=new BuildingGeometryHistory(2);
  second.record(project(1,5),project(2,5),'a');
  second.record(project(2,5),project(2,6),'b');
  second.accept(second.past[1],'undo');
  second.record(project(2,5),project(3,5),'a');
  assert.equal(second.past.length+second.future.length,2,'Combined history must obey capacity.');
});
test('3G-D2/D4 accepted UI transactions support scoped Undo/Redo and portable persistence',async()=>{
  const app=await buildingAppHarness();
  const initial=app.state().project,entry=safeEdit(initial),id=entry.building.id;
  const session=selectBuilding(app,entry.building);
  const beforeCity=JSON.stringify(initial.city);
  const startRevision=app.state().files.revision;
  session.setTransform(entry.transform);
  assert.equal(app.el('buildingPreviewApply').disabled,false);
  assert.equal(app.el('buildingHistoryUndo').disabled,true,'Draft is not an accepted edit.');
  assert.equal(app.el('buildingPreviewApply').handlers.click(),true);
  const acceptedCity=JSON.stringify(app.state().project.city);
  assert.notEqual(acceptedCity,beforeCity);
  assert.equal(app.state().buildingHistory.count('undo',id),1);
  assert.equal(app.el('buildingHistoryUndo').disabled,false);
  assert.equal(app.el('buildingHistoryRedo').disabled,true);
  assert.equal(app.el('buildingHistoryUndo').handlers.click(),true);
  assert.equal(JSON.stringify(app.state().project.city),beforeCity);
  assert.equal(app.el('buildingHistoryUndo').disabled,true);
  assert.equal(app.el('buildingHistoryRedo').disabled,false);
  assert.equal(app.el('buildingHistoryRedo').handlers.click(),true);
  assert.equal(JSON.stringify(app.state().project.city),acceptedCity);
  assert.ok(app.state().files.revision>=startRevision+3,'Apply, Undo and Redo mark recovery dirty.');
  const snapshot=app.capture();
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(snapshot.project,snapshot.workspace)));
  assert.equal(portable.project.schemaVersion,9);
  assert.equal(portable.workspace.schemaVersion,1);
  assert.equal(JSON.stringify(portable.project.city),acceptedCity);
  assert.doesNotMatch(JSON.stringify(portable),/buildingHistory|buildingEditSession/);
  app.apply(portable);
  assert.equal(JSON.stringify(app.state().project.city),acceptedCity,'Edited geometry must persist after loading.');
  assert.equal(app.state().buildingHistory.past.length,0,'Undo history is session-only.');
});
test('3G-D3 map keyboard shortcuts do not steal input focus or break preview safety',async()=>{
  const app=await buildingAppHarness();
  const choice=safeEdit(app.state().project),session=selectBuilding(app,choice.building);
  const original=JSON.stringify(app.state().project.city);
  session.setTransform(choice.transform);
  assert.equal(app.el('buildingPreviewApply').handlers.click(),true);
  const accepted=JSON.stringify(app.state().project.city);
  const keyboard=app.globalEvents.keydown[0];assert.ok(keyboard);
  let prevented=0;
  const event=(key,extra={})=>({key,ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,
    preventDefault(){prevented++;},...extra});
  keyboard(event('z',{target:{tagName:'INPUT'}}));
  assert.equal(JSON.stringify(app.state().project.city),accepted);
  keyboard(event('z',{target:{tagName:'BODY'}}));
  assert.equal(JSON.stringify(app.state().project.city),original);
  keyboard(event('y',{target:{tagName:'BODY'}}));
  assert.equal(JSON.stringify(app.state().project.city),accepted);
  assert.equal(prevented,2);
  assert.equal(session.setTransform({dx:-10000}),true,'The draft transform must remain active.');
  assert.equal(session.isPending,true,'Pending building draft blocks global accepted Undo.');
  keyboard(event('z',{target:{tagName:'BODY'}}));
  assert.equal(JSON.stringify(app.state().project.city),accepted,'Pending preview cannot affect accepted history.');
  assert.equal(app.el('buildingHistoryUndo').disabled,true);
});
