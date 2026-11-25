import test from 'node:test';
import { courtyardFixture } from './helpers/courtyard-fixture.js';
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

function idaCourtyardFixture(skewed=false){
  const {project,workspace,host,occupant}=courtyardFixture({skewed});
  const {propertyId,spec,courtyard}=occupant;
  return {session:new AcceptedIdentitySession({project,context}),workspace,
    hostId:host.id,intent:{propertyId,spec,courtyard}};
}
const idaBuildingById=(project,id)=>project.city.buildings.find(b=>b.id===id);
const idaBuildingIds=project=>project.city.buildings.map(b=>b.id).sort();
for(const skewed of [false,true]){
  test('IDA courtyard placement allocates an independent occupant with '+(skewed?'skewed':'straight')+' portal',()=>{
    const f=idaCourtyardFixture(skewed),before=snapshot(f.session),original=f.session.read().project,p=preview(f);
    assert.ok(p.result.ok,JSON.stringify(p.result.issues));
    assert.equal(snapshot(f.session),before);
    const out=apply(f,p),id=p.receipt.allocations[0].id;
    const b=idaBuildingById(out.project,id),host=idaBuildingById(out.project,f.hostId);
    assert.equal(id,formatAllocatedIdentity('building',ns,1));
    assert.deepEqual(host.geometry.courtyardAccess.occupants,[{buildingId:id,portalId:'PORTAL-01'}]);
    assert.deepEqual(host.geometry.regions,idaBuildingById(original,f.hostId).geometry.regions);
    assert.deepEqual(host.components,idaBuildingById(original,f.hostId).components);
    assert.ok(b.plotIds.length&&b.accessPath.length>=5);
    assert.equal(b.frontageRoadId,host.frontageRoadId);
    assert.deepEqual(idaBuildingIds(out.project),[...idaBuildingIds(original),id].sort());
    assert.deepEqual(out.project.identityAllocation.namespaces,{[ns]:{building:1}});
    assert.equal(out.context.revision,1);
    assert.equal(out.history.entries.length,1);
    assert.deepEqual(out.project,p.result.candidate);
  });
}
test('IDA second courtyard occupant reuses the portal, not the building identity',()=>{
  const f=idaCourtyardFixture(),a=preview(f),first=apply(f,a);
  f.intent={...f.intent,spec:{...f.intent.spec,depth:2,v:f.intent.spec.v+3.5},
    courtyard:{...f.intent.courtyard,portalId:'PORTAL-01',action:'use'}};
  const b=preview(f);
  assert.ok(b.result.ok,JSON.stringify(b.result.issues));
  const second=apply(f,b),aId=a.receipt.allocations[0].id,bId=b.receipt.allocations[0].id;
  assert.equal(bId,formatAllocatedIdentity('building',ns,2));
  const host=idaBuildingById(second.project,f.hostId);
  assert.equal(host.geometry.courtyardAccess.portals.length,1);
  assert.deepEqual(host.geometry.courtyardAccess.occupants,[aId,bId].map(buildingId=>({buildingId,portalId:'PORTAL-01'})));
  assert.deepEqual(idaBuildingById(second.project,aId),idaBuildingById(first.project,aId));
  assert.ok(idaBuildingById(second.project,bId).accessPath.length>5);
  assert.equal(second.project.identityAllocation.namespaces[ns].building,2);
  assert.equal(second.history.entries.length,2);
});
test('IDA invalid courtyard portal refuses without consuming an identity',()=>{
  const f=idaCourtyardFixture(),before=snapshot(f.session);
  f.intent.courtyard.outerEdge=2;
  const p=preview(f);
  assert.equal(p.result.ok,false);
  assert.throws(()=>apply(f,p));
  assert.equal(snapshot(f.session),before);
  assert.equal(p.receipt.allocations[0].sequence,1);
});
test('IDA portal-only operation preserves existing building IDs and allocator metadata',()=>{
  const f=idaCourtyardFixture(),accepted=apply(f,preview(f)),before=snapshot(f.session);
  const result=prepareBuildingStructure3H(accepted.project,f.workspace,{
    ...f.intent,operation:'add',buildingId:'BLD-MAN-UNUSED-PORTAL',
    courtyard:{...f.intent.courtyard,only:true,innerOffset:.2,outerOffset:.4}
  });
  assert.ok(result.ok,JSON.stringify(result.issues));
  assert.equal(idaBuildingById(result.candidate,f.hostId).geometry.courtyardAccess.portals.length,2);
  assert.deepEqual(idaBuildingIds(result.candidate),idaBuildingIds(accepted.project));
  assert.deepEqual(result.candidate.identityAllocation,accepted.project.identityAllocation);
  assert.equal(snapshot(f.session),before);
});
test('IDA footprint replacement preserves an allocated continuing building ID and high-water mark',()=>{
  const f=fixture(),p=preview(f),accepted=apply(f,p),id=p.receipt.allocations[0].id,before=snapshot(f.session);
  const result=prepareBuildingStructure3H(accepted.project,f.workspace,{
    ...f.intent,operation:'replace',buildingId:id,spec:{...f.intent.spec,width:f.intent.spec.width*.95}
  });
  assert.ok(result.ok,JSON.stringify(result.issues));
  assert.notDeepEqual(idaBuildingById(result.candidate,id).footprint,idaBuildingById(accepted.project,id).footprint);
  assert.deepEqual(idaBuildingIds(result.candidate),idaBuildingIds(accepted.project));
  assert.deepEqual(result.candidate.identityAllocation,accepted.project.identityAllocation);
  assert.equal(snapshot(f.session),before);
});
test('IDA courtyard occupant deletion retains its retired high-water mark and detaches its link',()=>{
  const f=idaCourtyardFixture(),p=preview(f),accepted=apply(f,p),id=p.receipt.allocations[0].id,before=snapshot(f.session);
  const result=prepareBuildingStructure3H(accepted.project,f.workspace,{...f.intent,operation:'delete',buildingId:id});
  assert.ok(result.ok,JSON.stringify(result.issues));
  assert.equal(idaBuildingById(result.candidate,id),undefined);
  assert.deepEqual(idaBuildingById(result.candidate,f.hostId).geometry.courtyardAccess.occupants,[]);
  assert.deepEqual(result.candidate.identityAllocation,accepted.project.identityAllocation);
  assert.deepEqual(idaBuildingIds(result.candidate),idaBuildingIds(accepted.project).filter(x=>x!==id));
  assert.equal(snapshot(f.session),before);
});
for(const operation of ['replace','delete','portal-only']){
  test('IDA new-building reservation refuses '+operation+' without allocation',()=>{
    const f=idaCourtyardFixture(),{project,context:binding}=f.session.read(),p=preview(f),before=snapshot(f.session);
    const request={...f.intent,operation:operation==='portal-only'?'add':operation,
      buildingId:operation==='portal-only'?p.receipt.allocations[0].id:f.hostId,
      courtyard:{...f.intent.courtyard,only:operation==='portal-only'}};
    const result=prepareBuildingStructure3H(project,f.workspace,request,{identityReservation:{context:binding,receipt:p.receipt}});
    assert.equal(result.ok,false);
    assert.equal(result.issues[0].code,'id');
    assert.equal(snapshot(f.session),before);
  });
}
