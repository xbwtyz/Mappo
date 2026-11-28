import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBINED_CASES,searchHoldoutCombinedSeeds} from './ares-p5-holdout-combined-seeds.mjs';
export function registerCombinedSeeds(morphology){
 const ids=COMBINED_CASES.filter(id=>id.startsWith('h:'+morphology+'-'));assert.ok(ids.length);
 for(const id of ids)test('Combined seed '+id,async()=>{
  const r=await searchHoldoutCombinedSeeds(id);console.log('ARES_HOLDOUT_COMBINED_SEEDS '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.ok(r.attempts<=256&&r.stats.work<=8000000&&r.stats.expansions<=32768);
  assert.ok(['split-seeds-found','no-split-seed','work-limit'].includes(r.category));
  for(const s of r.seeds){assert.ok(s.neighbors.length>=1&&s.neighbors.length<=4&&s.pairs.length);assert.ok(s.pairs.every(p=>p.code==='unnormalized-crossing'));}
 });
}
