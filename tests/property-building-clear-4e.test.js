import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { copyJson, defaultWorkspace, createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { preparePropertyBuildingClear4E } from '../src/editor/property-building-clear-4e.js';
import { BuildingStructureHistory3H } from '../src/editor/building-structure-history.js';
import { describeStructureChange4E } from '../src/core/structure-history-feedback-4e.js';
import { buildingAppHarness } from './helpers/building-app.js';

function fixture() {
  const project=createProject({seed:'4e-bulk-structures',size:'small',morphology:'organic'});
  const property=project.city.properties.find(p=>p.buildingIds?.length>1)
    ??project.city.properties.find(p=>p.buildingIds?.length>0);
  assert.ok(property,'Expected a property with buildings');
  return {project,property,workspace:defaultWorkspace(project)};
}
test('Dev 4e clear is atomic, preserves plots/road/neighbors, and passes schema-9 roundtrip',()=>{
  const {project,property,workspace}=fixture(),old=JSON.stringify(project.city);
  const others=JSON.stringify(project.city.buildings.filter(b=>b.propertyId!==property.id));
  const before=property.buildingIds.length;
  const cleared=preparePropertyBuildingClear4E(project,workspace,property.id);
  assert.equal(cleared.ok,true,cleared.reason);
  assert.equal(cleared.count,before);
  assert.equal(cleared.candidate.schemaVersion,9);
  assert.equal(JSON.stringify(project.city),old,'Input city must remain unchanged');
  assert.deepEqual(cleared.candidate.city.properties.find(p=>p.id===property.id).buildingIds,[]);
  assert.deepEqual(cleared.candidate.city.plots,project.city.plots);
  assert.deepEqual(cleared.candidate.city.roads,project.city.roads);
  assert.deepEqual(cleared.candidate.city.openSpaces,project.city.openSpaces);
  assert.equal(JSON.stringify(cleared.candidate.city.buildings),others);
  const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(cleared.candidate,defaultWorkspace(cleared.candidate))));
  assert.equal(JSON.stringify(saved.project.city),JSON.stringify(cleared.candidate.city));
});
test('Dev 4e clear guards no buildings, mismatched links, and unknown property without altering source',()=>{
  const {project,property,workspace}=fixture();
  const snapshot=JSON.stringify(project.city);
  assert.equal(preparePropertyBuildingClear4E(project,workspace,'missing').ok,false);
  const bad=copyJson(project);
  bad.city.properties.find(p=>p.id===property.id).buildingIds.pop();
  assert.equal(preparePropertyBuildingClear4E(bad,workspace,property.id).issues[0].code,'membership');
  const cleared=preparePropertyBuildingClear4E(project,workspace,property.id).candidate;
  assert.equal(preparePropertyBuildingClear4E(cleared,defaultWorkspace(cleared),property.id).issues[0].code,'unchanged');
  assert.equal(JSON.stringify(project.city),snapshot);
});
test('Dev 4e clear is ONE history entry and returns every building with original indices and IDs',()=>{
  const {project,property,workspace}=fixture();
  const cleared=preparePropertyBuildingClear4E(project,workspace,property.id);
  assert.ok(cleared.ok);
  const history=new BuildingStructureHistory3H(20);
  assert.equal(history.record(project,cleared.candidate,property.id,'clear'),true);
  assert.equal(history.count('undo',property.id),1);
  assert.equal(history.can('undo',cleared.candidate,property.id),true);
  assert.match(describeStructureChange4E(history.entry('undo',property.id),'undo').description,/Restore all cleared buildings/);
  const undo=history.prepare(cleared.candidate,defaultWorkspace(cleared.candidate),property.id,'undo');
  assert.equal(undo.ok,true,JSON.stringify(undo.issues));
  assert.equal(JSON.stringify(undo.candidate.city),JSON.stringify(project.city));
  history.accept(undo.entry,'undo');
  assert.equal(history.can('redo',undo.candidate,property.id),true);
  assert.match(describeStructureChange4E(history.entry('redo',property.id),'redo').description,/Clear all buildings again/);
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),property.id,'redo');
  assert.equal(redo.ok,true,JSON.stringify(redo.issues));
  assert.equal(JSON.stringify(redo.candidate.city),JSON.stringify(cleared.candidate.city));
});
test('Dev 4e Inspector bulk clear, one-click Undo/Redo and disabled empty action',async()=>{
  const app=await buildingAppHarness(),state=app.state();
  const prop=state.project.city.properties.find(p=>p.buildingIds.length>0);
  const before=JSON.stringify(state.project.city),count=prop.buildingIds.length;
  state.propertyWorkspace.select({kind:'property',id:prop.id});
  const actions=()=>app.el('workspaceSelectionSections').children.flatMap(s=>s.children??[]);
  const clear=actions().find(b=>b.textContent==='Clear all buildings…');
  assert.ok(clear);
  assert.equal(clear.disabled,false);
  clear.handlers.click();
  assert.equal(state.buildingStructureHistory.count('undo',prop.id),1);
  assert.equal(app.state().project.city.buildings.filter(b=>b.propertyId===prop.id).length,0);
  assert.match(app.el('structureHistoryStatus').textContent,/Restore all cleared buildings/,
    JSON.stringify({last:app.state().acceptedHistoryD01.entry('undo')?.family,
      operation:app.state().acceptedHistoryD01.entry('undo')?.operation,
      notice:app.state().acceptedHistoryD01.notice,
      can:app.state().acceptedHistoryD01.can('undo',app.state().project)}));
  assert.match(app.el('structureUndo').textContent,/Undo clear/);
  assert.ok(actions().find(b=>b.textContent==='Clear all buildings…').disabled);
  assert.equal(app.el('structureUndo').handlers.click(),true);
  assert.equal(JSON.stringify(app.state().project.city),before);
  assert.equal(app.el('structureRedo').handlers.click(),true);
  assert.equal(app.state().project.city.buildings.filter(b=>b.propertyId===prop.id).length,0);
  assert.equal(app.el('structureUndo').handlers.click(),true);
  assert.equal(app.state().project.city.buildings.filter(b=>b.propertyId===prop.id).length,count);
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(app.capture().project,app.capture().workspace)));
  assert.equal(portable.project.schemaVersion,9);
  assert.doesNotMatch(JSON.stringify(portable),/buildingStructureHistory/);
});
