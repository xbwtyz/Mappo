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

test('SRE unified no-concession route retains exact historical ordinary fingerprints',{timeout:600000},async()=>{
  const projects=new Map();let retained=0;
  for(const row of historical.cases){
    if(!projects.has(row.projectId))projects.set(row.projectId,createProject(historical.projects[row.projectId]));
    const project=projects.get(row.projectId),before=hash(project);
    const op=normalizeSpatialRoadGroup(project,1,row.roadIds,row.offset);
    const ordinary=await qualifyCoordinator(project,op,searchSpatialPreservingRoadGroup);
    const actual=await qualifyCoordinator(project,op,searchSpatialNondestructiveRoadGroup);
    if(ordinary.status==='verified-witness'){
      assert.equal(actual.status,'verified-witness');assert.equal(actual.fingerprint,ordinary.fingerprint);
      assert.deepEqual(actual.cost,ordinary.cost);retained++;
    }
    assert.equal(hash(project),before);
  }
  assert.equal(retained,historical.cases.length);
  console.log('SRE_UNIFIED_HISTORICAL '+JSON.stringify({retained}));
});
