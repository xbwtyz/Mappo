import test from 'node:test';
import assert from 'node:assert/strict';
import {searchHoldoutCoupledAngular,LOCAL_ANGULAR_CASES} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
test('Coupled angular entrypoint has only the five frozen four-neighbor cases',async()=>{
 assert.equal(LOCAL_ANGULAR_CASES.length,5);
 await assert.rejects(()=>searchHoldoutCoupledAngular('h:radial-12'),/Frozen local angular/);
});
