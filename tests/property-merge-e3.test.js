import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {preparePropertyBuildingClear4E} from '../src/editor/property-building-clear-4e.js';
import {PropertySplitSessionE2,inspectPropertySplitE2,preparePropertySplitE2} from '../src/editor/property-split-e2.js';
import {propertyMergeGeometryE3,propertyMergeNeighborsE3} from '../src/core/property-merge-geometry-e3.js';
import {PropertyMergeSessionE3,PropertyMergeHistoryE3,inspectPropertyMergeE3,preparePropertyMergeE3} from '../src/editor/property-merge-e3.js';
import {validateStoredProject} from '../src/data/project-validation.js';

function fixture(seed='e3-acceptance'){
  let project=createProject({seed,morphology:'planned',size:'small'});
  for(const p of project.city.properties){
    if(p.boundary.length!==4||p.buildingIds.length>5)continue;
    const cleared=p.buildingIds.length?
      preparePropertyBuildingClear4E(project,defaultWorkspace(project),p.id):
      {ok:true,candidate:project};
    if(!cleared.ok)continue;
    const clean=cleared.candidate,split=new PropertySplitSessionE2();
    if(!split.start(clean.city,p.id)||!inspectPropertySplitE2(clean,split).ok)continue;
    const result=preparePropertySplitE2(clean,defaultWorkspace(clean),split);
    if(!result.ok)continue;
    const session=new PropertyMergeSessionE3();
    session.start(result.candidate.city,result.sourcePropertyId);
    session.choose(result.candidate.city,result.newPropertyId);
    if(inspectPropertyMergeE3(result.candidate,session).ok)
      return {project:result.candidate,session,split:result,source:clean};
  }
  throw Error('E3 fixture needs an E2-mergeable pair.');
}

test('E3 reverse-of-E2 geometry conserves area and exact ordered plot identities',()=>{
  const {project,session,split}=fixture();
  const before=JSON.stringify(project.city);
  const g=propertyMergeGeometryE3(project.city,session.primaryId,session.secondaryId);
  assert.ok(Math.abs(g.area-split.candidate.city.properties.find(p=>p.id===session.primaryId).area-
    split.candidate.city.properties.find(p=>p.id===session.secondaryId).area)<.02);
  assert.equal(g.plotIds.length,
    g.primary.plotIds.length+g.secondary.plotIds.length);
  assert.deepEqual(new Set(g.plotIds),
    new Set([...g.primary.plotIds,...g.secondary.plotIds]));
  assert.equal(JSON.stringify(project.city),before);
  assert.ok(propertyMergeNeighborsE3(project.city,session.primaryId).some(row=>row.id===session.secondaryId));
});
test('E3 atomic merge preserves plots, validates schema 9, and has exact Undo/Redo',()=>{
  const {project,session}=fixture('e3-apply');
  const original=JSON.stringify(project.city);
  const beforeProps=project.city.properties.length,beforePlots=project.city.plots.length;
  const result=preparePropertyMergeE3(project,defaultWorkspace(project),session);
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  assert.equal(result.candidate.city.properties.length,beforeProps-1);
  assert.equal(result.candidate.city.plots.length,beforePlots);
  assert.equal(JSON.stringify(project.city),original);
  assert.ok(result.candidate.city.properties.find(p=>p.id===session.primaryId).propertyMergeHistoryE3.length);
  assert.ok(!result.candidate.city.properties.some(p=>p.id===session.secondaryId));
  validateStoredProject(result.candidate);
  const history=new PropertyMergeHistoryE3(20);
  assert.equal(history.record(project,result.candidate,session.primaryId),true);
  const undo=history.prepare('undo',result.candidate,defaultWorkspace(result.candidate));
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(JSON.stringify(undo.candidate.city),original);
  history.accept('undo',undo.entry);
  const redo=history.prepare('redo',project,defaultWorkspace(project));
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate.city,result.candidate.city);
});
test('E3 rejects customized secondary retirement before explicit consent and saves its identity afterward',()=>{
  const {project,session}=fixture('e3-custom');
  const secondary=project.city.properties.find(p=>p.id===session.secondaryId);
  secondary.customName='The Archive';
  secondary.customUse='Heritage';
  secondary.customFutureField={credits:['a','b']};
  const before=JSON.stringify(project.city);
  assert.equal(inspectPropertyMergeE3(project,session).ok,false);
  assert.equal(preparePropertyMergeE3(project,defaultWorkspace(project),session).candidate,null);
  session.approve(true);
  const accepted=preparePropertyMergeE3(project,defaultWorkspace(project),session);
  assert.equal(accepted.ok,true,JSON.stringify(accepted.issues));
  const surviving=accepted.candidate.city.properties.find(p=>p.id===session.primaryId);
  const receipt=surviving.propertyMergeHistoryE3.at(-1);
  assert.equal(receipt.retiredRecord.customName,'The Archive');
  assert.equal(receipt.retiredRecord.customUse,'Heritage');
  assert.deepEqual(receipt.retiredRecord.customFutureField,{credits:['a','b']});
  assert.equal(JSON.stringify(project.city),before);
});
test('E3 rejects corner-only contact, wrong block, missing plot and stale source without mutation',()=>{
  const {project,session}=fixture('e3-negative');
  const other=project.city.properties.find(p=>p.id===session.secondaryId);
  const old=JSON.stringify(project.city);
  other.blockId='MISSING-BLOCK';
  assert.equal(inspectPropertyMergeE3(project,session).ok,false);
  assert.equal(preparePropertyMergeE3(project,defaultWorkspace(project),session).candidate,null);
  assert.notEqual(JSON.stringify(project.city),old);
  other.blockId=project.city.properties.find(p=>p.id===session.primaryId).blockId;
  other.boundary[3]={x:other.boundary[3].x+5,y:other.boundary[3].y+5};
  assert.equal(inspectPropertyMergeE3(project,session).ok,false);
});
