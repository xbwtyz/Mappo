import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../src/data/project-format.js';
import { vacant } from './helpers/vacant-frontage.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { propertyFrontagesE1,PropertyCreationSessionE1,inspectPropertyCreationE1,
  preparePropertyCreationE1,PropertyCreationHistoryE1 } from '../src/editor/property-creation-e1.js';

test('E1 derives geometric frontages from accepted blocks, not openSpace area totals',()=>{
  const {project,draft}=vacant();
  const frontages=propertyFrontagesE1(project.city,draft.blockId);
  assert.ok(frontages.length>0);
  assert.ok(frontages.some(f=>f.roadId===draft.roadId));
  assert.ok(frontages.every(f=>Number.isFinite(f.margin)&&f.margin>0));
  const invalid=copyJson(project);
  invalid.city.openSpaces.find(o=>o.blockId===draft.blockId).area=0;
  assert.equal(inspectPropertyCreationE1(invalid,draft).ok,false);
});

test('E1 creates independently validated property + plot on existing open land across morphologies and sizes',()=>{
  for(const morphology of ['planned','radial','organic','linear'])
    for(const size of ['small','large']){
      const {project,draft,workspace}=vacant(morphology,size);
      const before=JSON.stringify(project);
      const result=preparePropertyCreationE1(project,workspace,draft);
      assert.equal(result.ok,true,morphology+'/'+size+': '+JSON.stringify(result.issues));
      assert.equal(result.candidate.schemaVersion,PROJECT_SCHEMA_VERSION);
      assert.equal(result.candidate.city.properties.length,project.city.properties.length+1);
      assert.equal(result.candidate.city.plots.length,project.city.plots.length+1);
      assert.equal(result.candidate.city.buildings.length,project.city.buildings.length);
      assert.deepEqual(result.candidate.city.roads,project.city.roads);
      assert.deepEqual(result.candidate.city.blocks,project.city.blocks);
      assert.deepEqual(result.candidate.city.buildings,project.city.buildings);
      const site=result.candidate.city.properties.find(p=>p.id===result.propertyId);
      assert.equal(site.roadProvenance.source,'user-created-e1');
      assert.deepEqual(site.plotIds,[result.plotId]);
      assert.deepEqual(site.buildingIds,[]);
      assert.equal(site.usage,'undeveloped');
      assert.equal(JSON.stringify(project),before,'Draft and Apply preparation must not mutate accepted city');
      validateStoredProject(result.candidate);
      const reopened=decodeProjectDocument(encodeProjectDocument(createProjectDocument(result.candidate,workspace)));
      assert.deepEqual(reopened.project.city,result.candidate.city);
    }
});

test('E1 unsafe geometry and overlap report issues without changing the current city',()=>{
  const {project,draft,workspace}=vacant('planned','small');
  const before=JSON.stringify(project);
  const bad=[
    {...draft,width:1},
    {...draft,u:-200},
    {...draft,width:160,depth:160},
    {...draft,depth:NaN},
    {...draft,roadId:'no-road'},
  ];
  for(const entry of bad){
    const inspected=inspectPropertyCreationE1(project,entry);
    assert.equal(inspected.ok,false);
    assert.ok(inspected.issues.length>0);
    const applied=preparePropertyCreationE1(project,workspace,entry);
    assert.equal(applied.ok,false);
    assert.equal(applied.candidate,null);
  }
  assert.equal(JSON.stringify(project),before);
});

test('E1 cancel and Undo/Redo preserve exact accepted snapshots and history never enters saved file',()=>{
  const {project,draft,workspace}=vacant('organic','small');
  const unchanged=JSON.stringify(project.city);
  const session=new PropertyCreationSessionE1();
  session.enter();
  assert.equal(session.active,true);
  session.draft=copyJson(draft);
  assert.ok(session.preview(project.city).length===4);
  session.reset();
  assert.equal(session.draft,null);
  session.stop();
  assert.equal(JSON.stringify(project.city),unchanged);
  const result=preparePropertyCreationE1(project,workspace,draft);
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  const history=new PropertyCreationHistoryE1();
  assert.equal(history.record(project,result.candidate,result.propertyId),true);
  assert.equal(history.can('undo',result.candidate),true);
  const undo=history.prepare('undo',result.candidate,workspace);
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(JSON.stringify(undo.candidate.city),unchanged);
  history.accept('undo',undo.entry);
  const redo=history.prepare('redo',undo.candidate,workspace);
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate.city,result.candidate.city);
  history.accept('redo',redo.entry);
  const dirty=copyJson(result.candidate);
  dirty.city.openSpaces.find(row=>row.blockId===draft.blockId).area+=1;
  assert.equal(history.can('undo',dirty),false);
  assert.equal(history.prepare('undo',dirty,workspace).ok,false);
  assert.doesNotMatch(JSON.stringify(createProjectDocument(result.candidate,workspace)),/PropertyCreationHistoryE1/);
});
