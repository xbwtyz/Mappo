import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDOUT_MANIFEST,holdoutRecipe,inventoryHoldoutCase} from '../scripts/development/research/ares-p5-holdout-inventory.mjs';
import {G_MANIFEST} from '../scripts/development/research/ares-p4-g-corpus.mjs';
test('Holdout preregistered balance, fresh seeds and signed offsets',()=>{
  const m=HOLDOUT_MANIFEST;assert.equal(m.rows.length,100);
  assert.equal(new Set(m.rows.map(r=>r.id)).size,100);
  assert.equal(new Set(m.rows.map(r=>r.options.seed)).size,100);
  const oldSeeds=new Set(G_MANIFEST.cities.map(r=>r.options.seed));
  for(const row of m.rows){
    assert.ok(!oldSeeds.has(row.options.seed));assert.ok(Math.abs(row.offset.x)<=100&&Math.abs(row.offset.y)<=100);
    assert.ok(row.offset.x!==0||row.offset.y!==0);
  }
  for(const morphology of m.morphologies){
    const rows=m.rows.filter(r=>r.options.morphology===morphology);
    assert.equal(rows.length,25);assert.equal(new Set(rows.map(r=>JSON.stringify(r.offset))).size,25);
    assert.equal(rows.filter(r=>r.options.size==='small').length,9);
    assert.equal(rows.filter(r=>r.options.size==='medium').length,8);
    assert.equal(rows.filter(r=>r.options.size==='large').length,8);
    for(const axis of ['x','y']){assert.ok(rows.some(r=>r.offset[axis]===100));assert.ok(rows.some(r=>r.offset[axis]===-100));}
  }
  assert.throws(()=>holdoutRecipe('unknown'),/Unknown frozen holdout/);
  assert.throws(()=>holdoutRecipe({}),/Unknown frozen holdout/);
});
test('Holdout independent input replay is deterministic',()=>{
  assert.deepEqual(inventoryHoldoutCase('radial-01'),inventoryHoldoutCase('radial-01'));
});
