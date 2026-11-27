import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { iterateRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { verifyLareGroupPreservation } from '../src/core/reconciliation-preservation.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { scoreSpatialPreservation, preferVerifiedSpatialPreservation, compareSpatialPreservationCost, scoreSpatialConcessions, compareSpatialConcessionCost } from '../src/core/spatial-recovery-score.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { normalizeSpatialRoadGroup, searchSpatialPackingRoadGroup, searchSpatialPackingRoadGroupSinglePass, searchSpatialPackingRoadGroupStrictFirst, searchSpatialPackingRoadGroupReuseFixed, searchSpatialNondestructiveRoadGroup, searchSpatialPreservingRoadGroup, verifySpatialStrictRoadWitness, verifySpatialConcessionRoadWitness } from '../src/core/spatial-recovery-road-adapter.js';
import { LareBudgetExceeded } from '../src/core/reconciliation-budget.js';
import { inspectSpatialConcessionLedger } from '../src/core/spatial-recovery-concessions.js';
import { createSpatialDelta } from '../src/core/spatial-recovery-delta.js';
import { createSpatialInventory } from '../src/core/spatial-recovery-contract.js';
import { copyJson } from '../src/data/project-format.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { roadIds, offset0, scales, hash, run, runPackingSchedule, qualifyCoordinator, historical } from './spatial-recovery-compression-support.js';


// Compare the opt-in inventory reuse path against previously qualified
// ordinary/packing fingerprints and all 18 shared-budget cases.
for(const irregularProperties of [false,true])test('SRE unified operation-local packing inventory reuse '+(irregularProperties?'irregular':'regular'),{timeout:600000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project),summary={cases:0,verified:0,knownRetained:0,cacheHits:0};
  const rankedSummary={cases:0,verified:0,retained:0,lost:0,added:0,better:0,equal:0,worse:0,rankedInventories:0};
  // Exact already-qualified concessions must survive transport optimization.
  const establishedConcessions=irregularProperties?{}:{
    .25:'704fbb3ae8a6d05d96f8ed6f85ca9b59da6fc14a1299dd22c248285c5227ba07',
    .5:'29be178022ec22688c465c5f9bb77451c29a697b3a5ef05088f9e9d6ce991581',
    .75:'ab0c1ca2cbfa6261e9ad606c53a35e7a96a74f53b03f5bad97f09b17e2d63ba6'
  };
  for(const scale of scales){
    const op=normalizeSpatialRoadGroup(project,1,roadIds,{x:offset0.x*scale,y:offset0.y*scale},
      {alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
    const budget=createSpatialPreservationBudget();
    const result=await searchSpatialNondestructiveRoadGroup(project,op,budget,{reusePackingInventory:true});
    const stats=budget.snapshot();assert.ok(stats.work<=8000000&&stats.expansions<=32768);
    const hits={parcel:result.stages?.['sre-packing-parcel-cache-hit']??0,building:result.stages?.['sre-packing-building-cache-hit']??0};
    summary.cases++;summary.cacheHits+=hits.parcel+hits.building;
    // The trace must describe a prefix of the actual independent verification
    // pipeline, with nondecreasing cumulative work bounded by the operation.
    const stages=['delta','context','reconstruction','preservation','dependencies','infrastructure','storedProject','complete'];
    const trace=result.verificationWork;
    assert.ok(trace&&typeof trace==='object');
    const keys=Object.keys(trace);
    assert.deepEqual(keys,stages.slice(0,keys.length));
    let prior=0;
    for(const key of keys){
      assert.ok(Number.isFinite(trace[key])&&trace[key]>=prior&&trace[key]<=stats.work);
      prior=trace[key];
    }
    if(result.status==='verified-witness')assert.deepEqual(keys,stages);
    let metrics=null,baselineRank=null;
    if(result.status==='verified-witness'){
      const candidate=await verifySpatialConcessionRoadWitness(project,op,result.delta,createSpatialPreservationBudget());
      baselineRank=scoreSpatialConcessions(project,op,candidate,createSpatialPreservationBudget());
      validateStoredProject(candidate);
      assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
      for(const key of ['properties','plots','buildings'])assert.deepEqual(candidate.city[key].map(r=>r.id),project.city[key].map(r=>r.id));
      const ledger=inspectSpatialConcessionLedger(project,op,candidate,createSpatialPreservationBudget());
      assert.deepEqual(ledger,result.ledger);
      if([.025,.125,-.25].includes(scale)){
        const strict=normalizeSpatialRoadGroup(project,1,roadIds,op.geometry.offset);
        const reference=await qualifyCoordinator(project,strict,searchSpatialPackingRoadGroupReuseFixed);
        assert.equal(reference.status,'verified-witness');assert.equal(hash(candidate),reference.fingerprint);
        assert.deepEqual(result.cost,reference.cost);
      }
      metrics={switches:ledger.frontageSwitches.length,scaled:ledger.scaledBuildings.length,loss:ledger.footprintLoss,fingerprint:hash(candidate)};
      summary.verified++;summary.knownRetained+=Number([.025,.125,-.25,.25,.5].includes(scale));
    }else{assert.equal(result.status,'refused');assert.equal(result.delta,null);}
    if([.025,.125,-.25].includes(scale))assert.equal(result.status,'verified-witness','established strict/packing witness lost');
    if(Object.hasOwn(establishedConcessions,scale)){
      assert.equal(result.status,'verified-witness','established frontage witness lost');
      assert.equal(metrics.fingerprint,establishedConcessions[scale]);
      assert.equal(metrics.scaled,0);assert.equal(metrics.loss,0);
    }
    // Exact-head qualification added a tenth witness at the smallest
    // authorized scaling tier. Keep it and its measured concession cost
    // until a separately qualified ranking improvement replaces it.
    if(!irregularProperties&&scale===1){
      assert.equal(result.status,'verified-witness','tenth unified witness lost');
      assert.equal(result.tier,'uniform-scale-5');
      assert.equal(metrics.fingerprint,'e2a1f659b2b386a8f2c6a828a4ad7a2f75551b3eea376e5297d0f19b9576e974');
      assert.equal(metrics.switches,26);
      assert.equal(metrics.scaled,30);
      assert.ok(result.ledger.scaledBuildings.every(row=>row.factor>=.95-1e-6));
      assert.ok(Math.abs(metrics.loss-550.8781205476942)<1e-6);
    }
    assert.equal(hash(project),before);
    console.log('SRE_INVENTORY_REUSE_CASE '+JSON.stringify({irregularProperties,scale,status:result.status,tier:result.tier,phase:result.phase,attempts:result.attempts,stats,hits,metrics,verificationWork:result.verificationWork}));
    // Separate qualification trial with the same hard limits, not an in-
    // operation retry. Never combine witnesses or claim a shared-budget win.
    const rankedBudget=createSpatialPreservationBudget();
    const ranked=await searchSpatialNondestructiveRoadGroup(project,op,rankedBudget,
      {reusePackingInventory:true,rankConcessionProposals:'within-frontage'});
    const rankedStats=rankedBudget.snapshot();
    assert.ok(rankedStats.work<=8000000&&rankedStats.expansions<=32768);
    rankedSummary.cases++;
    assert.equal(ranked.stages?.['sre-concession-ranked-proposals']??0,0,'cross-frontage ranking must not run');
    rankedSummary.rankedInventories+=ranked.stages?.['sre-concession-within-frontage-ranked']??0;
    let rankedCost=null,fingerprint=null,comparison=null;
    if(ranked.status==='verified-witness'){
      const candidate=await verifySpatialConcessionRoadWitness(project,op,ranked.delta,createSpatialPreservationBudget());
      validateStoredProject(candidate);
      assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
      for(const key of ['properties','plots','buildings'])
        assert.deepEqual(candidate.city[key].map(r=>r.id),project.city[key].map(r=>r.id));
      assert.deepEqual(inspectSpatialConcessionLedger(project,op,candidate,createSpatialPreservationBudget()),ranked.ledger);
      fingerprint=hash(candidate);
      rankedCost=scoreSpatialConcessions(project,op,candidate,createSpatialPreservationBudget());
      rankedSummary.verified++;
      if(baselineRank){
        rankedSummary.retained++;
        comparison=compareSpatialConcessionCost(rankedCost,baselineRank);
        rankedSummary[comparison<0?'better':comparison>0?'worse':'equal']++;
      }else rankedSummary.added++;
    }else{
      assert.equal(ranked.status,'refused');assert.equal(ranked.delta,null);
      if(baselineRank)rankedSummary.lost++;
    }
    // Ordinary/packing successes never reach the new proposal ordering.
    if([.025,.125,-.25].includes(scale)){
      assert.equal(ranked.status,'verified-witness');
      assert.equal(fingerprint,metrics.fingerprint);
      assert.deepEqual(ranked.cost,result.cost);
      assert.equal(comparison,0);
    }
    assert.equal(hash(project),before);
    console.log('SRE_WITHIN_FRONTAGE_CASE '+JSON.stringify({irregularProperties,scale,
      baseline:{status:result.status,tier:result.tier,cost:baselineRank,fingerprint:metrics?.fingerprint??null,work:stats.work},
      ranked:{status:ranked.status,tier:ranked.tier,phase:ranked.phase,cost:rankedCost,fingerprint,stats:rankedStats},
      comparison,rankedInventories:ranked.stages?.['sre-concession-within-frontage-ranked']??0}));
  }
  assert.equal(rankedSummary.cases,scales.length);
  assert.ok(rankedSummary.rankedInventories>0);
  assert.equal(rankedSummary.verified,rankedSummary.retained+rankedSummary.added);
  assert.equal(rankedSummary.retained,rankedSummary.better+rankedSummary.equal+rankedSummary.worse);
  console.log('SRE_WITHIN_FRONTAGE_SUMMARY '+JSON.stringify({irregularProperties,...rankedSummary}));
  assert.ok(summary.cacheHits>0,'operation-local cache must be exercised');
  assert.ok(summary.verified>=(irregularProperties?3:7),'qualified unified nondestructive recovery floor regressed');
  console.log('SRE_INVENTORY_REUSE_SUMMARY '+JSON.stringify({irregularProperties,...summary}));
});
