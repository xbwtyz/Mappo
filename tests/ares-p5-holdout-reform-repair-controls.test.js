import test from 'node:test';
import assert from 'node:assert/strict';
import {REFORM_REPAIR_CASES,searchHoldoutReformRepair} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
test('Reform repair restricted to nine unresolved cases',async()=>{
 assert.equal(REFORM_REPAIR_CASES.length,9);
 await assert.rejects(()=>searchHoldoutReformRepair('h:linear-09'),/Frozen reform repair/);
 await assert.rejects(()=>searchHoldoutReformRepair('h:radial-24'),/Frozen reform repair/);
});
