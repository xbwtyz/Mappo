import { createSpatialOperation, createSpatialInventory, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { describeSpatialCapability, spatialConstraint } from './spatial-recovery-registry.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from './road-intent-c1.js';
import { iterateRoadGroupReflowB1 } from './neighborhood-reflow.js';
import { LareBudgetExceeded } from './reconciliation-budget.js';
import { scoreSpatialPreservation, preferVerifiedSpatialPreservation, scoreSpatialConcessions, compareSpatialConcessionCost } from './spatial-recovery-score.js';
import { copyJson } from '../data/project-format.js';
import { createLareContext } from './reconciliation-context.js';
import { iterateLareGroupPreservation } from './reconciliation-preservation.js';
import { riBudget, riCompare, riFreeze, riReporter } from './road-impact-model.js';

export function normalizeSpatialRoadGroup(project,revision,selectedRoadIds,offset,permissions={}) {
  if(!Array.isArray(selectedRoadIds))throw Error('Missing road group.');
  return createSpatialOperation({version:1,family:'road',operation:'translate-road-group',
    projectId:project?.id??project?.city?.id,revision,
    editedRefs:selectedRoadIds.map(id=>({collection:'roads',id})),permissions,geometry:{offset}});
}

function sreStrictRoadOperation(input,allowConcessions=false) {
  const operation=createSpatialOperation(input);
  if(operation.family!=='road'||operation.operation!=='translate-road-group'||!operation.geometry||
    operation.editedRefs.some(ref=>ref.collection!=='roads'))
    throw Error('Unsupported spatial road operation.');
  const p=operation.permissions;
  if((!allowConcessions&&(p.alternativeFrontage||p.uniformScaling))||p.destruction||p.regeneration)
    throw Error('Relaxed spatial road verification is not integrated.');
  return operation;
}

function sreStrictRoadContext(project,input,budget,allowConcessions=false) {
  const operation=sreStrictRoadOperation(input,allowConcessions);
  createSpatialInventory(project,operation,budget);
  // Independently derive the accepted geometry intent, never receive
  // proposed junctions or affected blocks from an untrusted candidate.
  const draft=prepareRoadGroupIntentB1(project,operation.editedRefs.map(ref=>ref.id),operation.geometry.offset);
  const topology=readRoadGroupTopologyB1(project,draft);
  if(!draft.group?.eligible||!draft.draftable||!draft.topologyResolved||!draft.facesResolved||
    draft.status==='unchanged'||draft.issues?.some(i=>i.code==='boundary-escape')||
    !topology?.identity?.valid||topology.identity.requiresReview||topology.identity.issues.length||
    topology.identity.added.length||topology.identity.removed.length||topology.identity.split.length||
    topology.identity.merged.length||topology.identity.ambiguous.length)
    throw Error('Unsupported or unresolved road topology.');
  const context=createLareContext(project,draft,new Map(),budget);
  return {operation,draft,topology,context};
}

function sreRoadScope(result,budget) {
  const {operation,draft,context}=result;
  const refs=new Map(),capabilities=[];
  const add=(collection,id)=>{
    budget.spend();
    const ref=createSpatialRef({collection,id});refs.set(spatialRefKey(ref),ref);
  };
  for(const node of draft.proposedNodes)add('nodes',node.id);
  for(const id of context.blockIds)add('blocks',id);
  for(const p of context.properties){
    add('properties',p.id);
    capabilities.push({ref:createSpatialRef({collection:'properties',id:p.id}),
      capability:describeSpatialCapability('property',p.policy,operation.permissions)});
    for(const id of p.plotIds)add('plots',id);
    for(const b of p.buildings){
      add('buildings',b.id);
      capabilities.push({ref:createSpatialRef({collection:'buildings',id:b.id}),
        capability:describeSpatialCapability('building',b,operation.permissions)});
    }
  }
  return {refs,capabilities};
}

// Scope is a conservative affected neighborhood, not unrestricted write
// permission. Protected/opaque records within it remain independently checked.
export function discoverSpatialRoadScope(project,input,budget) {
  const result=sreStrictRoadContext(project,input,budget);
  const scope=sreRoadScope(result,budget),blocks=new Set(result.context.blockIds);
  for(const space of project.city.openSpaces??[]){
    budget.spend();
    if(blocks.has(space.blockId)){
      const ref=createSpatialRef({collection:'openSpaces',id:space.id});scope.refs.set(spatialRefKey(ref),ref);
    }
  }
  return riFreeze({operation:result.operation,affectedBlocks:result.context.blockIds.slice(),
    refs:[...scope.refs.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,ref])=>ref),
    capabilities:scope.capabilities});
}

