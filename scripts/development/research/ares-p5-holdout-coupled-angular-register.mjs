import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_ANGULAR_CASES,searchHoldoutCoupledAngular} from './ares-p5-holdout-combined-seeds.mjs';
export function registerCoupledAngular(morphology){
 const cases=LOCAL_ANGULAR_CASES.filter(id=>id.startsWith('h:'+morphology+'-'));assert.ok(cases.length);
 for(const id of cases)test('Coupled angular '+id,async()=>{
  const r=await searchHoldoutCoupledAngular(id);console.log('ARES_HOLDOUT_COUPLED_ANGULAR '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.equal(r.strategy,'coupled-angular');
  assert.ok(r.attempts<=48&&r.localProbes<=192&&r.attempts+r.localProbes<=256&&r.stats.work<=8000000&&r.stats.expansions<=32768);
  assert.equal(r.localProbes,r.coupled.firstProbes+r.coupled.secondProbes);
  assert.ok(r.coupled.firstProbes<=96&&r.coupled.secondProbes>0&&r.coupled.pairCandidates>=0);
  assert.ok(['split-seeds-found','geometry-seeds-found','no-split-seed'].includes(r.category));
  for(const seed of [...r.seeds,...r.geometrySeeds])assert.ok(seed.neighbors.length>=1&&seed.neighbors.length<=4);
 });
}
