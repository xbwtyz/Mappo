import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBINED_CASES,REFORM_ARMS,searchHoldoutNumericalReform} from './ares-p5-holdout-combined-seeds.mjs';
export function registerReform(arm,part){
 const profile=REFORM_ARMS.find(x=>x.id===arm);assert.ok(profile);
 const cases=COMBINED_CASES.filter((_,i)=>i%2===part);
 for(const id of cases)test('Numerical reform '+arm+' '+id,async()=>{
  const r=await searchHoldoutNumericalReform(id,arm);
  console.log('ARES_HOLDOUT_REFORM '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.deepEqual(r.profile,profile);
  assert.ok(r.attempts<=48&&r.stats.work<=8000000&&r.stats.expansions<=32768);
  assert.ok(['split-seeds-found','geometry-seeds-found','no-split-seed','structural-held','work-limit'].includes(r.category));
  for(const g of r.triedGroups??[])assert.ok(g.length<=profile.cap);
  for(const seed of [...r.seeds,...r.geometrySeeds]){
   assert.ok(seed.neighbors.length>=1&&seed.neighbors.length<=profile.cap);
   assert.ok(seed.neighbors.every(n=>Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)<=Math.hypot(r.offset.x,r.offset.y)*profile.multiplier));
  }
 });
}
