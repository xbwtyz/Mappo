import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { IdentityEditor } from '../src/core/identity.js';
import { copyJson, defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { defaultBuildingSpec3H, makeBuildingShape3H, newBuildingId3H, prepareBuildingStructure3H } from '../src/editor/building-structures.js';
import { BuildingStructureHistory3H } from '../src/editor/building-structure-history.js';
import { buildingAppHarness } from './helpers/building-app.js';

function findStructureTrial() {
  const project=createProject({seed:'3h-safe-structures',size:'small',morphology:'organic'});
  const workspace=defaultWorkspace(project);
  for(const building of project.city.buildings.slice(0,100)){
    const prop=project.city.properties.find(p=>p.id===building.propertyId);
    const initial=defaultBuildingSpec3H(prop,building);
    for(const size of [.68,.55,.85]){
      const spec={...initial,width:initial.width*size,depth:initial.depth*size,preset:'rectangle'};
      const receipt=prepareBuildingStructure3H(project,workspace,{
        operation:'replace',propertyId:prop.id,buildingId:building.id,spec
      });
      if(receipt.ok)return {project,workspace,building,property:prop,spec,receipt};
    }
  }
  throw new Error('A safe replacement should exist in a deterministic generated city.');
}
function buttons(app) {
  return app.el('workspaceSelectionSections').children.flatMap(section=>section.children??[]);
}
test('3H-B presets generate well-formed shapes in the property frame',()=>{
  const {property}=findStructureTrial();
  const spec=defaultBuildingSpec3H(property);
  for(const preset of ['rectangle','L','courtyard','T']){
    const geom=makeBuildingShape3H(property,{...spec,preset,angle:30});
    assert.ok(geom.footprint.length>=4);
    assert.ok(geom.area>1);
    assert.equal(geom.holes.length,preset==='courtyard'?1:0);
  }
  assert.throws(()=>makeBuildingShape3H(property,{...spec,width:-2}),/limits/);
  assert.throws(()=>makeBuildingShape3H(property,{...spec,preset:'unknown'}),/supported/);
});
test('3H-C safe replacement preserves building ID and custom identity; invalid preview never mutates',()=>{
  const {project,workspace,building,property,spec}=findStructureTrial();
  const named=copyJson(project);
  named.city.buildings.find(b=>b.id===building.id).customName='Copper Keep';
  const before=JSON.stringify(named);
  const receipt=prepareBuildingStructure3H(named,workspace,
    {operation:'replace',propertyId:property.id,buildingId:building.id,spec});
  assert.equal(receipt.ok,true,JSON.stringify(receipt.issues));
  const revised=receipt.candidate.city.buildings.find(b=>b.id===building.id);
  assert.equal(revised.customName,'Copper Keep');
  assert.equal(revised.id,building.id);
  assert.notDeepEqual(revised.footprint,building.footprint);
  assert.equal(revised.propertyId,property.id);
  assert.equal(receipt.candidate.schemaVersion,10);
  const invalid=prepareBuildingStructure3H(named,workspace,
    {operation:'replace',propertyId:property.id,buildingId:building.id,spec:{...spec,u:-9999}});
  assert.equal(invalid.ok,false);
  assert.equal(JSON.stringify(named),before,'Invalid replacement must not mutate accepted data.');
});
test('3H-C add after deletion creates a unique linked building with valid frontage and portable save',()=>{
  const {project,workspace,building,property,spec}=findStructureTrial();
  const removed=prepareBuildingStructure3H(project,workspace,{
    operation:'delete',propertyId:property.id,buildingId:building.id
  });
  assert.equal(removed.ok,true,JSON.stringify(removed.issues));
  assert.ok(!removed.candidate.city.buildings.some(b=>b.id===building.id));
  assert.ok(!removed.candidate.city.properties.find(p=>p.id===property.id).buildingIds.includes(building.id));
  const id=newBuildingId3H(removed.candidate.city);
  assert.notEqual(id,building.id);
  const add=prepareBuildingStructure3H(removed.candidate,defaultWorkspace(removed.candidate),{
    operation:'add',propertyId:property.id,buildingId:id,spec
  });
  assert.equal(add.ok,true,JSON.stringify(add.issues));
  const record=add.candidate.city.buildings.find(b=>b.id===id);
  assert.ok(record && record.plotIds.length>0);
  assert.ok(record.accessPath.length>1);
  assert.equal(record.frontageRoadId,property.frontageRoadId);
  assert.ok(add.candidate.city.properties.find(p=>p.id===property.id).buildingIds.includes(id));
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(add.candidate,defaultWorkspace(add.candidate))));
  assert.equal(JSON.stringify(portable.project.city),JSON.stringify(add.candidate.city));
});
test('3H-D structural Undo/Redo restores building membership and preserves unrelated buildings',()=>{
  const {project,workspace,property,building}=findStructureTrial();
  const deleted=prepareBuildingStructure3H(project,workspace,{
    operation:'delete',propertyId:property.id,buildingId:building.id
  });
  assert.ok(deleted.ok);
  const history=new BuildingStructureHistory3H(20);
  assert.equal(history.record(project,deleted.candidate,property.id,'delete'),true);
  assert.equal(history.can('undo',deleted.candidate,property.id),true);
  const undo=history.prepare(deleted.candidate,defaultWorkspace(deleted.candidate),property.id,'undo');
  assert.equal(undo.ok,true,JSON.stringify(undo.issues));
  assert.equal(JSON.stringify(undo.candidate.city),JSON.stringify(project.city));
  history.accept(undo.entry,'undo');
  assert.equal(history.can('redo',undo.candidate,property.id),true);
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),property.id,'redo');
  assert.equal(redo.ok,true,JSON.stringify(redo.issues));
  assert.equal(JSON.stringify(redo.candidate.city),JSON.stringify(deleted.candidate.city));
  history.accept(redo.entry,'redo');
  assert.equal(history.count('undo',property.id),1);
});
test('3H-A/D UI inspector adds a preview, protects invalid state and structural Undo/Redo restores deleted building',async()=>{
  const app=await buildingAppHarness();
  const state=app.state();
  const building=state.project.city.buildings[0],propertyId=building.propertyId;
  state.propertyWorkspace.select({kind:'property',id:propertyId});
  const add=buttons(app).find(b=>b.textContent==='Add building to this property');
  assert.ok(add,'Property Inspector should expose Add building.');
  const before=JSON.stringify(state.project.city);
  add.handlers.click();
  assert.equal(state.buildingPlacementSession.isActive,true);
  assert.equal(app.el('buildingStructurePanel').hidden,false);
  assert.equal(app.el('structurePreset').value,'rectangle');
  assert.equal(app.el('structureApply').disabled,true,'Overlapping existing buildings should be rejected.');
  assert.equal(JSON.stringify(state.project.city),before,'Opening a draft must never mutate the city.');
  app.el('structureCancel').handlers.click();
  assert.equal(state.buildingPlacementSession.isActive,false);
  state.propertyWorkspace.select({kind:'property',id:propertyId});
  const linked=buttons(app).find(b=>b.attributes?.['data-inspector-kind']==='building'
    && b.attributes?.['data-inspector-id']===building.id);
  assert.ok(linked);
  linked.handlers.click();
  const remove=buttons(app).find(b=>b.textContent==='Delete building…');
  assert.ok(remove);
  remove.handlers.click();
  assert.ok(!app.state().project.city.buildings.some(b=>b.id===building.id));
  assert.equal(state.buildingStructureHistory.count('undo',propertyId),1);
  assert.equal(app.el('structureUndo').disabled,false,
    'D01 history '+JSON.stringify({
      last:app.state().acceptedHistoryD01.entry('undo')?.family,
      operation:app.state().acceptedHistoryD01.entry('undo')?.operation,
      notice:app.state().acceptedHistoryD01.notice,
      can:app.state().acceptedHistoryD01.can('undo',app.state().project),
      selected:app.state().workspaceShell.state.selection
    }));
  assert.equal(app.el('structureUndo').handlers.click(),true);
  assert.ok(app.state().project.city.buildings.some(b=>b.id===building.id));
  assert.equal(app.el('structureRedo').disabled,false);
  assert.equal(app.el('structureRedo').handlers.click(),true);
  assert.ok(!app.state().project.city.buildings.some(b=>b.id===building.id));
  const snapshot=app.capture();
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(snapshot.project,snapshot.workspace)));
  assert.equal(portable.project.schemaVersion,10);
  assert.equal(portable.workspace.schemaVersion,1);
  assert.doesNotMatch(JSON.stringify(portable),/buildingPlacementSession|buildingStructureHistory/);
  app.apply(portable);
  assert.equal(state.buildingStructureHistory.count('undo',propertyId),0);
});

