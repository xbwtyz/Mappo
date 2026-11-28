import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBINED_CASES,searchHoldoutCombinedSeeds} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
test('Combined seed adapter admits only eleven frozen cases',async()=>{
 assert.equal(COMBINED_CASES.length,11);
 await assert.rejects(()=>searchHoldoutCombinedSeeds('h:radial-01'),/Frozen combined/);
 await assert.rejects(()=>searchHoldoutCombinedSeeds({caseId:'h:radial-12'}),/Frozen holdout/);
});
