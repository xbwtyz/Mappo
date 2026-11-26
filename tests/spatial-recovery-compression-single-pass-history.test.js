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

test('SRE candidate single-pass transport historical preservation comparison',{timeout:300000},async()=>{
  const projects=new Map(),summary={cases:0,ordinaryVerified:0,candidateVerified:0,lost:0,worseCost:0,improvedCost:0,newRecoveries:0,strictFirstVerified:0,strictFirstLost:0,strictFirstWorse:0};
  for(const row of historical.cases){
    if(!projects.has(row.projectId))projects.set(row.projectId,createProject(historical.projects[row.projectId]));
    const project=projects.get(row.projectId),before=hash(project);
    const op=normalizeSpatialRoadGroup(project,1,row.roadIds,row.offset);
    const ordinary=await qualifyCoordinator(project,op,searchSpatialPreservingRoadGroup);
    const candidate=await qualifyCoordinator(project,op,searchSpatialPackingRoadGroupSinglePass);
    const strictFirst=await qualifyCoordinator(project,op,searchSpatialPackingRoadGroupStrictFirst);
    const a=ordinary.status==='verified-witness',b=candidate.status==='verified-witness',c=strictFirst.status==='verified-witness';
    const strictCmp=a&&c?compareSpatialPreservationCost(strictFirst.cost,ordinary.cost):null;
    summary.strictFirstVerified+=Number(c);summary.strictFirstLost+=Number(a&&!c);summary.strictFirstWorse+=Number(strictCmp===1);
    if(a){assert.ok(c,'ordinary witness lost by strict-first fallback');assert.equal(strictFirst.fingerprint,ordinary.fingerprint,'ordinary witness changed by strict-first fallback');}
    const cmp=a&&b?compareSpatialPreservationCost(candidate.cost,ordinary.cost):null;
    summary.cases++;summary.ordinaryVerified+=Number(a);summary.candidateVerified+=Number(b);
    summary.lost+=Number(a&&!b);summary.worseCost+=Number(cmp===1);summary.improvedCost+=Number(cmp===-1);summary.newRecoveries+=Number(!a&&b);
    assert.equal(hash(project),before);
    console.log('SRE_SINGLE_PASS_HISTORICAL '+JSON.stringify({projectId:row.projectId,roadIds:row.roadIds,offset:row.offset,ordinary,candidate,cmp,strictFirst,strictCmp}));
  }
  console.log('SRE_SINGLE_PASS_HISTORICAL_SUMMARY '+JSON.stringify(summary));
  // Candidate-only qualification: report gaps rather than silently replacing
  // the existing coordinator. Activation requires zero lost/worse witnesses.
  assert.equal(summary.cases,historical.cases.length);
  assert.ok(summary.ordinaryVerified>0,'historical comparison did not exercise baseline');
});
