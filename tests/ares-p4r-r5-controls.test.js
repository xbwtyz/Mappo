import test from 'node:test';
import assert from 'node:assert/strict';
import { G_MANIFEST,enumerateGSlots } from '../scripts/development/research/ares-p4-g-corpus.mjs';
import { G_LOCKED_INVENTORY } from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
import { G_OPTIONS,R5_OPTIONS,runR5Slot } from '../scripts/development/research/ares-p4-g-run.mjs';
test('R5 preregistered full denominator and original reference settings',async()=>{
  assert.deepEqual(R5_OPTIONS,{...G_OPTIONS,maxCandidates:256});
  assert.equal(G_OPTIONS.maxCandidates,32);assert.equal(R5_OPTIONS.maxHops,6);assert.equal(R5_OPTIONS.maxNeighbors,4);assert.equal(R5_OPTIONS.maxObjects,10000);
  assert.equal(G_MANIFEST.permissions.destruction,false);assert.equal(G_MANIFEST.permissions.regeneration,false);
  const slots=enumerateGSlots();assert.equal(slots.length,216);assert.equal(new Set(slots.map(s=>s.id)).size,216);
  const available=slots.filter(s=>G_LOCKED_INVENTORY.rows.find(c=>c.id===s.city).groups.find(g=>g.id===s.group).status==='selected');
  assert.equal(available.length,171);assert.equal(slots.length-available.length,45);
  await assert.rejects(()=>runR5Slot('unknown'),/Unknown G slot/);
});
