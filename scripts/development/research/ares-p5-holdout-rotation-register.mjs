import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBINED_CASES,searchHoldoutRotationSeeds} from './ares-p5-holdout-combined-seeds.mjs';
export function registerRotation(morphology){
 const cases=COMBINED_CASES.filter(id=>id.startsWith('h:'+morphology+'-'));assert.ok(cases.length);
 for(const id of cases)test('Rotation-aware holdout '+id,async()=>{
  const r=await searchHoldoutRotationSeeds(id);console.log('ARES_HOLDOUT_ROTATION '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');
  assert.ok(r.attempts<=48&&r.stats.work<=8000000&&r.stats.expansions<=32768);
  assert.ok(['split-seeds-found','no-split-seed','structural-held','work-limit'].includes(r.category));
  if(r.rotationCover)assert.ok(r.rotationCover.groups.every(g=>g.length>0&&g.length<=4));
  if(r.category==='structural-held')assert.equal(r.attempts,0);
  for(const seed of r.seeds){assert.ok(seed.neighbors.length>=1&&seed.neighbors.length<=4);assert.ok(seed.pairs.length&&seed.pairs.every(p=>p.code==='unnormalized-crossing'));}
 });
}
