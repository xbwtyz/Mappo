import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { copyJson, defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { preparePropertyDeletion4A, PropertyDeletionHistory4A } from '../src/editor/property-deletion.js';
import { buildingAppHarness } from './helpers/building-app.js';

function fixture(seed='dev4a-delete') {
  const project=createProject({seed,size:'small',morphology:'organic'});
  const property=project.city.properties.find(p=>p.buildingIds.length>0 && p.plotIds.length>1)
    ?? project.city.properties.find(p=>p.buildingIds.length>0);
  assert.ok(property,'A city should have a populated property to delete.');
  return {project,property,workspace:defaultWorkspace(project)};
}

test('Dev4a deletes one property, every owned plot/building and no neighboring city data',()=>{
  const {project,property,workspace}=fixture();
  const before=JSON.stringify(project.city);
  const buildings=project.city.buildings.filter(b=>b.propertyId===property.id);
  const plots=project.city.plots.filter(p=>p.propertyId===property.id);
  const unrelated={
    roads:copyJson(project.city.roads),
    blocks:copyJson(project.city.blocks),
    districts:copyJson(project.city.districts),
    neighbors:copyJson(project.city.properties.filter(p=>p.id!==property.id))
  };
  const receipt=preparePropertyDeletion4A(project,workspace,property.id);
  assert.equal(receipt.ok,true,receipt.reason);
  assert.equal(receipt.removed.plotCount,plots.length);
  assert.equal(receipt.removed.buildingCount,buildings.length);
  assert.ok(!receipt.candidate.city.properties.some(p=>p.id===property.id));
  assert.ok(!receipt.candidate.city.plots.some(p=>p.propertyId===property.id));
  assert.ok(!receipt.candidate.city.buildings.some(b=>b.propertyId===property.id));
  assert.deepEqual(receipt.candidate.city.roads,unrelated.roads);
  assert.deepEqual(receipt.candidate.city.blocks,unrelated.blocks);
  assert.deepEqual(receipt.candidate.city.districts,unrelated.districts);
  assert.deepEqual(receipt.candidate.city.properties,unrelated.neighbors);
  assert.equal(JSON.stringify(project.city),before,'The candidate must never mutate the current city');
  const oldOpen=project.city.openSpaces.find(o=>o.blockId===property.blockId);
  const newOpen=receipt.candidate.city.openSpaces.find(o=>o.blockId===property.blockId);
  if(oldOpen)assert.ok(newOpen.area>=oldOpen.area,'Deleted property becomes open ground');
  assert.equal(receipt.candidate.schemaVersion,10);
  validateStoredProject(receipt.candidate);
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(receipt.candidate,workspace)));
  assert.deepEqual(portable.project.city,receipt.candidate.city);
});

test('Dev4a bounded Undo/Redo restores exact IDs, coordinates and children in original order',()=>{
  const {project,property,workspace}=fixture('dev4a-history');
  const deleted=preparePropertyDeletion4A(project,workspace,property.id);
  assert.ok(deleted.ok,deleted.reason);
  const history=new PropertyDeletionHistory4A(20);
  history.record(project,deleted.candidate,property.id);
  assert.equal(history.can('undo',deleted.candidate),true);
  const undo=history.prepare(deleted.candidate,defaultWorkspace(deleted.candidate),'undo');
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(JSON.stringify(undo.candidate.city),JSON.stringify(project.city),
    'Undo must restore the exact portable city representation (JSON canonicalizes -0 to 0).');
  history.accept(undo.entry,'undo');
  assert.equal(history.can('redo',undo.candidate),true);
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),'redo');
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate.city,deleted.candidate.city);
  history.accept(redo.entry,'redo');
  assert.equal(history.can('undo',redo.candidate),true);
  assert.equal(JSON.stringify(project.city),JSON.stringify(createProject({seed:'dev4a-history',size:'small',morphology:'organic'}).city));
  history.clear();
  assert.equal(history.can('undo',deleted.candidate),false);
});

test('Dev4a rejects missing property and stale history without modifying city',()=>{
  const {project,property,workspace}=fixture('dev4a-invalid');
  const before=JSON.stringify(project);
  const missing=preparePropertyDeletion4A(project,workspace,'missing-property-id');
  assert.equal(missing.ok,false);
  assert.equal(missing.candidate,null);
  assert.equal(JSON.stringify(project),before);
  const receipt=preparePropertyDeletion4A(project,workspace,property.id);
  assert.equal(receipt.ok,true,receipt.reason);
  const history=new PropertyDeletionHistory4A(20);
  history.record(project,receipt.candidate,property.id);
  const stale=copyJson(receipt.candidate);
  const open=stale.city.openSpaces.find(o=>o.blockId===property.blockId);
  if(open){
    open.area+=1;
    assert.equal(history.can('undo',stale),false,'Changed open ground blocks stale restoration');
    assert.equal(history.prepare(stale,defaultWorkspace(stale),'undo').ok,false);
  }
  history.clear();
  assert.equal(history.can('undo',receipt.candidate),false);
});

test('Dev4a Inspector delete, map Undo/Redo and portable reload retain safe state',async()=>{
  const app=await buildingAppHarness();
  const state=app.state();
  const property=state.project.city.properties.find(p=>p.buildingIds.length>0);
  const original=JSON.stringify(state.project.city);
  assert.equal(state.propertyWorkspace.select({kind:'property',id:property.id}),true);
  const sections=app.el('workspaceSelectionSections').children;
  const buttons=sections.flatMap(x=>x.children??[]);
  const deleteButton=buttons.find(b=>b.textContent==='Delete property…');
  assert.ok(deleteButton,'The property Inspector must expose Delete property.');
  deleteButton.handlers.click();
  assert.ok(!app.state().project.city.properties.some(p=>p.id===property.id));
  assert.equal(app.state().workspaceShell.state.selection,null);
  assert.equal(app.el('propertyDeletionUndo4A').disabled,false);
  assert.equal(app.el('propertyDeletionUndo4A').hidden,false);
  app.el('propertyDeletionUndo4A').handlers.click();
  assert.equal(JSON.stringify(app.state().project.city),original);
  assert.equal(app.el('propertyDeletionRedo4A').disabled,false);
  app.el('propertyDeletionRedo4A').handlers.click();
  assert.ok(!app.state().project.city.properties.some(p=>p.id===property.id));
  const saved=app.capture();
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(saved.project,saved.workspace)));
  assert.equal(portable.project.schemaVersion,10);
  assert.equal(portable.workspace.schemaVersion,1);
  assert.doesNotMatch(JSON.stringify(portable),/PropertyDeletionHistory4A|propertyDeletionHistory4A/);
  app.apply(portable);
  assert.equal(app.state().propertyDeletionHistory4A.can('undo',app.state().project),false);
  assert.ok(!app.state().project.city.properties.some(p=>p.id===property.id));
});
