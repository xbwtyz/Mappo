import test from 'node:test';
import assert from 'node:assert/strict';
import {G_MANIFEST,inventoryGCorpusCity} from '../scripts/development/research/ares-p4-g-corpus.mjs';
import {G_LOCKED_INVENTORY} from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
import {x8Inventory,x8Route} from '../scripts/development/research/ares-p4x-x8-run.mjs';
test('X8 exact disjoint routes, frozen historical expectations and distinct intents',()=>{
  const rows=x8Inventory(),counts={},categories={};
  assert.equal(rows.length,216);assert.equal(new Set(rows.map(r=>r.slot.id)).size,216);
  const intents=new Set();
  for(const row of rows){
    counts[row.arm]=(counts[row.arm]??0)+1;
    categories[row.expected]=(categories[row.expected]??0)+1;
    if(row.arm==='unavailable')continue;
    const key=JSON.stringify([row.source,[...row.selectedRoadIds].sort(),row.slot.offset]);
    assert.ok(!intents.has(key));intents.add(key);
    assert.ok(row.cap>=4&&row.cap<=10);
    if(row.cap>4)assert.equal(row.cap,row.minimum);
  }
  assert.equal(intents.size,171);
  assert.equal(counts.unavailable,45);assert.equal(counts.R5,132);
  assert.equal(counts.X34,14);assert.equal(counts.X56,5);assert.equal(counts.X7,12);assert.equal(counts.residual,8);
  assert.equal(categories['baseline-valid'],67);assert.equal(categories['geometry-recovered'],65);
  assert.equal(categories['preflight-refused'],31);assert.equal(categories['search-refused'],8);
  assert.equal(G_MANIFEST.permissions.destruction,false);assert.equal(G_MANIFEST.permissions.regeneration,false);
  assert.throws(()=>x8Route('unknown'),/Unknown frozen/);
  console.log('ARES_P4X_X8_INVENTORY '+JSON.stringify({slots:rows.length,distinctAvailable:intents.size,counts,categories}));
});
for(const city of G_MANIFEST.cities)test('X8 fresh selection inventory '+city.id,()=>{
  assert.deepEqual(inventoryGCorpusCity(city.id),G_LOCKED_INVENTORY.rows.find(r=>r.id===city.id));
});
