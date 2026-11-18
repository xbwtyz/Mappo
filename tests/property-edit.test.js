import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from '../src/core/property-geometry.js';
import { inspectPropertyEdit3I, preparePropertyApply3I } from '../src/editor/property-application.js';
import { PropertyGeometryHistory3I } from '../src/editor/property-history.js';
import { copyJson } from '../src/data/project-format.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

test('3I-A property preview clones geometry, preserves accepted records, selects corners and resets safely',()=>{
  const project=createProject({seed:'3i-property-draft',size:'small',morphology:'organic'});
  const property=project.city.properties.find(p=>p.boundary.length===4);
  assert.ok(property);
  const source=JSON.stringify(project.city);
  let updates=0;
  const session=new PropertyEditSession3I(()=>updates++);
  assert.equal(session.start(project.city,property.id),true);
  const preview=session.previewFor(project.city);
  assert.deepEqual(preview,property.boundary);
  assert.notEqual(preview,property.boundary,'The draft must not alias the accepted boundary.');
  preview[0].x+=50;
  assert.equal(session.previewFor(project.city)[0].x,property.boundary[0].x,'External preview consumers cannot mutate the draft.');
  assert.equal(session.hitCorner(project.city,property.boundary[0],1),0);
  assert.equal(session.selectCorner(0),true);
  assert.equal(session.selectedCorner,0);
  assert.equal(session.selectCorner(9),false);
  assert.equal(session.reset(),true);
  assert.equal(session.selectedCorner,null);
  assert.equal(session.isPending,false);
  assert.equal(session.stop(),true);
  assert.equal(session.isActive,false);
  assert.equal(JSON.stringify(project.city),source,'Editing a preview must never modify accepted geometry.');
  assert.ok(updates>=4);
  assert.equal(session.start(project.city,'missing-property'),false);
});
test('3I-A compiled UI starts, resets and cancels property preview without changing the city',async()=>{
  const app=await buildingAppHarness();
  const state=app.state();
  const property=state.project.city.properties.find(p=>p.boundary.length===4);
  const original=JSON.stringify(state.project.city);
  state.propertyWorkspace.select({kind:'property',id:property.id});
  const sections=app.el('workspaceSelectionSections').children;
  const actions=sections.flatMap(section=>section.children??[]);
  const edit=actions.find(b=>b.textContent==='Edit property geometry');
  assert.ok(edit,'Property Inspector should expose editing action.');
  edit.handlers.click();
  assert.equal(state.propertyEditSession.isActive,true);
  assert.equal(state.propertyEditSession.propertyId,property.id);
  assert.equal(app.el('propertyEditPanel3I').hidden,false);
  assert.equal(app.el('propertyEditApply3I').disabled,true);
  assert.equal(JSON.stringify(state.project.city),original);
  app.tap(state.camera.worldToScreen(property.boundary[0]));
  assert.equal(state.propertyEditSession.selectedCorner,0);
  app.el('propertyEditReset3I').handlers.click();
  assert.equal(state.propertyEditSession.selectedCorner,null);
  app.el('propertyEditCancel3I').handlers.click();
  assert.equal(state.propertyEditSession.isActive,false);
  assert.equal(app.el('propertyEditPanel3I').hidden,true);
  assert.equal(JSON.stringify(state.project.city),original);
});

test('3I-B controlled quadrilateral reflow preserves plot IDs, exact area, and accepted city',()=>{
  const project=createProject({seed:'3i-property-reflow',size:'small',morphology:'organic'});
  const property=project.city.properties.find(p=>p.plotIds.length>1&&p.boundary.length===4);
  assert.ok(property,'Expected a property containing multiple base plots.');
  const original=JSON.stringify(project.city);
  const divisions=propertyDividerFractions3I(project.city,property);
  assert.equal(divisions.length,property.plotIds.length-1);
  const preview=propertyGeometryPreview3I(project.city,property.id,property.boundary,divisions);
  assert.ok(Math.abs(preview.area-preview.total)<.000001);
  assert.deepEqual(preview.plots.map(p=>p.id),property.plotIds);
  const moved=property.boundary.map(p=>({...p}));
  moved[2]={x:moved[2].x-.1,y:moved[2].y-.1};
  const changed=propertyGeometryPreview3I(project.city,property.id,moved,divisions);
  assert.ok(Math.abs(changed.area-changed.total)<.000001);
  assert.deepEqual(changed.plots.map(p=>p.id),property.plotIds);
  assert.notDeepEqual(changed.plots,preview.plots);
  const session=new PropertyEditSession3I();
  assert.equal(session.start(project.city,property.id),true);
  assert.equal(session.setCorner(2,moved[2]),true);
  assert.equal(session.isPending,true);
  assert.equal(session.setDivider(0,divisions[0]-.001),true);
  assert.equal(session.plotsFor(project.city).length,property.plotIds.length);
  session.reset();
  assert.equal(session.isPending,false);
  assert.equal(JSON.stringify(project.city),original);
});

