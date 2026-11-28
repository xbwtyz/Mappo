import test from 'node:test';
import assert from 'node:assert/strict';
import {searchHoldoutPrecisionContact} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
test('Precision radial contact repair, protected anchor stationary',async()=>{
 const r=await searchHoldoutPrecisionContact('h:radial-16');console.log('ARES_HOLDOUT_PRECISION_CONTACT '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.equal(r.profile.cap,8);assert.equal(r.profile.multiplier,1);assert.ok(r.attempts<=48&&(r.localProbes??0)<=192&&r.stats.work<=8000000&&r.stats.expansions<=32768);
 for(const s of [...r.seeds,...r.geometrySeeds])assert.ok(s.neighbors.length<=8&&s.neighbors.every(n=>n.id!=='N-0089'));
 await assert.rejects(()=>searchHoldoutPrecisionContact('h:radial-12'),/Frozen precision/);
});
