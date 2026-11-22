import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {BuildingStructureHistory3H} from '../src/editor/building-structure-history.js';
import {prepareCompoundMembership,prepareCompoundTransform,previewCompoundTransform,compoundTransformFrame} from '../src/editor/building-compounds-c01.js';

let cached;
function fixture() {
  if(cached)return cached;
  for(const seed of ['c01-compounds','c01-castle','c01-estate','c01-groups','c01-barracks']){
    const project=createProject({seed,size:'medium',morphology:'organic'});
    for(const property of project.city.properties){
      if(property.buildingIds.length>=2){
        cached={project,property,ids:property.buildingIds.slice(0,3)};
        return cached;
      }
    }
  }
  throw Error('No deterministic multi-building property fixture was found.');
}
const createGroup=(project,property,ids,name='Castle complex')=>
  prepareCompoundMembership(project,defaultWorkspace(project),{
    action:'create',propertyId:property.id,name,memberBuildingIds:ids
  });
test('C01 group creation, update, dissolve, save/reopen and one property-scoped Undo/Redo',()=>{
  const {project,property,ids}=fixture();
  const original=JSON.stringify(project.city);
  const receipt=createGroup(project,property,ids);
  assert.equal(receipt.ok,true,receipt.issues?.[0]?.message);
  const grouped=receipt.candidate;
  assert.equal(JSON.stringify(project.city),original,'accepted source never changes during candidate validation');
  const compound=grouped.city.properties.find(p=>p.id===property.id).buildingCompounds[0];
  assert.ok(compound.id.startsWith('CMP-MAN-'));
  assert.equal(compound.name,'Castle complex');
  assert.deepEqual(compound.memberBuildingIds,ids);
  assert.deepEqual(grouped.city.buildings,project.city.buildings,'grouping does not rewrite any building');
  const history=new BuildingStructureHistory3H();
  assert.equal(history.record(project,grouped,property.id,'compound-create'),true);
  assert.equal(history.count('undo',property.id),1);
  const undone=history.prepare(grouped,defaultWorkspace(grouped),property.id,'undo');
  assert.equal(undone.ok,true,undone.issues?.[0]?.message);
  assert.equal(JSON.stringify(undone.candidate.city),original);
  history.accept(undone.entry,'undo');
  const redone=history.prepare(undone.candidate,defaultWorkspace(undone.candidate),property.id,'redo');
  assert.equal(redone.ok,true,redone.issues?.[0]?.message);
  assert.deepEqual(redone.candidate.city,grouped.city);
  const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(grouped,defaultWorkspace(grouped))));
  assert.deepEqual(saved.project.city.properties.find(p=>p.id===property.id).buildingCompounds,[compound]);
  const update=prepareCompoundMembership(grouped,defaultWorkspace(grouped),{
    action:'update',propertyId:property.id,groupId:compound.id,name:'Abbey complex',
    memberBuildingIds:ids
  });
  assert.equal(update.ok,true,update.issues?.[0]?.message);
  assert.equal(update.candidate.city.properties.find(p=>p.id===property.id).buildingCompounds[0].name,'Abbey complex');
  const dissolved=prepareCompoundMembership(update.candidate,defaultWorkspace(update.candidate),{
    action:'dissolve',propertyId:property.id,groupId:compound.id
  });
  assert.equal(dissolved.ok,true,dissolved.issues?.[0]?.message);
  assert.equal(dissolved.candidate.city.properties.find(p=>p.id===property.id).buildingCompounds,undefined);
  assert.deepEqual(dissolved.candidate.city.buildings,project.city.buildings);
});
test('C01 validator blocks missing, duplicate, cross-property and one-member groups',()=>{
  const {project,property,ids}=fixture();
  const receipt=createGroup(project,property,ids);
  assert.equal(receipt.ok,true,receipt.issues?.[0]?.message);
  const invalid=mutator=>{
    const bad=structuredClone(receipt.candidate);
    mutator(bad.city.properties.find(p=>p.id===property.id).buildingCompounds[0],bad);
    assert.throws(()=>validateStoredProject(bad));
  };
  invalid(group=>group.memberBuildingIds.splice(1));
  invalid(group=>group.memberBuildingIds[1]=group.memberBuildingIds[0]);
  invalid(group=>group.memberBuildingIds[1]='BLD-DOES-NOT-EXIST');
  invalid(group=>group.memberBuildingIds[1]=project.city.buildings.find(b=>b.propertyId!==property.id).id);
  invalid(group=>group.id='CMP-INVALID');
  invalid((group,bad)=>bad.city.properties.find(p=>p.id===property.id).buildingCompounds.push(structuredClone(group)));
  assert.equal(prepareCompoundMembership(project,defaultWorkspace(project),{
    action:'create',propertyId:property.id,name:'Wrong property',
    memberBuildingIds:[ids[0],project.city.buildings.find(b=>b.propertyId!==property.id).id]
  }).ok,false);
});
test('C01 group transforms use a common pivot, preserve source and reject invalid edits atomically',()=>{
  const {project,property,ids}=fixture();
  const receipt=createGroup(project,property,ids);
  assert.equal(receipt.ok,true,receipt.issues?.[0]?.message);
  const grouped=receipt.candidate,groupId=receipt.groupId;
  const frame=compoundTransformFrame(grouped,property.id,groupId);
  assert.ok(Number.isFinite(frame.x)&&Number.isFinite(frame.y));
  const proposed=previewCompoundTransform(grouped,property.id,groupId,{dx:.01,dy:.01,angle:0.001,scaleX:1,scaleY:1});
  assert.equal(proposed.buildingIds.length,ids.length);
  assert.equal(grouped.city.buildings.find(b=>b.id===ids[0]).footprint[0].x,
    project.city.buildings.find(b=>b.id===ids[0]).footprint[0].x);
  const initial=JSON.stringify(grouped.city);
  assert.equal(prepareCompoundTransform(grouped,defaultWorkspace(grouped),property.id,groupId,
    {dx:10000,dy:0,angle:0,scaleX:1,scaleY:1}).ok,false);
  assert.equal(JSON.stringify(grouped.city),initial);
  const invalid=prepareCompoundTransform(grouped,defaultWorkspace(grouped),property.id,groupId,{});
  assert.equal(invalid.ok,false);
  let accepted;
  for(const transform of [
    {dx:.01,dy:0,angle:0,scaleX:1,scaleY:1},
    {dx:0,dy:.01,angle:0,scaleX:1,scaleY:1},
    {dx:.002,dy:0,angle:.0001,scaleX:1,scaleY:1},
    {dx:0,dy:0,angle:0,scaleX:.9999,scaleY:.9999}
  ]){
    const result=prepareCompoundTransform(grouped,defaultWorkspace(grouped),property.id,groupId,transform);
    if(result.ok){accepted=result;break;}
  }
  assert.ok(accepted,'At least one small compound adjustment should satisfy frontage and geometry validation');
  const history=new BuildingStructureHistory3H();
  assert.ok(history.record(grouped,accepted.candidate,property.id,'compound-transform'));
  const undo=history.prepare(accepted.candidate,defaultWorkspace(accepted.candidate),property.id,'undo');
  assert.equal(undo.ok,true,undo.issues?.[0]?.message);
  assert.equal(JSON.stringify(undo.candidate.city),initial);
  history.accept(undo.entry,'undo');
  const redo=history.prepare(undo.candidate,defaultWorkspace(undo.candidate),property.id,'redo');
  assert.equal(redo.ok,true,redo.issues?.[0]?.message);
  assert.deepEqual(redo.candidate.city,accepted.candidate.city);
});