test('F3 replacement retains legacy use and supports classification of manually placed buildings', () => {
  const { project, workspace, building, property, spec } = findStructureTrial();
  building.type = 'bakehouse';
  assert.equal(defaultBuildingSpec3H(property, building).type, 'bakehouse');
  const replace = type => prepareBuildingStructure3H(project, workspace, {
    operation: 'replace', propertyId: property.id, buildingId: building.id, spec: { ...spec, type }
  });
  const retained = replace('bakehouse');
  assert.ok(retained.ok, JSON.stringify(retained.issues));
  assert.equal(retained.candidate.city.buildings.find(item => item.id === building.id).type, 'bakehouse');
  assert.equal(replace('invented').ok, false);
  const removed = prepareBuildingStructure3H(project, workspace, {
    operation: 'delete', propertyId: property.id, buildingId: building.id
  });
  assert.ok(removed.ok);
  const buildingId = newBuildingId3H(removed.candidate.city);
  const place = type => prepareBuildingStructure3H(removed.candidate, defaultWorkspace(removed.candidate), {
    operation: 'add', propertyId: property.id, buildingId, spec: { ...spec, type }
  });
  assert.equal(place('bakehouse').ok, false, 'Only an existing building can keep an unfamiliar type.');
  const added = place('house');
  assert.ok(added.ok);
  const manual = added.candidate.city.buildings.find(item => item.id === buildingId);
  const editor = new IdentityEditor();
  const reclassify = candidate => editor.apply(candidate.city, { kind: 'building', id: buildingId }, { buildingType: 'shop' });
  assert.deepEqual(reclassify(added.candidate).buildings.find(item => item.id === buildingId), { ...manual, type: 'shop' });
  const replaced = replace('house');
  assert.ok(replaced.ok);
  const replacement = replaced.candidate.city.buildings.find(item => item.id === building.id);
  const changed = editor.apply(replaced.candidate.city, { kind: 'building', id: building.id }, { buildingType: 'inn' });
  assert.deepEqual(changed.buildings.find(item => item.id === building.id), { ...replacement, type: 'inn' });
});
