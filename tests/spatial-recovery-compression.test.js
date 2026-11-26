import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { iterateRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { verifyLareGroupPreservation } from '../src/core/reconciliation-preservation.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { scoreSpatialPreservation, preferVerifiedSpatialPreservation } from '../src/core/spatial-recovery-score.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { normalizeSpatialRoadGroup, searchSpatialPackingRoadGroup, verifySpatialStrictRoadWitness } from '../src/core/spatial-recovery-road-adapter.js';
import { LareBudgetExceeded } from '../src/core/reconciliation-budget.js';
import { createSpatialDelta } from '../src/core/spatial-recovery-delta.js';
import { createSpatialInventory } from '../src/core/spatial-recovery-contract.js';
import { copyJson } from '../src/data/project-format.js';
import { createHash } from 'node:crypto';
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
