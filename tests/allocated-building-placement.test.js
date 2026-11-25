import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { copyJson, defaultWorkspace } from '../src/data/project-format.js';
import { AcceptedIdentitySession } from '../src/core/accepted-identity-session.js';
import { defaultBuildingSpec3H, prepareBuildingStructure3H } from '../src/editor/building-structures.js';
import { previewAllocatedBuildingPlacement, commitAllocatedBuildingPlacement } from '../src/editor/allocated-building-placement.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';

const ns='0123456789abcdef0123456789abcdef';
const context={projectId:'manual-building-test',revision:0,namespace:ns};
function findSite(){
  const original=createProject({seed:'3h-safe-structures',size:'small',morphology:'organic'});
  const workspace=defaultWorkspace(original);
  for(const b of original.city.buildings.slice(0,100)){
    const p=original.city.properties.find(p=>p.id===b.propertyId);
    const initial=defaultBuildingSpec3H(p,b);
    for(const scale of [.68,.55,.85]){
      const spec={...initial,width:initial.width*scale,depth:initial.depth*scale,preset:'rectangle'};
      const replacement=prepareBuildingStructure3H(original,workspace,{operation:'replace',propertyId:p.id,buildingId:b.id,spec});
      if(!replacement.ok)continue;
      const removed=prepareBuildingStructure3H(original,workspace,{operation:'delete',propertyId:p.id,buildingId:b.id});
      if(removed.ok)return {project:removed.candidate,intent:{propertyId:p.id,spec}};
    }
  }
  throw Error('No deterministic manual placement fixture');
}
const site=findSite();
function fixture(){
  const project=copyJson(site.project);
  const session=new AcceptedIdentitySession({project,context});
  return {session,workspace:defaultWorkspace(project),intent:copyJson(site.intent)};
}
function snapshot(session){return JSON.stringify({read:session.read(),ledger:session.copyHistory()});}
function preview(f){return previewAllocatedBuildingPlacement(f.session,f.workspace,f.intent);}
function apply(f,p){return commitAllocatedBuildingPlacement(f.session,f.workspace,f.intent,p);}
test('IDA manual placement previews a real validated building without consuming allocation',()=>{
  const f=fixture(),before=snapshot(f.session),p=preview(f);
  assert.ok(p.result.ok,JSON.stringify(p.result.issues));
  assert.equal(p.receipt.allocations[0].id,formatAllocatedIdentity('building',ns,1));
  assert.equal(p.result.candidate.identityAllocation.namespaces[ns].building,1);
  assert.deepEqual(preview(f).receipt,p.receipt);
  assert.equal(snapshot(f.session),before);
});
test('IDA manual placement commits real geometry, linkage, counter and history together',()=>{
  const f=fixture(),p=preview(f),before=f.session.read();
  const out=apply(f,p),id=p.receipt.allocations[0].id;
  const b=out.project.city.buildings.find(b=>b.id===id);
  assert.ok(b&&b.plotIds.length&&b.accessPath.length>1);
  assert.ok(out.project.city.properties.find(p=>p.id===f.intent.propertyId).buildingIds.includes(id));
  assert.equal(out.context.revision,1);
  assert.equal(out.project.identityAllocation.namespaces[ns].building,1);
  assert.equal(out.history.entries.length,1);
  assert.deepEqual(out.project.city.buildings.filter(b=>b.id!==id),before.project.city.buildings);
  assert.deepEqual(out.project,p.result.candidate);
});
test('IDA manual placement undo then new creation never reuses the retired ID',()=>{
  const f=fixture(),first=apply(f,preview(f));
  const undone=f.session.replay({direction:'undo',context:first.context,workspace:f.workspace});
  assert.equal(undone.project.identityAllocation.namespaces[ns].building,1);
  const p=preview(f),second=apply(f,p);
  assert.equal(p.receipt.allocations[0].id,formatAllocatedIdentity('building',ns,2));
  assert.equal(second.project.identityAllocation.namespaces[ns].building,2);
  assert.equal(f.session.copyHistory().future.length,0);
});
test('IDA manual placement rejects stale competing reservations',()=>{
  const f=fixture(),a=preview(f),b=preview(f);apply(f,a);
  const before=snapshot(f.session);
  assert.throws(()=>apply(f,b),/Stale/);
  assert.equal(snapshot(f.session),before);
});
test('IDA manual placement invalid geometry refuses without consuming IDs',()=>{
  const f=fixture(),before=snapshot(f.session);
  f.intent.spec.u=-9999;
  const p=preview(f);assert.equal(p.result.ok,false);
  assert.throws(()=>apply(f,p));
  assert.equal(snapshot(f.session),before);
  assert.equal(p.receipt.allocations[0].sequence,1);
});
for(const [name,alter] of [
 ['wrong type',p=>p.receipt.allocations[0].type='plot'],
 ['counter inflation',p=>p.receipt.nextState.namespaces[ns].building++],
 ['wrong ID',p=>p.receipt.allocations[0].id='BLD-MAN-FORGED'],
 ['wrong key',p=>p.receipt.allocations[0].key='different'],
 ['foreign session',p=>p.receipt.binding.namespace='f'.repeat(32)]
]){
 test('IDA manual placement rejects '+name,()=>{
  const f=fixture(),p=structuredClone(preview(f)),before=snapshot(f.session);
  alter(p);assert.throws(()=>apply(f,p));assert.equal(snapshot(f.session),before);
 });
}
test('IDA manual placement ignores untrusted preview candidate and recomputes domain',()=>{
 const f=fixture(),p=preview(f);
 p.result.candidate.city.buildings[0].customName='Injected';
 const out=apply(f,p);
 assert.notEqual(out.project.city.buildings[0].customName,'Injected');
});
test('IDA manual placement requires an actual building creation intent',()=>{
 const f=fixture(),before=snapshot(f.session);
 assert.throws(()=>previewAllocatedBuildingPlacement(f.session,f.workspace,{...f.intent,courtyard:{only:true}}),/creation intent/);
 assert.throws(()=>previewAllocatedBuildingPlacement(f.session,f.workspace,{...f.intent,buildingId:'BLD-MAN-OVERRIDE'}),/creation intent/);
 assert.equal(snapshot(f.session),before);
});
test('IDA reserved ID cannot enter the legacy placement path without verification',()=>{
 const f=fixture(),{project}=f.session.read(),p=preview(f);
 const result=prepareBuildingStructure3H(project,f.workspace,{...f.intent,operation:'add',buildingId:p.receipt.allocations[0].id});
 assert.equal(result.ok,false);
 assert.equal(result.issues[0].code,'id');
});
test('IDA seeded generation remains deterministic and creates no allocation namespace',()=>{
 const a=createProject({seed:'3h-safe-structures',size:'small',morphology:'organic'});
 const b=createProject({seed:'3h-safe-structures',size:'small',morphology:'organic'});
 assert.deepEqual(a,b);
 assert.deepEqual(a.identityAllocation.namespaces,{});
 assert.ok(a.city.buildings.every(b=>!b.id.includes('-IDA-')));
});
