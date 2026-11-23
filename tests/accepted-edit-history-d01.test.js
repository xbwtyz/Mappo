import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { AcceptedEditHistoryD01,describeAcceptedEditD01 } from '../src/core/accepted-edit-history-d01.js';

function cityFixture() {
  const project=createProject({seed:'d01-ledger-2026',size:'small',morphology:'organic'});
  validateStoredProject(project);return project;
}
function renamed(project,id,name) {
  const candidate=structuredClone(project);
  const row=candidate.city.buildings.find(x=>x.id===id);
  row.customName=name;validateStoredProject(candidate);
  return candidate;
}
function used(project,id,name) {
  const candidate=structuredClone(project);
  const row=candidate.city.properties.find(x=>x.id===id);
  row.customUse=name;validateStoredProject(candidate);return candidate;
}
test('D01 interleaved identities are strict chronological transactions with Redo',()=>{
  const a=cityFixture(),bId=a.city.buildings[0].id,pId=a.city.properties[0].id;
  const b=renamed(a,bId,'First name'),c=used(b,pId,'Abbey complex');
  const d=renamed(c,bId,'Second name');
  const history=new AcceptedEditHistoryD01();
  assert.equal(history.observe(a).status,'baseline');
  for(const item of [b,c,d])assert.equal(history.observe(item).status,'recorded');
  assert.deepEqual(history.summaries().map(x=>x.family),['identity','identity','identity']);
  for(const [expected,after] of [[c,d],[b,c],[a,b]]){
    assert.ok(history.can('undo',after));
    const result=history.prepare('undo',after,defaultWorkspace(after));
    assert.equal(result.ok,true,result.reason);
    assert.equal(JSON.stringify(result.candidate.city),JSON.stringify(expected.city));
    history.accept('undo',result.entry,result.candidate);
  }
  for(const [expected,after] of [[b,a],[c,b],[d,c]]){
    const result=history.prepare('redo',after,defaultWorkspace(after));
    assert.equal(result.ok,true,result.reason);
    assert.equal(JSON.stringify(result.candidate.city),JSON.stringify(expected.city));
    history.accept('redo',result.entry,result.candidate);
  }
  assert.equal(history.can('redo',d),false);
});
test('D01 accepted history cannot overwrite state mutated outside the ledger',()=>{
  const a=cityFixture(),b=renamed(a,a.city.buildings[0].id,'One');
  const history=new AcceptedEditHistoryD01();history.observe(a);history.observe(b);
  const rogue=used(b,b.city.properties[0].id,'Changed outside transaction');
  assert.equal(history.prepare('undo',rogue,defaultWorkspace(rogue)).ok,false);
  assert.equal(history.past.length,1);
  assert.equal(history.future.length,0);
  assert.equal(history.can('undo',rogue),false);
  assert.equal(history.observe(rogue).status,'recorded');
  assert.equal(history.past.length,2);
});
test('D01 new accepted edit after Undo cuts every Redo candidate',()=>{
  const a=cityFixture(),b=renamed(a,a.city.buildings[0].id,'One');
  const c=used(b,b.city.properties[0].id,'Residence');
  const history=new AcceptedEditHistoryD01();for(const p of [a,b,c])history.observe(p);
  const undo=history.prepare('undo',c,defaultWorkspace(c));
  assert.ok(undo.ok,undo.reason);history.accept('undo',undo.entry,undo.candidate);
  const d=used(b,b.city.properties[0].id,'Inn / Tavern');
  assert.equal(history.observe(d).status,'recorded');
  assert.equal(history.future.length,0);
});
test('D01 capacity has visible pruning and oversize states',()=>{
  const a=cityFixture(),id=a.city.buildings[0].id;
  const h=new AcceptedEditHistoryD01({maxEntries:2,maxBytes:64*1024*1024});
  h.observe(a);let current=a;
  for(let i=1;i<=3;i++){
    current=renamed(current,id,'Name '+i);
    h.observe(current);
  }
  assert.equal(h.length,2);
  assert.match(h.notice,/capacity/i);
  assert.deepEqual(h.summaries().map(x=>x.serial),[2,3]);
  const tiny=new AcceptedEditHistoryD01({maxEntries:20,maxBytes:1024});
  tiny.observe(a);
  assert.equal(tiny.observe(renamed(a,id,'Name')).status,'oversize');
  assert.equal(tiny.length,0);
  assert.match(tiny.notice,/exceeded/i);
});
test('D01 no-op, barrier and display-only updates do not invent transactions',()=>{
  const a=cityFixture(),h=new AcceptedEditHistoryD01();
  h.observe(a);assert.equal(h.observe(structuredClone(a)).status,'unchanged');
  assert.equal(h.length,0);
  const b=renamed(a,a.city.buildings[0].id,'One');
  h.observe(b);
  const presentation=structuredClone(b);presentation.options={...presentation.options};
  assert.equal(h.observe(presentation).status,'unchanged');
  assert.equal(h.length,1);
  const altered=structuredClone(b);altered.city.name='Different city name';
  assert.equal(h.observe(altered).status,'barrier');
  assert.equal(h.length,0);
  assert.ok(h.notice.includes('cleared'));
});
test('D01 classification distinguishes property, compound and unsupported district changes',()=>{
  const a=cityFixture();
  const propertyId=a.city.properties[0].id;
  const b=used(a,propertyId,'Guildhall');
  assert.equal(describeAcceptedEditD01(a,b).family,'identity');
  const c=structuredClone(a);c.city.districtState={...c.city.districtState,status:'pending'};
  assert.equal(describeAcceptedEditD01(a,c).barrier,true);
  const site=a.city.properties.find(x=>x.buildingIds.length>=2);
  if(site){
    const d=structuredClone(a),p=d.city.properties.find(x=>x.id===site.id);
    p.buildingCompounds=[{id:'CMP-MAN-001X',name:'Castle',memberBuildingIds:site.buildingIds.slice(0,2)}];
    validateStoredProject(d);
    assert.equal(describeAcceptedEditD01(a,d).family,'compound');
  }
});

test('D01 accepted road topology owns coupled district reconciliation without treating it as a barrier',()=> {
  const a=cityFixture(),b=structuredClone(a);
  b.city.roads=b.city.roads.slice(1); // classification only; full application still validates.
  b.city.districtState={...b.city.districtState,status:'pending'};
  const cls=describeAcceptedEditD01(a,b);
  assert.equal(cls.family,'road');
  assert.equal(cls.barrier,undefined);
  const onlyDistrict=structuredClone(a);
  onlyDistrict.city.districtState={...onlyDistrict.city.districtState,status:'pending'};
  assert.equal(describeAcceptedEditD01(a,onlyDistrict).barrier,true);
});

test('D01 explicit district history boundary is mandatory even when district records touch road metadata',()=>{
  const a=cityFixture(),h=new AcceptedEditHistoryD01();
  h.observe(a);
  const b=renamed(a,a.city.buildings[0].id,'Kept identity');
  assert.equal(h.observe(b).status,'recorded');
  const c=structuredClone(b);
  c.city.roads[0].districtId='DIST-CHANGED';
  h.clear(c,'District assignment cleared session history.');
  assert.equal(h.length,0);
  assert.equal(h.observe(c).status,'unchanged');
  assert.equal(h.can('undo',c),false);
  assert.equal(c.city.buildings[0].customName,'Kept identity');
});