// Detached strict witness verification only. No editor hooks, no Apply
// authorization, no search rerun. Existing B1R constraints remain authoritative.
export async function verifySpatialStrictRoadWitness(project,input,delta,budget) {
  return (await sreVerifyRoadWitness(project,input,delta,budget,false)).candidate;
}
// Detached verifier only; does not authorize Apply or initiate search.
export async function verifySpatialConcessionRoadWitness(project,input,delta,budget) {
  return (await sreVerifyRoadWitness(project,input,delta,budget,true)).candidate;
}
async function sreVerifyRoadWitness(project,input,delta,budget,allowConcessions,report=null) {
  report?.('context');
  const result=sreStrictRoadContext(project,input,budget,allowConcessions);
  report?.('reconstruction');
  const candidate=await reconstructSpatialDelta(project,result.operation,1,delta,budget);
  const {draft,topology}=result;
  let ledger=null;
  report?.('preservation');
  const violation=await sreFinishMetered(iterateLareGroupPreservation(project,candidate,draft,new Map(),budget,new Set(),allowConcessions?result.operation:null,allowConcessions?value=>{ledger=value;}:null),budget);
  if(violation)throw Error('Spatial preservation refused: '+violation.message);
  if(allowConcessions&&!ledger)throw Error('Missing independently derived concession ledger.');
  report?.('dependencies');
  const {emit,items}=riReporter(),impactSpend=riBudget();
  const spend=(n=1)=>{impactSpend(n);if(n>0)budget.spend(n);};
  const dependencyContext={roadIds:draft.changedRoadIds,junctionIds:draft.proposedNodes.map(n=>n.id),
    changedBlockIds:topology.identity.changed.filter(f=>f.kind==='block').map(f=>f.id),acceptedValid:true};
  await sreFinishMetered(spatialConstraint('landDependencies').iterate(candidate.city,candidate.city,dependencyContext,emit,spend,project.city),budget);
  report?.('infrastructure');
  spatialConstraint('infrastructure').check(project.city,candidate.city,dependencyContext,emit,spend);
  const issue=items().find(i=>i.severity!=='info'&&i.code!=='frontage-geometry'&&
    !(i.kind==='plot'&&i.code==='property-containment'));
  if(issue)throw Error('Spatial dependency refused: '+issue.message);
  report?.('storedProject');
  await sreFinishMetered(spatialConstraint('storedProject').iterate(candidate),budget);
  report?.('complete');
  // The ledger came from the independent preservation pass, not search.
  // Neither candidate nor ledger escapes before the full gate succeeds.
  return {candidate,ledger};
}

function sreFinishMetered(iterator,budget) {
  for(let step=iterator.next();;step=iterator.next()){
    budget.spend();
    if(step.done)return step.value;
  }
}

// E2-A detached search bridge. Existing LARE progressive search remains
// authoritative for candidate production; it receives the operation-wide
// budget as parent. Never publish a candidate or trust its reported ledger.
// No worker scheduling or relaxed strategy activation is introduced here.
async function sreSearchPreservingRoadGroup(project,input,budget,packing=false,strategy='enhanced-adaptive',packingFallback=false,packingReuseFixedRefusal=false) {
  const operation=sreStrictRoadOperation(input);
  createSpatialInventory(project,operation,budget);
  // Detach the complete accepted snapshot, including its allocator and opaque
  // metadata. copyJson rehydrates read-only canonical building projections.
  const snapshot=copyJson(project);
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot)).length;
  budget.spend(Math.max(1,Math.ceil(bytes/64)));
  const iterator=iterateRoadGroupReflowB1(snapshot,operation.editedRefs.map(ref=>ref.id),
    operation.geometry.offset,{acceptedRevision:operation.revision,sharedBudget:budget,...(packing?{strategy,packing:true}:packingFallback?{strategy:'progressive',packingFallback:true,packingReuseFixedRefusal}:{})});
  let result;
  try {
    for (;;) {
      budget.spend();
      const step=iterator.next();
      if(step.done){result=step.value;break;}
    }
  } finally { iterator.return(); }
  if(!result?.candidateProject) {
    return riFreeze({status:'refused',operation,delta:null,
      issues:(result?.unresolved??[]).map(row=>({code:String(row.code??'unknown'),
        message:String(row.message??'Road recovery refused.')})),stats:budget.snapshot()});
  }
  const delta=await createSpatialDelta(snapshot,result.candidateProject,operation,1,budget);
  const verified=await verifySpatialStrictRoadWitness(snapshot,operation,delta,budget);
  const cost=scoreSpatialPreservation(snapshot,verified,budget);
  // Explicitly return transport, not a second complete city or Apply authority.
  return riFreeze({status:'verified-witness',operation,delta,cost,issues:[],stats:budget.snapshot()});
}

