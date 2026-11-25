import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { districtSnapshot } from '../src/editor/districts.js';

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
const identityEdit = { family: 'identity', operation: 'identity-change', label: 'Edit identity', targetIds: [] };

test('D01 interleaved identities are strict chronological transactions with Redo',()=>{
  const a=cityFixture(),bId=a.city.buildings[0].id,pId=a.city.properties[0].id;
  const b=renamed(a,bId,'First name'),c=used(b,pId,'Abbey complex');
  const d=renamed(c,bId,'Second name');
  const history=new AcceptedEditHistoryD01();
  assert.equal(history.observe(a).status,'baseline');
  for(const item of [b,c,d])assert.equal(history.observe(item,identityEdit).status,'recorded');
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
  const history=new AcceptedEditHistoryD01();history.observe(a);history.observe(b,identityEdit);
  const rogue=used(b,b.city.properties[0].id,'Changed outside transaction');
  assert.equal(history.prepare('undo',rogue,defaultWorkspace(rogue)).ok,false);
  assert.equal(history.past.length,1);
  assert.equal(history.future.length,0);
  assert.equal(history.can('undo',rogue),false);
  assert.equal(history.observe(rogue).status,'barrier');
  assert.equal(history.past.length,0);
});
test('D01 new accepted edit after Undo cuts every Redo candidate',()=>{
  const a=cityFixture(),b=renamed(a,a.city.buildings[0].id,'One');
  const c=used(b,b.city.properties[0].id,'Residence');
  const history=new AcceptedEditHistoryD01();for(const p of [a,b,c])history.observe(p,identityEdit);
  const undo=history.prepare('undo',c,defaultWorkspace(c));
  assert.ok(undo.ok,undo.reason);history.accept('undo',undo.entry,undo.candidate);
  const d=used(b,b.city.properties[0].id,'Inn / Tavern');
  assert.equal(history.observe(d,identityEdit).status,'recorded');
  assert.equal(history.future.length,0);
});
test('D01 capacity has visible pruning and oversize states',()=>{
  const a=cityFixture(),id=a.city.buildings[0].id;
  const h=new AcceptedEditHistoryD01({maxEntries:2,maxBytes:64*1024*1024});
  h.observe(a);let current=a;
  for(let i=1;i<=3;i++){
    current=renamed(current,id,'Name '+i);
    h.observe(current,identityEdit);
  }
  assert.equal(h.length,2);
  assert.match(h.notice,/capacity/i);
  assert.deepEqual(h.summaries().map(x=>x.serial),[2,3]);
  const tiny=new AcceptedEditHistoryD01({maxEntries:20,maxBytes:1024});
  tiny.observe(a);
  assert.equal(tiny.observe(renamed(a,id,'Name'),identityEdit).status,'oversize');
  assert.equal(tiny.length,0);
  assert.match(tiny.notice,/exceeded/i);
});
test('D01 no-op, barrier and display-only updates do not invent transactions',()=>{
  const a=cityFixture(),h=new AcceptedEditHistoryD01();
  h.observe(a);assert.equal(h.observe(structuredClone(a)).status,'unchanged');
  assert.equal(h.length,0);
  const b=renamed(a,a.city.buildings[0].id,'One');
  h.observe(b,identityEdit);
  const presentation=structuredClone(b);presentation.options={...presentation.options};
  assert.equal(h.observe(presentation).status,'unchanged');
  assert.equal(h.length,1);
  const altered=structuredClone(b);altered.city.name='Different city name';
  assert.equal(h.observe(altered).status,'barrier');
  assert.equal(h.length,0);
  assert.ok(h.notice.includes('cleared'));
});
test('D01 uses the editor transaction when district changes also touch road records', () => {
  const a = cityFixture();
  const b = structuredClone(a);
  b.city.roads[0].districtId = 'district-assignment';
  const edit = { family: 'districts', operation: 'move', label: 'Move block to district', targetIds: ['BLOCK-01'] };
  const h = new AcceptedEditHistoryD01();
  h.clear(a);
  assert.equal(h.observe(b, edit).status, 'recorded');
  const entry = h.entry('undo');
  assert.equal(entry.family, edit.family);
  assert.equal(entry.operation, edit.operation);
  assert.equal(entry.label, edit.label);
  assert.deepEqual(entry.targetIds, edit.targetIds);
});

