import test from 'node:test';
import assert from 'node:assert/strict';
import {searchHoldoutAdaptiveContact} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
test('Adaptive residual contact inventory remains bounded and protects both anchors',async()=>{
 const r=await searchHoldoutAdaptiveContact('h:radial-12');console.log('ARES_HOLDOUT_ADAPTIVE_CONTACT '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.equal(r.profile.cap,8);assert.equal(r.profile.multiplier,1);
 assert.ok(r.attempts<=48&&(r.localProbes??0)<=192&&r.stats.work<=8000000&&r.stats.expansions<=32768);
 assert.ok(['split-seeds-found','geometry-seeds-found','no-split-seed','work-limit'].includes(r.category));
 if(r.category!=='work-limit'){assert.equal(r.adaptive.controlPairs.length,2);assert.ok(r.adaptive.rounds.length<=4);assert.equal(r.adaptive.rounds.reduce((n,x)=>n+x.probes,0),r.localProbes);}
 for(const seed of [...r.seeds,...r.geometrySeeds])assert.ok(seed.neighbors.length===7&&seed.neighbors.every(n=>!['N-0108','N-0109'].includes(n.id)&&Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)<=Math.hypot(r.offset.x,r.offset.y)));
 await assert.rejects(()=>searchHoldoutAdaptiveContact('h:radial-16'),/Frozen adaptive contact/);
});