// Strict progressive result is independently verified before packing can
// challenge it. Both searches use one host-owned budget; no worker scheduling.
export async function searchSpatialPreservingRoadGroup(project,input,budget) {
  return sreSearchPreservingRoadGroup(project,input,budget);
}
export async function searchSpatialPackingRoadGroup(project,input,budget) {
  const incumbent=await sreSearchPreservingRoadGroup(project,input,budget);
  if(incumbent.status==='verified-witness'&&incumbent.cost.movedBuildings===0)return incumbent;
  try{
    const challenger=await sreSearchPreservingRoadGroup(project,input,budget,true);
    const selected=preferVerifiedSpatialPreservation(
      incumbent.status==='verified-witness'?incumbent:null,
      challenger.status==='verified-witness'?challenger:null)??incumbent;
    return riFreeze({...selected,stats:budget.snapshot()});
  }catch(error){
    if(error instanceof LareBudgetExceeded&&incumbent.status==='verified-witness')
      return riFreeze({...incumbent,stats:budget.snapshot(),packingExhausted:true});
    throw error;
  }
}

// Qualification candidate only: the ordinary coordinator above remains
// available until historical strict recovery and cost gates are reviewed.
// Direct, strict and selective-adaptive retain their existing priority;
// packing joins the enhanced pass instead of repeating the entire pipeline.
// If that path refuses, ordinary progressive search may still recover a
// witness using only the remaining operation-wide budget. Never reset it.
export async function searchSpatialPackingRoadGroupSinglePass(project,input,budget) {
  const selected=await sreSearchPreservingRoadGroup(project,input,budget,true,'progressive');
  if(selected.status==='verified-witness')return selected;
  if(!budget.snapshot().remainingWork||!budget.snapshot().remainingExpansions)return selected;
  try{
    const fallback=await sreSearchPreservingRoadGroup(project,input,budget);
    return riFreeze({...preferVerifiedSpatialPreservation(null,
      fallback.status==='verified-witness'?fallback:null)??selected,stats:budget.snapshot()});
  }catch(error){
    if(error instanceof LareBudgetExceeded)
      return riFreeze({...selected,stats:budget.snapshot(),fallbackExhausted:true});
    throw error;
  }
}

// Ordinary-first alternative for qualification. Keep the complete ordinary
// progressive result exactly when successful. Packing is a refusal fallback,
// not a replacement for ordinary enhanced search. One detached operation,
// one parent budget and one independent transport verification.
export async function searchSpatialPackingRoadGroupStrictFirst(project,input,budget) {
  return sreSearchPreservingRoadGroup(project,input,budget,false,'progressive',true);
}
// Detached ordinary-first comparison: reuse only an actually completed
// enhanced fixed-pass refusal within the same generator operation.
export async function searchSpatialPackingRoadGroupReuseFixed(project,input,budget){
  return sreSearchPreservingRoadGroup(project,input,budget,false,'progressive',true,true);
}