test('D01 road undo restores a saved district snapshot removed by the accepted edit', () => {
  const a = cityFixture();
  const b = renamed(a, a.city.buildings[0].id, 'Prepared road and neighborhood edit');
  const older = districtSnapshot(a.city);
  const history = new AcceptedEditHistoryD01();
  history.clear(a);
  const operation = {
    family: 'road', operation: 'road-reflow', label: 'Move road junction', targetIds: [a.city.nodes[0].id],
    editorHistory: { key: 'districtEditor', before: { history: [older], savedCount: 1 },
      after: { history: [], savedCount: 0 } },
  };
  assert.equal(history.observe(b, operation).status, 'recorded');
  const workspace = { ...defaultWorkspace(b), districtEditor: { history: [] } };
  const undo = history.prepare('undo', b, workspace);
  assert.equal(undo.ok, true, undo.reason);
  assert.deepEqual(undo.workspace.districtEditor.history, [older]);
  history.accept('undo', undo.entry, undo.candidate);
  const redo = history.prepare('redo', undo.candidate, undo.workspace);
  assert.equal(redo.ok, true, redo.reason);
  assert.deepEqual(redo.workspace.districtEditor.history, []);
  assert.equal(history.length, 1);
});

test('D01 explicit history barriers prevent replay across a replaced city',()=>{
  const a=cityFixture(),h=new AcceptedEditHistoryD01();
  h.observe(a);
  const b=renamed(a,a.city.buildings[0].id,'Kept identity');
  assert.equal(h.observe(b,identityEdit).status,'recorded');
  const c=structuredClone(b);
  c.city.roads[0].districtId='DIST-CHANGED';
  h.clear(c,'District assignment cleared session history.');
  assert.equal(h.length,0);
  assert.equal(h.observe(c).status,'unchanged');
  assert.equal(h.can('undo',c),false);
  assert.equal(c.city.buildings[0].customName,'Kept identity');
});

test('S1-B3 history preflight retains exact ordered JSON equality and UTF-16 byte limits',()=>{
  const a=cityFixture(),b=renamed(a,a.city.buildings[0].id,'Name 🏰');
  const meta={note:'opaque 🏰',entries:[1,2,3]};
  const bytes=2*(JSON.stringify(a).length+JSON.stringify(b).length+JSON.stringify(meta).length);
  const exact=new AcceptedEditHistoryD01({maxBytes:bytes});exact.clear(a);
  assert.equal(exact.fits(a,b,meta),true);
  assert.equal(exact.canRecord(a,b,meta),true);
  const tooSmall=new AcceptedEditHistoryD01({maxBytes:bytes-1});tooSmall.clear(a);
  assert.equal(tooSmall.fits(a,b,meta),false);
  assert.equal(tooSmall.canRecord(a,b,meta),false);
  assert.equal(exact.canRecord(a,structuredClone(a)),false);
  const reordered=Object.fromEntries(Object.entries(a).reverse());
  assert.notEqual(JSON.stringify(a),JSON.stringify(reordered));
  assert.equal(exact.canRecord(reordered,b,meta),false);
  assert.equal(exact.record(reordered,b,identityEdit).status,'stale');
  const result=exact.record(a,b,{...identityEdit,editorHistory:meta});
  assert.equal(result.status,'recorded');
  assert.equal(result.entry.bytes,bytes);
});

test('S1-B3 replay comparisons never cache mutable project or historical inputs',()=>{
  const a=cityFixture(),b=renamed(a,a.city.buildings[0].id,'New name');
  const h=new AcceptedEditHistoryD01();h.clear(a);h.record(a,b,identityEdit);
  const current=structuredClone(b);
  assert.equal(h.can('undo',current),true);
  current.city.buildings[0].customName='Stale';
  assert.equal(h.can('undo',current),false);
  current.city.buildings[0].customName='New name';
  assert.equal(h.can('undo',current),true);
  const entry=h.entry('undo');
  entry.to.city.buildings[0].customName='Tampered history';
  assert.equal(h.can('undo',current),false);
  entry.to.city.buildings[0].customName='New name';
  assert.equal(h.can('undo',current),true);
  const reordered=Object.fromEntries(Object.entries(current).reverse());
  assert.equal(h.can('undo',reordered),false);
});
