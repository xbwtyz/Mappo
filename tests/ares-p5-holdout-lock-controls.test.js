import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDOUT_MANIFEST,inventoryHoldoutCase} from '../scripts/development/research/ares-p5-holdout-inventory.mjs';
import {holdoutLockedRow,HOLDOUT_ARMS,HOLDOUT_OPTIONS} from '../scripts/development/research/ares-p5-holdout-lock.mjs';
import {lockedRtreCase} from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
import {probeFreshRtreHoldout,probeFreshRtreFirstValid} from '../scripts/development/research/ares-rtre-single-junction.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
test('All 100 holdout locks preserve preregistered identity and offsets',()=>{
  for(const r of HOLDOUT_MANIFEST.rows){
    const id='h:'+r.id,lock=holdoutLockedRow(id),recipe=lockedRtreCase(id);
    assert.equal(lock.options.seed,r.options.seed);assert.deepEqual(lock.offset,r.offset);
    assert.equal(recipe.source,lock.source);assert.deepEqual(recipe.selectedRoadIds,lock.selectedRoadIds);
  }
  assert.deepEqual(HOLDOUT_ARMS,['R5','analytical','hybrid']);assert.equal(HOLDOUT_OPTIONS.maxNeighbors,4);
  assert.deepEqual(inventoryHoldoutCase('radial-01'),holdoutLockedRow('h:radial-01'));
});
test('Holdout adapter refuses unknown IDs, strategies and generic search access',async()=>{
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
  await assert.rejects(probeFreshRtreHoldout('h:unknown','R5',b),/Frozen holdout/);
  await assert.rejects(probeFreshRtreHoldout('h:radial-01','X7',b),/Unknown fixed holdout arm/);
  await assert.rejects(probeFreshRtreFirstValid('h:radial-01',HOLDOUT_OPTIONS,b),/Use fixed holdout arms/);
  assert.equal(b.snapshot().work,0);
});