// Explicit detached strategy qualification. Not a replacement for the
// ordinary-first production coordinator and never an Apply authorization.
// The caller selects a permitted concession tier; all work shares one cap.
export async function searchSpatialConcessionRoadGroup(project,input,budget,{scale=1,relaxedOnlyDiagnostic=false}={}){
  return sreSearchConcessionRoadGroup(project,input,budget,{scale,relaxedOnlyDiagnostic});
}
async function sreSearchConcessionRoadGroup(project,input,budget,{scale=1,relaxedOnlyDiagnostic=false,rankProposalOrder=false,measureRank=false}={}){
  const operation=sreStrictRoadOperation(input,true);
  if(!operation.permissions.alternativeFrontage&&!operation.permissions.uniformScaling)
    throw Error('No detached concession permission.');
  if(!Number.isFinite(scale)||scale<=0||scale>1||
    (scale!==1&&(!operation.permissions.uniformScaling||scale<1-operation.permissions.maxLinearReduction-1e-6)))
    throw Error('Unauthorized detached concession scale.');
  createSpatialInventory(project,operation,budget);
  const snapshot=copyJson(project);
  budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
  const iterator=iterateRoadGroupReflowB1(snapshot,operation.editedRefs.map(ref=>ref.id),operation.geometry.offset,{
    acceptedRevision:operation.revision,sharedBudget:budget,strategy:'enhanced-adaptive',packing:true,
    detachedConcessions:{operation,scale,relaxedOnlyDiagnostic:relaxedOnlyDiagnostic===true,rankProposalOrder:rankProposalOrder===true}
  });
  let result;const stages={};
  try{
    for(;;){budget.spend();const step=iterator.next();if(step.done){result=step.value;break;}
      const stage=step.value?.stage??'other';stages[stage]=(stages[stage]??0)+1;}
  }finally{iterator.return();}
  if(!result?.candidateProject)return riFreeze({status:'refused',operation,delta:null,stages,
    issues:(result?.unresolved??[]).map(row=>({code:String(row.code??'unknown'),message:String(row.message??'Road recovery refused.')})),
    stats:budget.snapshot()});
  const delta=await createSpatialDelta(snapshot,result.candidateProject,operation,1,budget);
  const {candidate,ledger}=await sreVerifyRoadWitness(snapshot,operation,delta,budget,true);
  let rankCost=null,rankExhausted=null;
  if(measureRank){
    try{rankCost=scoreSpatialConcessions(snapshot,operation,candidate,budget);}
    catch(error){if(!(error instanceof LareBudgetExceeded))throw error;rankExhausted=error.resource;}
  }
  return riFreeze({status:'verified-witness',operation,delta,ledger,stages,issues:[],
    ...(measureRank?{rankCost,rankExhausted}:{}),stats:budget.snapshot()});
}

// A2b isolated relaxed-tier qualification, not the progressive coordinator.
// Both trials consume the same caller-owned budget; neither resets it.
// The first full independent witness remains eligible if comparison work
// exhausts the budget. Local search scores never choose the final witness.
export async function searchSpatialRankedConcessionRoadGroup(project,input,budget,{scale=1}={}){
  const operation=sreStrictRoadOperation(input,true);
  const snapshot=copyJson(project);
  budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
  const trial=async rankProposalOrder=>{
    try{return await sreSearchConcessionRoadGroup(snapshot,operation,budget,
      {scale,relaxedOnlyDiagnostic:true,rankProposalOrder,measureRank:true});}
    catch(error){
      if(!(error instanceof LareBudgetExceeded))throw error;
      return riFreeze({status:'refused',operation,delta:null,ledger:null,rankCost:null,
        exhausted:error.resource,stats:budget.snapshot()});
    }
  };
  const baseline=await trial(false);
  let challenger=null,selected=baseline,selection=baseline.status==='verified-witness'?'baseline':'none';
  if((baseline.status!=='verified-witness'||baseline.rankCost)&&
    budget.snapshot().remainingWork>0&&budget.snapshot().remainingExpansions>0){
    challenger=await trial(true);
    if(challenger.status==='verified-witness'&&(selection==='none'||
      (challenger.rankCost&&compareSpatialConcessionCost(challenger.rankCost,baseline.rankCost)<0))){
      selected=challenger;selection='challenger';
    }
  }
  const describe=row=>row?{status:row.status,cost:row.rankCost??null,
    fingerprint:row.delta?.candidateFingerprint??null,exhausted:row.exhausted??row.rankExhausted??null,
    rankedInventories:row.stages?.['sre-concession-ranked-proposals']??0,stats:row.stats}:null;
  return riFreeze({...selected,ranking:{selection,baseline:describe(baseline),challenger:describe(challenger)},
    stats:budget.snapshot()});
}

