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

for(const irregularProperties of [false,true])test('SRE cooperative compression diagnostic '+(irregularProperties?'irregular':'regular'),{timeout:300000},()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  validateStoredProject(project);
  const before=hash(project),summary={cases:0,baseline:0,packing:0,retained:0,newRecoveries:0,blockSearchCases:0};
  for(const scale of scales){
    const offset={x:offset0.x*scale,y:offset0.y*scale};
    const baseline=run(project,offset,false),packing=run(project,offset,true);
    const selected=preferVerifiedSpatialPreservation(baseline.witness,packing.witness);
    summary.cases++;summary.baseline+=Number(Boolean(baseline.witness));summary.packing+=Number(Boolean(packing.witness));
    summary.retained+=Number(Boolean(selected));summary.newRecoveries+=Number(!baseline.witness&&Boolean(packing.witness));
    summary.blockSearchCases+=Number(Boolean(packing.stages['block-result']||packing.stages['bundle-building']));
    if(baseline.witness)assert.ok(selected);
    if(scale===.025)assert.ok(baseline.witness,'known strict baseline lost');
    if([.125,.025,-.25].includes(scale))assert.ok(selected,'qualified packing witness lost');
    assert.equal(hash(project),before);
    console.log('SRE_PACKING_CASE '+JSON.stringify({irregularProperties,scale,baseline,packing,selected}));
  }
  assert.ok(summary.blockSearchCases,'cooperative packing path was not exercised');
  console.log('SRE_PACKING_SUMMARY '+JSON.stringify({irregularProperties,...summary}));
});

 // Qualify the actual transport coordinator separately from the raw solver.
 // The same shared parent budget must cover both strategies, reconstruction,
 // independent verification and scoring. Refusal is measured, not hidden by
 // silently retrying with a fresh search budget. Fresh budget below is solely
 // the independent test oracle and cannot influence search.
for(const irregularProperties of [false,true])test('SRE shared-budget packing transport '+(irregularProperties?'irregular':'regular'),{timeout:300000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project),summary={cases:0,verified:0,refused:0,exhausted:0,knownRawWitnesses:0,rawWitnessesRetained:0};
  for(const scale of [.125,.025,-.25,.75]){
    const offset={x:offset0.x*scale,y:offset0.y*scale};
    const operation=normalizeSpatialRoadGroup(project,1,roadIds,offset);
    const budget=createSpatialPreservationBudget(),initial=budget.snapshot();
    const knownRaw=[.125,.025,-.25].includes(scale);
    summary.cases++;summary.knownRawWitnesses+=Number(knownRaw);
    let result=null,exhausted=null;
    try{result=await searchSpatialPackingRoadGroup(project,operation,budget);}
    catch(error){if(!(error instanceof LareBudgetExceeded))throw error;exhausted=error.resource;}
    const stats=budget.snapshot();
    assert.ok(stats.work<=initial.remainingWork&&stats.expansions<=initial.remainingExpansions);
    if(result?.status==='verified-witness'){
      const candidate=await verifySpatialStrictRoadWitness(project,operation,result.delta,createSpatialPreservationBudget());
      validateStoredProject(candidate);
      assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
      assert.deepEqual(scoreSpatialPreservation(project,candidate,createSpatialPreservationBudget()),result.cost);
      assert.equal(Object.hasOwn(result,'candidateProject'),false);
      summary.verified++;summary.rawWitnessesRetained+=Number(knownRaw);
    }else if(exhausted)summary.exhausted++;
    else{assert.equal(result?.status,'refused');assert.equal(result.delta,null);summary.refused++;}
    if(scale===.025)assert.equal(result?.status,'verified-witness','known strict baseline lost in SRE transport');
    assert.equal(hash(project),before);
    console.log('SRE_TRANSPORT_CASE '+JSON.stringify({irregularProperties,scale,knownRaw,status:result?.status??'exhausted',exhausted,stats,issues:result?.issues??[],cost:result?.cost??null}));
  }
  console.log('SRE_TRANSPORT_SUMMARY '+JSON.stringify({irregularProperties,...summary}));
});

for(const irregularProperties of [false,true])test('SRE single-pass scheduling diagnostic '+(irregularProperties?'irregular':'regular'),{timeout:300000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project),summary={progressive:0,enhanced:0,knownRaw:0};
  for(const scale of [.025,.125,-.25,.75]){
    const offset={x:offset0.x*scale,y:offset0.y*scale},knownRaw=scale!==.75;
    const progressive=await runPackingSchedule(project,offset,'progressive');
    const enhanced=await runPackingSchedule(project,offset,'enhanced-adaptive');
    for(const row of [progressive,enhanced]){
      assert.ok(row.stats.work<=8000000&&row.stats.expansions<=32768);
      if(scale===.025)assert.equal(row.status,'verified-witness','known strict baseline lost');
    }
    if(knownRaw){
      summary.knownRaw++;
      summary.progressive+=Number(progressive.status==='verified-witness');
      summary.enhanced+=Number(enhanced.status==='verified-witness');
    }
    assert.equal(hash(project),before);
    console.log('SRE_SCHEDULE_CASE '+JSON.stringify({irregularProperties,scale,knownRaw,progressive,enhanced}));
  }
  console.log('SRE_SCHEDULE_SUMMARY '+JSON.stringify({irregularProperties,...summary}));
});

for(const irregularProperties of [false,true])test('SRE candidate single-pass transport retains all known compression witnesses '+(irregularProperties?'irregular':'regular'),{timeout:300000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project);
  for(const scale of [.025,.125,-.25]){
    const op=normalizeSpatialRoadGroup(project,1,roadIds,{x:offset0.x*scale,y:offset0.y*scale});
    const actual=await qualifyCoordinator(project,op,searchSpatialPackingRoadGroupSinglePass);
    const strictFirst=await qualifyCoordinator(project,op,searchSpatialPackingRoadGroupStrictFirst);
    console.log('SRE_STRICT_FIRST_CASE '+JSON.stringify({irregularProperties,scale,strictFirst}));
    if(scale===.025)assert.equal(strictFirst.status,'verified-witness','ordinary strict baseline lost');
    console.log('SRE_SINGLE_PASS_CASE '+JSON.stringify({irregularProperties,scale,actual}));
    assert.equal(actual.status,'verified-witness','known compression recovery lost');
    assert.equal(hash(project),before);
  }
});
