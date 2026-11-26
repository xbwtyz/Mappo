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


// Actual end-to-end shared-budget progressive qualification. Record gaps;
// independent oracle work below cannot contribute to the search budget.
for(const irregularProperties of [false,true])test('SRE unified nondestructive progressive compression '+(irregularProperties?'irregular':'regular'),{timeout:600000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project),summary={cases:0,verified:0,knownRetained:0,refused:0,exhausted:0};
  for(const scale of scales){
    const op=normalizeSpatialRoadGroup(project,1,roadIds,{x:offset0.x*scale,y:offset0.y*scale},
      {alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
    const budget=createSpatialPreservationBudget();
    const result=await searchSpatialNondestructiveRoadGroup(project,op,budget);
    const stats=budget.snapshot();assert.ok(stats.work<=8000000&&stats.expansions<=32768);
    summary.cases++;let metrics=null;
    if(result.status==='verified-witness'){
      const candidate=await verifySpatialConcessionRoadWitness(project,op,result.delta,createSpatialPreservationBudget());
      validateStoredProject(candidate);
      assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
      for(const key of ['properties','plots','buildings'])assert.deepEqual(candidate.city[key].map(r=>r.id),project.city[key].map(r=>r.id));
      const ledger=inspectSpatialConcessionLedger(project,op,candidate,createSpatialPreservationBudget());
      assert.deepEqual(ledger,result.ledger);assert.equal(Object.hasOwn(result,'candidateProject'),false);
      if(result.tier==='ordinary'||result.tier==='packing'){
        assert.equal(ledger.frontageSwitches.length+ledger.scaledBuildings.length,0);
        assert.deepEqual(result.cost,scoreSpatialPreservation(project,candidate,createSpatialPreservationBudget()));
      }
      if(result.tier==='alternative-frontage')assert.equal(ledger.scaledBuildings.length,0);
      metrics={switches:ledger.frontageSwitches.length,scaled:ledger.scaledBuildings.length,loss:ledger.footprintLoss,
        cost:result.cost,fingerprint:hash(candidate)};
      summary.verified++;if([.025,.125,-.25,.25,.5].includes(scale))summary.knownRetained++;
    }else{
      assert.equal(result.status,'refused');assert.equal(result.delta,null);
      summary.refused++;summary.exhausted+=Number(Boolean(result.exhausted));
    }
    if(scale===.025)assert.equal(result.status,'verified-witness','ordinary baseline lost in unified path');
    assert.equal(hash(project),before);
    console.log('SRE_UNIFIED_CASE '+JSON.stringify({irregularProperties,scale,status:result.status,tier:result.tier,
      phase:result.phase,attempts:result.attempts,stats,issues:result.issues,metrics}));
  }
  console.log('SRE_UNIFIED_SUMMARY '+JSON.stringify({irregularProperties,...summary}));
});
