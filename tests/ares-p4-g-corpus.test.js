import test from 'node:test';
import assert from 'node:assert/strict';
import { G_MANIFEST,inventoryGCorpusCity,enumerateGSlots } from '../scripts/development/research/ares-p4-g-corpus.mjs';
test('G1 freezes the complete 216-slot matrix before any search',()=>{
  const rows=enumerateGSlots();assert.equal(rows.length,G_MANIFEST.reporting.plannedSlots);assert.equal(new Set(rows.map(r=>r.id)).size,216);
  for(const r of rows)assert.ok(Math.abs(Math.hypot(r.offset.x,r.offset.y)-r.magnitude)<1e-10);
  assert.equal(G_MANIFEST.permissions.destruction,false);assert.equal(G_MANIFEST.permissions.regeneration,false);
  assert.throws(()=>inventoryGCorpusCity({}),/recipe ID/);
  assert.throws(()=>inventoryGCorpusCity('unknown'),/Unknown frozen/);
});
for(const city of G_MANIFEST.cities)test('G1 freezes '+city.id+' source and group inventory',()=>{
  const a=inventoryGCorpusCity(city.id);
  assert.match(a.source,/^[a-f0-9]{64}$/);assert.ok(a.roadCount>0);assert.ok(a.nodeCount>0);
  assert.equal(a.groups.length,6);
  for(const g of a.groups){
    assert.ok(g.visits<=G_MANIFEST.selection.maxVisitsPerGroup);
    if(g.status!=='selected'){assert.ok(['selection-limit','selection-unavailable'].includes(g.status));assert.deepEqual(g.selectedRoadIds,[]);continue;}
    assert.equal(g.selectedRoadIds.length,g.count);assert.equal(new Set(g.selectedRoadIds).size,g.count);
    assert.deepEqual(g.selectedRoadIds,[...g.selectedRoadIds].sort());
    if(g.shape==='loop'){assert.equal(g.nodeCount,g.count);assert.ok(g.degreeSequence.every(n=>n===2));}
    else {assert.equal(g.nodeCount,g.count+1);if(g.shape==='chain')assert.equal(g.degreeSequence.filter(n=>n===1).length,2);else assert.ok(g.degreeSequence.some(n=>n>=3));}
  }
  assert.ok(a.groups.some(g=>g.status==='selected'));
  // One repeated frozen recipe checks source and selection determinism.
  if(city.id==='radial-small')assert.deepEqual(inventoryGCorpusCity(city.id),a);
  console.log('ARES_P4_G1 '+JSON.stringify(a));
});
