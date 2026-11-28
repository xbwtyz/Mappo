import test from 'node:test';
import assert from 'node:assert/strict';
import {REFORM_REPAIR_CASES,searchHoldoutReformRepair} from './ares-p5-holdout-combined-seeds.mjs';
export function registerReformRepair(morphology){
 for(const id of REFORM_REPAIR_CASES.filter(x=>x.startsWith('h:'+morphology+'-')))test('Expanded coupled contact repair '+id,async()=>{
  const r=await searchHoldoutReformRepair(id);console.log('ARES_HOLDOUT_REFORM_REPAIR '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.equal(r.caseId,id);assert.equal(r.profile.cap,8);assert.equal(r.profile.multiplier,1);
  assert.ok(r.attempts<=48&&(r.localProbes??0)<=192&&r.attempts+(r.localProbes??0)<=256&&r.stats.work<=8000000&&r.stats.expansions<=32768);
  for(const seed of [...r.seeds,...r.geometrySeeds])assert.ok(seed.neighbors.length>=1&&seed.neighbors.length<=8&&seed.neighbors.every(n=>Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)<=Math.hypot(r.offset.x,r.offset.y)));
  assert.ok(['split-seeds-found','geometry-seeds-found','no-split-seed','work-limit'].includes(r.category));
 });
}
