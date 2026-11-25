import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { copyJson, defaultWorkspace } from '../src/data/project-format.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { formatAllocatedIdentity } from '../src/core/identity-allocation.js';
import { reserveAllocatedIdentities } from '../src/core/identity-reservations.js';

const base=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ns='0123456789abcdef0123456789abcdef',other='f'.repeat(32);
const tx={family:'building',operation:'test-replacement',label:'Replace building',targetIds:[]};
function fixture(){
  const a=copyJson(base);
  a.identityAllocation={version:1,namespaces:{[other]:{building:19,plot:4}}};
  const h=new AcceptedEditHistoryD01();
  h.clear(a);
  return {a,h};
}
function replace(project){
  const p=copyJson(project);
  const reservation=reserveAllocatedIdentities(p.identityAllocation,ns,[{type:'building',key:'replacement'}]);
  p.identityAllocation=reservation.nextState;
  const row=p.city.buildings[0],old=row.id;
  row.id=reservation.allocations[0].id;
  const property=p.city.properties.find(x=>x.id===row.propertyId);
  property.buildingIds=property.buildingIds.map(id=>id===old?row.id:id);
  return p;
}
function replay(h,direction,p){
  const result=h.prepare(direction,p,defaultWorkspace(p));
  assert.equal(result.ok,true,result.reason);
  h.accept(direction,result.entry,result.candidate);
  return result.candidate;
}
test('D01 undo restores original identity but retains all current allocation counters',()=>{
  const {a,h}=fixture(),b=replace(a);
  assert.equal(h.record(a,b,tx).status,'recorded');
  const restored=replay(h,'undo',b);
  assert.deepEqual(restored.city,a.city);
  assert.deepEqual(restored.identityAllocation,b.identityAllocation);
  assert.equal(restored.identityAllocation.namespaces[ns].building,1);
  assert.equal(h.past.length,0);
  assert.equal(h.future.length,1);
});
test('D01 redo restores the original allocated identity without allocating again',()=>{
  const {a,h}=fixture(),b=replace(a);
  h.record(a,b,tx);
  const restored=replay(h,'undo',b),redone=replay(h,'redo',restored);
  assert.deepEqual(redone,b);
  assert.equal(redone.city.buildings[0].id,formatAllocatedIdentity('building',ns,1));
});
test('D01 multiple chronological undos and redos retain the latest high-water marks',()=>{
  const {a,h}=fixture(),b=replace(a),c=replace(b);
  h.record(a,b,tx);h.record(b,c,tx);
  const ub=replay(h,'undo',c),ua=replay(h,'undo',ub);
  assert.deepEqual(ub.city,b.city);assert.deepEqual(ua.city,a.city);
  assert.deepEqual(ua.identityAllocation,c.identityAllocation);
  const rb=replay(h,'redo',ua),rc=replay(h,'redo',rb);
  assert.deepEqual(rc,c);
});
test('D01 undo then new allocation never reuses the retired sequence',()=>{
  const {a,h}=fixture(),b=replace(a);
  h.record(a,b,tx);
  const restored=replay(h,'undo',b),next=replace(restored);
  assert.equal(next.city.buildings[0].id,formatAllocatedIdentity('building',ns,2));
  assert.equal(h.record(restored,next,tx).status,'recorded');
  assert.equal(h.future.length,0);
  assert.equal(h.can('redo',next),false);
});
for(const [name,alter] of [
  ['unobserved counter increase',p=>p.identityAllocation.namespaces[ns].building++],
  ['unobserved counter rollback',p=>delete p.identityAllocation.namespaces[ns]],
  ['unrelated namespace removal',p=>delete p.identityAllocation.namespaces[other]],
  ['nonallocator root field',p=>p.seed='different'],
  ['city metadata',p=>p.city.name='Different'],
  ['unsupported schema',p=>p.schemaVersion=12]
]){
  test('D01 replay rejects '+name+' against strict accepted baseline',()=>{
    const {a,h}=fixture(),b=replace(a);h.record(a,b,tx);
    const rogue=copyJson(b);alter(rogue);
    const before=JSON.stringify(h);
    assert.equal(h.can('undo',rogue),false);
    assert.equal(h.prepare('undo',rogue,defaultWorkspace(rogue)).ok,false);
    assert.equal(JSON.stringify(h),before);
  });
}
test('D01 historical counter above current baseline refuses replay',()=>{
  const {a,h}=fixture(),b=replace(a);h.record(a,b,tx);
  h.past[0].from.identityAllocation.namespaces[other].building=20;
  assert.equal(h.can('undo',b),false);
});
test('D01 malformed historical metadata cannot be hidden by current allocator',()=>{
  const {a,h}=fixture(),b=replace(a);h.record(a,b,tx);
  h.past[0].from.identityAllocation.namespaces[other].plot=-1;
  assert.equal(h.prepare('undo',b,defaultWorkspace(b)).ok,false);
});
test('D01 accept refuses a forged replay candidate with counter rollback',()=>{
  const {a,h}=fixture(),b=replace(a);h.record(a,b,tx);
  const result=h.prepare('undo',b,defaultWorkspace(b));assert.ok(result.ok);
  const altered=copyJson(result.candidate);delete altered.identityAllocation.namespaces[ns];
  const before=JSON.stringify(h);
  assert.throws(()=>h.accept('undo',result.entry,altered),/changed/);
  assert.equal(JSON.stringify(h),before);
});
test('D01 accept refuses a forged replay candidate with counter inflation',()=>{
  const {a,h}=fixture(),b=replace(a);h.record(a,b,tx);
  const result=h.prepare('undo',b,defaultWorkspace(b));assert.ok(result.ok);
  const altered=copyJson(result.candidate);altered.identityAllocation.namespaces[ns].building++;
  const before=JSON.stringify(h);
  assert.throws(()=>h.accept('undo',result.entry,altered),/changed/);
  assert.equal(JSON.stringify(h),before);
});
test('D01 accept refuses a stale history entry after an intervening edit',()=>{
  const {a,h}=fixture(),b=replace(a);h.record(a,b,tx);
  const result=h.prepare('undo',b,defaultWorkspace(b));assert.ok(result.ok);
  const c=replace(b);h.record(b,c,tx);
  const before=JSON.stringify(h);
  assert.throws(()=>h.accept('undo',result.entry,result.candidate),/changed/);
  assert.equal(JSON.stringify(h),before);
});
