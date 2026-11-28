import test from 'node:test';
import assert from 'node:assert/strict';
import {searchHoldoutMultiContact} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
test('Frozen five-contact radial repair preserves both protected anchors',async()=>{
 const r=await searchHoldoutMultiContact('h:radial-12');
 console.log('ARES_HOLDOUT_MULTI_CONTACT '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.equal(r.profile.cap,8);assert.equal(r.profile.multiplier,1);
 assert.ok(r.attempts<=48&&(r.localProbes??0)<=192&&r.stats.work<=8000000&&r.stats.expansions<=32768);
 assert.ok(['split-seeds-found','geometry-seeds-found','no-split-seed','work-limit'].includes(r.category));
 if(r.multi){assert.equal(r.multi.blockingPairs.length,5);assert.ok(r.multi.minRemainingRotationClear<=5);}
 for(const seed of [...r.seeds,...r.geometrySeeds])assert.ok(seed.neighbors.length===7&&seed.neighbors.every(n=>!['N-0108','N-0109'].includes(n.id)&&Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)<=Math.hypot(r.offset.x,r.offset.y)));
 await assert.rejects(()=>searchHoldoutMultiContact('h:radial-16'),/Frozen multi-contact/);
});
