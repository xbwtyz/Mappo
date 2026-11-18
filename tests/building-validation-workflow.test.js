import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAppHarness } from './helpers/building-app.js';
import { prepareBuildingCandidate, prepareBuildingApply } from '../src/editor/building-application.js';
import { createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
const sampleShifts=[{dx:.2},{dx:-.2},{dy:.2},{dy:-.2},{scaleX:.98,scaleY:.98},{scaleX:.95,scaleY:.95}];
function findSafeEdit(project) {
  for(const b of project.city.buildings.slice(0,90)){
    for(const transform of sampleShifts){
      if(prepareBuildingCandidate(project,b.id,transform).ok)return {building:b,transform};
    }
  }
  return null;
}
function enterInspector(app,building) {
  const state=app.state();
  state.propertyWorkspace.select({kind:'property',id:building.propertyId});
  const children=app.el('workspaceSelectionSections').children.flatMap(s=>s.children??[]);
  const child=children.find(b=>b.attributes?.['data-inspector-kind']==='building'&&b.attributes?.['data-inspector-id']===building.id);
  assert.ok(child);child.handlers.click();
  const edit=app.el('workspaceSelectionSections').children.flatMap(s=>s.children??[]).find(b=>b.textContent==='Edit building footprint');
  assert.ok(edit);edit.handlers.click();
  assert.equal(state.buildingEditSession.isEditing(building.id),true);
  return state.buildingEditSession;
}
test('3G-C4 rejected move cannot change accepted city, UI shows reason and disables Apply',async()=>{
  const app=await buildingAppHarness();
  const before=JSON.stringify(app.state().project);
  const building=app.state().project.city.buildings[0];
  const session=enterInspector(app,building);
  session.setTransform({dx:-10000});
  assert.equal(app.el('buildingPreviewApply').disabled,true);
  assert.match(app.el('buildingPreviewStatus').textContent,/INVALID PLACEMENT/);
  assert.ok(app.el('buildingPreviewIssues').children.length>=1);
  const handled=app.el('buildingPreviewApply').handlers.click();
  assert.equal(handled,false);
  assert.equal(JSON.stringify(app.state().project),before);
  session.reset();
  assert.equal(app.el('buildingPreviewApply').disabled,true);
});
test('3G-C4 validated Apply commits once, preserves IDs and persists schema-9 save/load',async()=>{
  const app=await buildingAppHarness();
  const initial=app.state().project,original=JSON.stringify(initial.city),entry=findSafeEdit(initial);
  assert.ok(entry,'A small edit should be possible in a generated city');
  const originalRecord=initial.city.buildings.find(b=>b.id===entry.building.id);
  const session=enterInspector(app,entry.building);
  const beforeRevision=app.state().files.revision;
  assert.equal(session.setTransform(entry.transform),true);
  assert.equal(app.el('buildingPreviewApply').disabled,false,app.el('buildingPreviewStatus').textContent);
  const preflight=prepareBuildingApply(initial,app.capture().workspace,entry.building.id,entry.transform);
  assert.equal(preflight.ok,true,JSON.stringify(preflight.issues));
  const result=app.el('buildingPreviewApply').handlers.click();
  assert.equal(result,true,app.el('buildingPreviewStatus').textContent);
  const updated=app.state().project,changed=updated.city.buildings.find(b=>b.id===entry.building.id);
  assert.equal(updated.schemaVersion,9);
  assert.equal(updated.city.buildings.length,initial.city.buildings.length);
  assert.equal(updated.city.properties.length,initial.city.properties.length);
  assert.equal(changed.id,originalRecord.id);
  assert.equal(changed.propertyId,originalRecord.propertyId);
  assert.notDeepEqual(changed.footprint,originalRecord.footprint);
  assert.equal(session.isPending,false);
  assert.equal(app.el('buildingPreviewApply').disabled,true);
  assert.ok(app.state().files.revision>beforeRevision);
  assert.notEqual(JSON.stringify(updated.city),original);
  const snapshot=app.capture();
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(snapshot.project,snapshot.workspace)));
  assert.deepEqual(portable.project.city,updated.city);
  assert.equal(portable.project.schemaVersion,9);
  assert.equal(JSON.stringify(portable.workspace).includes('buildingEditSession'),false);
  assert.equal(JSON.stringify(portable.workspace).includes('buildingTransform'),false);
  assert.equal(JSON.stringify(initial.city),original,'The old accepted city object must remain unchanged');
  app.apply(portable);
  assert.equal(app.state().buildingEditSession.isActive,false);
  assert.equal(JSON.stringify(app.state().project.city),JSON.stringify(updated.city));
});
test('3G-C4 file-roundtrip failure never produces a candidate commit',()=>{
 const app=(async()=>await buildingAppHarness());
 return app().then(qa=>{
   const initial=qa.state().project,entry=findSafeEdit(initial);
   assert.ok(entry);
   const output=prepareBuildingApply(initial,{schemaVersion:999},entry.building.id,entry.transform);
   assert.equal(output.ok,false);
   assert.ok(output.issues.some(x=>x.code==='roundtrip'));
   assert.equal(JSON.stringify(qa.state().project),JSON.stringify(initial));
 });
});