test('3I-C validates and atomically commits small, safe rear-boundary changes',()=>{
  const project=createProject({seed:'3i-property-apply',size:'small',morphology:'organic'});
  const workspace=defaultWorkspace(project);
  const initial=JSON.stringify(project.city);
  let receipt=null,property=null;
  for(const candidate of project.city.properties.slice(0,200)){
    const session=new PropertyEditSession3I();
    if(!session.start(project.city,candidate.id))continue;
    const inward=candidate.frame.inward;
    for(const index of [2,3]){
      const p=candidate.boundary[index];
      session.setCorner(index,{x:p.x-inward.x*.1,y:p.y-inward.y*.1});
    }
    const trial=preparePropertyApply3I(project,workspace,session);
    if(trial.ok){property=candidate;receipt=trial;break;}
  }
  assert.ok(receipt?.ok,'At least one safe rear setback should be valid.');
  assert.equal(receipt.candidate.schemaVersion,9);
  assert.equal(receipt.candidate.city.properties.find(p=>p.id===property.id).id,property.id);
  assert.deepEqual(receipt.candidate.city.properties.find(p=>p.id===property.id).plotIds,property.plotIds);
  assert.deepEqual(receipt.candidate.city.properties.find(p=>p.id===property.id).buildingIds,property.buildingIds);
  assert.deepEqual(receipt.candidate.city.roads,project.city.roads);
  assert.deepEqual(receipt.candidate.city.buildings.map(b=>b.footprint),project.city.buildings.map(b=>b.footprint));
  assert.notDeepEqual(receipt.candidate.city.plots,project.city.plots);
  assert.equal(JSON.stringify(project.city),initial,'Atomic preparation must not change the source.');
  const invalid=new PropertyEditSession3I();
  assert.equal(invalid.start(project.city,property.id),true);
  invalid.setCorner(2,{x:10001,y:10001});
  const blocked=preparePropertyApply3I(project,workspace,invalid);
  assert.equal(blocked.ok,false);
  assert.equal(blocked.candidate,null);
  assert.equal(JSON.stringify(project.city),initial);
});
test('3I-C fresh validation rejects a parcel that crosses existing buildings',()=>{
  const project=createProject({seed:'3i-property-building-guard',size:'small',morphology:'organic'});
  const property=project.city.properties.find(p=>p.buildingIds.length>0);
  const session=new PropertyEditSession3I();
  assert.equal(session.start(project.city,property.id),true);
  const inward=property.frame.inward;
  for(const index of [2,3]){
    const p=property.boundary[index];
    session.setCorner(index,{x:p.x-inward.x*property.local.depth*.9,y:p.y-inward.y*property.local.depth*.9});
  }
  const result=inspectPropertyEdit3I(project,session);
  assert.equal(result.ok,false);
  assert.ok(result.issues.some(issue=>['building','shape','plot'].includes(issue.code)),JSON.stringify(result.issues));
});

test('3I-D property-scoped geometry Undo/Redo restores plots without overwriting edited identity',()=>{
  const project=createProject({seed:'3i-property-history',size:'small',morphology:'organic'});
  const workspace=defaultWorkspace(project);
  let accepted=null,property=null;
  for(const candidate of project.city.properties){
    const session=new PropertyEditSession3I();
    if(!session.start(project.city,candidate.id))continue;
    for(const index of [2,3]){
      const point=candidate.boundary[index],axis=candidate.frame.inward;
      session.setCorner(index,{x:point.x-.1*axis.x,y:point.y-.1*axis.y});
    }
    const trial=preparePropertyApply3I(project,workspace,session);
    if(trial.ok){accepted=trial.candidate;property=candidate;break;}
  }
  assert.ok(accepted,'Expected a valid property edit.');
  const history=new PropertyGeometryHistory3I(20);
  assert.equal(history.record(project,accepted,property.id),true);
  const changed=copyJson(accepted);
  changed.city.properties.find(p=>p.id===property.id).customName='Copper Quarter';
  assert.equal(history.can('undo',changed,property.id),true,'Identity changes must not invalidate geometry history.');
  const undo=history.prepare(changed,defaultWorkspace(changed),property.id,'undo');
  assert.equal(undo.ok,true,undo.reason);
  assert.deepEqual(undo.candidate.city.properties.find(p=>p.id===property.id).boundary,property.boundary);
  assert.equal(undo.candidate.city.properties.find(p=>p.id===property.id).customName,'Copper Quarter');
  history.accept(undo.entry,'undo');
  assert.equal(history.can('redo',undo.candidate,property.id),true);
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),property.id,'redo');
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate.city.properties.find(p=>p.id===property.id).boundary,
    accepted.city.properties.find(p=>p.id===property.id).boundary);
  assert.equal(redo.candidate.city.properties.find(p=>p.id===property.id).customName,'Copper Quarter');
  history.accept(redo.entry,'redo');
  assert.equal(history.count('undo',property.id),1);
  assert.equal(history.count('redo',property.id),0);
  assert.equal(project.schemaVersion,9);
  assert.deepEqual(project.city.properties.find(p=>p.id===property.id).boundary,property.boundary);
});
