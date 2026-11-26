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
const roadIds=['RD-0184','RD-0186'];
const offset0={x:-3.005274072121821,y:-37.39896113564458};
const scales=[1,.75,.5,.25,.125,.025,-.25,-.5,-1];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function run(project,offset,packing){
  const stages={},blocks=[],inventories=[],iterator=iterateRoadGroupReflowB1(project,roadIds,offset,packing?{strategy:'enhanced-adaptive',packing:true}:{});
  let step;
  try{
    while(!(step=iterator.next()).done){
      const name=step.value?.stage??'other';
      stages[name]=(stages[name]??0)+1;
      if(name==='block-result')blocks.push(step.value);
      if(name==='packing-inventory')inventories.push(step.value);
    }
  }finally{iterator.return();}
  const result=step.value,candidate=result.candidateProject;
  if(!candidate)return {witness:null,stages,blocks,inventories:inventories.reduce((a,r)=>({proposals:a.proposals+r.proposals,accepted:a.accepted+r.accepted,retained:a.retained+r.retained}),{proposals:0,accepted:0,retained:0}),issues:result.unresolved.map(i=>i.code),lastRejected:result.lare?.lastRejectedCandidate??null};
  validateStoredProject(candidate);
  const draft=prepareRoadGroupIntentB1(project,roadIds,offset),budget=createSpatialPreservationBudget();
  assert.equal(verifyLareGroupPreservation(project,candidate,draft,new Map(),budget),null);
  for(const key of ['properties','plots','buildings'])
    assert.deepEqual(candidate.city[key].map(r=>r.id),project.city[key].map(r=>r.id));
  assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
  return {witness:{cost:scoreSpatialPreservation(project,candidate,budget),fingerprint:hash(candidate)},stages,issues:[]};
}

// Scheduling comparison only. Both variants use the identical 8M/32768
// operation budget, accepted snapshot, independent witness gate and scoring.
// Do not use results as production authority or silently change strategy order.
async function runPackingSchedule(project,offset,strategy){
  const operation=normalizeSpatialRoadGroup(project,1,roadIds,offset);
  const budget=createSpatialPreservationBudget(),stages={};
  let phase='inventory',iterator=null;
  try{
    createSpatialInventory(project,operation,budget);
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    phase='search';
    iterator=iterateRoadGroupReflowB1(snapshot,roadIds,offset,{
      acceptedRevision:operation.revision,sharedBudget:budget,packing:true,strategy});
    let result;
    for(;;){
      budget.spend();
      const step=iterator.next();
      if(step.done){result=step.value;break;}
      const stage=step.value?.strategy??step.value?.stage??'other';
      stages[stage]=(stages[stage]??0)+1;
    }
    iterator.return();iterator=null;
    if(!result?.candidateProject)return {status:'refused',phase,stages,stats:budget.snapshot(),issues:(result?.unresolved??[]).map(i=>i.code)};
    phase='delta';
    const delta=await createSpatialDelta(snapshot,result.candidateProject,operation,1,budget);
    phase='verification';
    const candidate=await verifySpatialStrictRoadWitness(snapshot,operation,delta,budget);
    phase='score';
    const cost=scoreSpatialPreservation(snapshot,candidate,budget);
    validateStoredProject(candidate);
    assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
    return {status:'verified-witness',phase,stages,stats:budget.snapshot(),cost,fingerprint:hash(candidate)};
  }catch(error){
    if(!(error instanceof LareBudgetExceeded))throw error;
    return {status:'exhausted',phase,resource:error.resource,stages,stats:budget.snapshot()};
  }finally{iterator?.return();}
}
async function qualifyCoordinator(project,op,search){
  const budget=createSpatialPreservationBudget();
  let result;
  try{result=await search(project,op,budget);}
  catch(error){if(!(error instanceof LareBudgetExceeded))throw error;return {status:'exhausted',resource:error.resource,stats:budget.snapshot()};}
  const stats=budget.snapshot();
  assert.ok(stats.work<=8000000&&stats.expansions<=32768);
  if(result.status!=='verified-witness')return {status:result.status,stats,issues:result.issues};
  const candidate=await verifySpatialStrictRoadWitness(project,op,result.delta,createSpatialPreservationBudget());
  validateStoredProject(candidate);
  assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
  assert.deepEqual(scoreSpatialPreservation(project,candidate,createSpatialPreservationBudget()),result.cost);
  return {status:result.status,cost:result.cost,fingerprint:hash(candidate),stats};
}
const historical=JSON.parse(readFileSync(new URL('./fixtures/lare-preservation-research.json',import.meta.url)));

export { roadIds, offset0, scales, hash, run, runPackingSchedule, qualifyCoordinator, historical };
