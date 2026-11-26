import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { iterateRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { verifyLareGroupPreservation } from '../src/core/reconciliation-preservation.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { scoreSpatialPreservation, preferVerifiedSpatialPreservation, compareSpatialPreservationCost } from '../src/core/spatial-recovery-score.js';
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
const historical=JSON.parse(readFileSync(new URL('./fixtures/lare-preservation-research.json',import.meta.url)));
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

// Compare the opt-in inventory reuse path against previously qualified
// ordinary/packing fingerprints and all 18 shared-budget cases.
for(const irregularProperties of [false,true])test('SRE unified operation-local packing inventory reuse '+(irregularProperties?'irregular':'regular'),{timeout:600000},async()=>{
  const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
    shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
  const before=hash(project),summary={cases:0,verified:0,knownRetained:0,cacheHits:0};
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
    let metrics=null;
    if(result.status==='verified-witness'){
      const candidate=await verifySpatialConcessionRoadWitness(project,op,result.delta,createSpatialPreservationBudget());
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
    assert.equal(hash(project),before);
    console.log('SRE_INVENTORY_REUSE_CASE '+JSON.stringify({irregularProperties,scale,status:result.status,tier:result.tier,phase:result.phase,attempts:result.attempts,stats,hits,metrics}));
  }
  assert.ok(summary.cacheHits>0,'operation-local cache must be exercised');
  console.log('SRE_INVENTORY_REUSE_SUMMARY '+JSON.stringify({irregularProperties,...summary}));
});
