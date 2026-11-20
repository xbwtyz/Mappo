import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {PropertyEditSession3I} from '../src/editor/property-edit.js';
import {inspectPropertyEdit3I,preparePropertyApply3I} from '../src/editor/property-application.js';
import {PropertyGeometryHistory3I} from '../src/editor/property-history.js';
import {defaultWorkspace} from '../src/data/project-format.js';
import {validateStoredProject} from '../src/data/project-validation.js';

function candidate(op='split',seed='e4-plot-count'){
  const source=createProject({seed,size:'small',morphology:'planned'});
  const rejections=[];
  for(const p of source.city.properties){
    if(p.boundary.length!==4||!p.plotIds.length||(op==='merge'&&p.plotIds.length<2))continue;
    const s=new PropertyEditSession3I();
    if(!s.start(source.city,p.id))continue;
    const edited=op==='split'?s.addDivider(source.city,0):s.removeDivider(0);
    if(!edited)continue;
    const attempt=preparePropertyApply3I(source,defaultWorkspace(source),s);
    if(attempt.ok)return {source,property:p,session:s,attempt};
    if(rejections.length<6)rejections.push({id:p.id,issues:attempt.issues});
  }
  throw Error('Could not find a validated '+op+' candidate from generated city: '+JSON.stringify(rejections));
}

test('E4 split retains plot ID and originals, assigns unique ID, preserves structure, and round-trips schema 9',()=>{
  const {source,property,session,attempt}=candidate('split');
  const before=JSON.stringify(source.city),oldIds=[...property.plotIds],oldBuildings=source.city.buildings.map(b=>({
    id:b.id,footprint:b.footprint,accessPath:b.accessPath,entrance:b.entrance}));
  assert.equal(attempt.candidate.schemaVersion,9);
  const changed=attempt.candidate.city.properties.find(p=>p.id===property.id);
  assert.equal(changed.plotIds.length,oldIds.length+1);
  assert.equal(changed.plotIds[0],oldIds[0]);
  assert.equal(changed.plotIds[1],session.countChange.newId);
  assert.equal(new Set(attempt.candidate.city.plots.map(p=>p.id)).size,attempt.candidate.city.plots.length);
  assert.deepEqual(attempt.candidate.city.buildings.map(b=>({
    id:b.id,footprint:b.footprint,accessPath:b.accessPath,entrance:b.entrance})),oldBuildings);
  assert.equal(changed.plotCountHistoryE4.at(-1).operation,'split');
  validateStoredProject(attempt.candidate);
  assert.equal(JSON.stringify(source.city),before);
});

test('E4 merging neighboring plots retires right ID and preserves metadata by explicit consent',()=>{
  const {source,property}=candidate('merge','e4-retire-annotated');
  const retiredId=property.plotIds[1],retired=source.city.plots.find(p=>p.id===retiredId);
  retired.customName='Ancestral courtyard';
  retired.customRight={rights:['laneway','market']};
  const original=JSON.stringify(source.city);
  const session=new PropertyEditSession3I();
  assert.equal(session.start(source.city,property.id),true);
  assert.equal(session.removeDivider(0),true);
  assert.equal(inspectPropertyEdit3I(source,session).ok,false);
  assert.equal(preparePropertyApply3I(source,defaultWorkspace(source),session).candidate,null);
  session.approvePlotCount(true);
  const result=preparePropertyApply3I(source,defaultWorkspace(source),session);
  assert.equal(result.ok,true,JSON.stringify(result.issues));
  const live=result.candidate.city.properties.find(p=>p.id===property.id);
  const receipt=live.plotCountHistoryE4.at(-1);
  assert.equal(receipt.retiredId,retiredId);
  assert.equal(receipt.sourceRecord.customName,'Ancestral courtyard');
  assert.deepEqual(receipt.sourceRecord.customRight,{rights:['laneway','market']});
  assert.ok(!result.candidate.city.plots.find(p=>p.id===retiredId));
  assert.equal(JSON.stringify(source.city),original);
});

test('E4 accepted structural history is one transaction with exact before/after restoration',()=>{
  const {source,property,session,attempt}=candidate('split','e4-history');
  const original=JSON.stringify(source.city),history=new PropertyGeometryHistory3I();
  assert.equal(history.record(source,attempt.candidate,property.id),true);
  assert.equal(history.count('undo',property.id),1);
  assert.equal(history.can('undo',attempt.candidate,property.id),true);
  const undo=history.prepare(attempt.candidate,defaultWorkspace(attempt.candidate),property.id,'undo');
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(JSON.stringify(undo.candidate.city),original);
  history.accept(undo.entry,'undo');
  const redo=history.prepare(source,defaultWorkspace(source),property.id,'redo');
  assert.equal(redo.ok,true,redo.reason);
  assert.deepEqual(redo.candidate.city,attempt.candidate.city);
  history.accept(redo.entry,'redo');
  assert.equal(history.count('undo',property.id),1);
  assert.equal(session.reset(),true);
  assert.equal(session.isPending,false);
});

test('E4 rejects a second count operation on an uncommitted draft and never mutates accepted land',()=>{
  const {source,property}=candidate('merge','e4-single-change');
  const session=new PropertyEditSession3I(),before=JSON.stringify(source.city);
  assert.equal(session.start(source.city,property.id),true);
  assert.equal(session.removeDivider(0),true);
  assert.equal(session.addDivider(source.city,0),false);
  assert.equal(session.removeDivider(0),false);
  assert.equal(JSON.stringify(source.city),before);
  assert.equal(session.reset(),true);
  assert.equal(session.countChange,null);
  assert.equal(session.plotIds.length,property.plotIds.length);
});
