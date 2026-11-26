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


// Same ordinary-first schedule, same parent budget. Only reuse a completed
// fixed refusal from this very operation, not a guessed or capped result.
test('SRE packing fallback fixed-refusal reuse qualification',{timeout:600000},async()=>{
  let compression=0,historicalRetained=0;
  for(const irregularProperties of [false,true]){
    const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    const before=hash(project);
    for(const scale of [.025,.125,-.25,.75]){
      const op=normalizeSpatialRoadGroup(project,1,roadIds,{x:offset0.x*scale,y:offset0.y*scale});
      const actual=await qualifyCoordinator(project,op,searchSpatialPackingRoadGroupReuseFixed);
      if(scale!==.75)compression+=Number(actual.status==='verified-witness');
      if(scale===.025)assert.equal(actual.status,'verified-witness','ordinary strict baseline lost');
      assert.equal(hash(project),before);
      console.log('SRE_FIXED_REUSE_CASE '+JSON.stringify({irregularProperties,scale,actual}));
    }
  }
  const projects=new Map();
  for(const row of historical.cases){
    if(!projects.has(row.projectId))projects.set(row.projectId,createProject(historical.projects[row.projectId]));
    const project=projects.get(row.projectId),before=hash(project);
    const op=normalizeSpatialRoadGroup(project,1,row.roadIds,row.offset);
    const ordinary=await qualifyCoordinator(project,op,searchSpatialPreservingRoadGroup);
    const actual=await qualifyCoordinator(project,op,searchSpatialPackingRoadGroupReuseFixed);
    if(ordinary.status==='verified-witness'){
      assert.equal(actual.status,'verified-witness');assert.equal(actual.fingerprint,ordinary.fingerprint);
      assert.deepEqual(actual.cost,ordinary.cost);historicalRetained++;
    }
    assert.equal(hash(project),before);
  }
  assert.equal(historicalRetained,historical.cases.length);
  console.log('SRE_FIXED_REUSE_SUMMARY '+JSON.stringify({compression,historicalRetained}));
});