// Detached progressive coordinator qualification. The earlier independent
// strategies remain available. This path never resets the caller's budget,
// never accepts a candidate without independent reconstruction and verification,
// and never grants Apply authority. No new permission defaults.
export async function searchSpatialNondestructiveRoadGroup(project,input,budget,{reusePackingInventory=false,rankConcessionProposals=false}={}){
  const operation=sreStrictRoadOperation(input,true);
  const p=operation.permissions;
  if(!p.alternativeFrontage&&!p.uniformScaling)
    return searchSpatialPackingRoadGroupReuseFixed(project,operation,budget);
  const attempts=[],stages={},verificationWork={};let tier='ordinary',phase='inventory',iterator=null,result=null;
  const refusal=(issues,exhausted=null)=>riFreeze({status:'refused',operation,delta:null,ledger:null,cost:null,
    tier,phase,attempts,stages,verificationWork,issues,exhausted,stats:budget.snapshot()});
  try{
    createSpatialInventory(project,operation,budget);
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    phase='search';
    iterator=iterateRoadGroupReflowB1(snapshot,operation.editedRefs.map(ref=>ref.id),operation.geometry.offset,{
      acceptedRevision:operation.revision,sharedBudget:budget,strategy:'progressive',
      packingFallback:true,packingReuseFixedRefusal:true,detachedProgressiveConcessions:operation,
      detachedPackingInventoryReuse:reusePackingInventory===true,
      detachedRankConcessionProposals:rankConcessionProposals==='within-frontage'?
        'within-frontage':rankConcessionProposals===true
    });
    for(;;){
      budget.spend();const step=iterator.next();
      if(step.done){result=step.value;break;}
      const v=step.value??{},stage=v.stage??'other';stages[stage]=(stages[stage]??0)+1;
      if(stage==='sre-progressive-packing-tier'){
        tier='packing';attempts.push({tier,stats:budget.snapshot()});
      }else if(stage==='sre-progressive-concession-tier'){
        tier=v.tier;attempts.push({tier,scale:v.scale,stats:budget.snapshot()});
      }else if(stage==='sre-progressive-concession-result'){
        attempts.push({tier:v.tier,scale:v.scale,accepted:v.accepted,stats:budget.snapshot()});
      }
    }
    iterator.return();iterator=null;
    if(!result?.candidateProject)return refusal((result?.unresolved??[]).map(i=>({code:String(i.code??'unknown'),message:String(i.message??'Road recovery refused.')})));
    phase='delta';
    verificationWork.delta=budget.snapshot().work;
    const delta=await createSpatialDelta(snapshot,result.candidateProject,operation,1,budget);
    phase='verification';
    const {candidate:verified,ledger}=await sreVerifyRoadWitness(snapshot,operation,delta,budget,true,
      stage=>{verificationWork[stage]=budget.snapshot().work;});
    if((tier==='ordinary'||tier==='packing')&&(ledger.frontageSwitches.length||ledger.scaledBuildings.length))
      throw Error('Unauthorized concession in ordinary preservation tier.');
    if(tier==='alternative-frontage'&&ledger.scaledBuildings.length)
      throw Error('Unauthorized scaling in frontage-only tier.');
    const last=attempts.findLast(a=>a.tier===tier&&Number.isFinite(a.scale));
    if(last&&ledger.scaledBuildings.some(b=>b.factor<last.scale-1e-6))
      throw Error('Concession exceeded attempted tier scale.');
    phase='score';
    const cost=!ledger.frontageSwitches.length&&!ledger.scaledBuildings.length?scoreSpatialPreservation(snapshot,verified,budget):null;
    return riFreeze({status:'verified-witness',operation,delta,ledger,cost,tier,phase:'verified',attempts,stages,verificationWork,issues:[],stats:budget.snapshot()});
  }catch(error){
    if(error instanceof LareBudgetExceeded)return refusal([{code:'lare-work-limit',message:error.message}],error.resource);
    throw error;
  }finally{iterator?.return();}
}
