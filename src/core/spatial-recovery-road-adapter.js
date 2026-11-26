import { createSpatialOperation, createSpatialInventory, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { describeSpatialCapability, spatialConstraint } from './spatial-recovery-registry.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from './road-intent-c1.js';
import { iterateRoadGroupReflowB1 } from './neighborhood-reflow.js';
import { LareBudgetExceeded } from './reconciliation-budget.js';
import { scoreSpatialPreservation, preferVerifiedSpatialPreservation, scoreSpatialConcessions, compareSpatialConcessionCost } from './spatial-recovery-score.js';
import { copyJson } from '../data/project-format.js';
import { stampRoadGenerated } from './road-provenance.js';
import { createLareContext } from './reconciliation-context.js';
import { iterateLareSpatialRetirementEligibility, iterateLareSpatialBuildingRetirementTrials, iterateLareVerifySpatialBuildingRetirement } from './reconciliation-demolition.js';
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

// Separate, read-only discovery. Never pass destruction permissions into
// the existing nondestructive verifier or accept a caller-supplied scope.
export function discoverSpatialRoadRetirementEligibility(project,input,budget){
  const operation=createSpatialOperation(input);
  if(operation.regeneration||operation.permissions.regeneration)
    throw Error('Regeneration eligibility is not integrated.');
  const preserving=createSpatialOperation({...operation,permissions:{...operation.permissions,destruction:false}});
  const {draft}=sreStrictRoadContext(project,preserving,budget,true);
  const eligible=operation.permissions.destruction?
    sreFinishMetered(iterateLareSpatialRetirementEligibility(project,draft,budget),budget):
    {buildingRefs:[],propertyGroups:[]};
  return riFreeze({operation,...eligible});
}

// Building-only detached destruction. Concession and property retirement
// combination are not implemented in this first step. Never authorize Apply.
function sreBuildingRetirementContext(project,input,budget){
  const operation=createSpatialOperation(input);
  const p=operation.permissions;
  if(!p.destruction||p.regeneration||p.alternativeFrontage||p.uniformScaling)
    throw Error('Explicit building-only destruction permission required.');
  const preserving=createSpatialOperation({...operation,permissions:{...p,destruction:false}});
  const {draft}=sreStrictRoadContext(project,preserving,budget);
  return {operation,draft};
}
export async function verifySpatialBuildingRetirementWitness(project,input,delta,budget){
  const {operation,draft}=sreBuildingRetirementContext(project,input,budget);
  const candidate=await reconstructSpatialDelta(project,operation,1,delta,budget);
  if(delta.added.length||!delta.retired.length||delta.retired.some(r=>r.collection!=='buildings'))
    throw Error('Only exact building retirement membership is supported.');
  const ids=delta.retired.map(r=>r.id).sort(riCompare);
  // Legacy gate independently derives actual scope, protects references,
  // checks exact missing IDs, surviving geometry and stored-project validity.
  sreFinishMetered(iterateLareVerifySpatialBuildingRetirement(project,candidate,draft,ids,budget),budget);
  return candidate;
}
export async function searchSpatialBuildingRetirementRoadGroup(project,input,budget){
  const operation=createSpatialOperation(input);
  const attempts=[];let iterator=null;
  const refusal=exhausted=>riFreeze({status:'refused',operation,delta:null,ledger:null,attempts,exhausted,stats:budget.snapshot()});
  try{
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    const {draft}=sreBuildingRetirementContext(snapshot,operation,budget);
    iterator=iterateLareSpatialBuildingRetirementTrials(snapshot,draft,operation.revision,budget);
    for(;;){
      budget.spend();const step=iterator.next();if(step.done)break;
      const row=step.value;
      if(row.stage==='sre-building-retirement-subset')attempts.push({ids:row.ids,stats:budget.snapshot()});
      if(row.stage!=='sre-building-retirement-proposal')continue;
      const delta=await createSpatialDelta(snapshot,row.candidate,operation,1,budget);
      const verified=await verifySpatialBuildingRetirementWitness(snapshot,operation,delta,budget);
      const retired=delta.retired.map(r=>({...r}));
      const index=new Map(snapshot.city.buildings.map(b=>[b.id,b]));
      budget.spend(Math.max(1,index.size));
      let footprintLoss=0;
      for(const ref of retired){budget.spend();footprintLoss+=index.get(ref.id).area;}
      // Derive membership and cost only after independent verification.
      if(verified.city.buildings.length!==snapshot.city.buildings.length-retired.length)
        throw Error('Verified retirement membership mismatch.');
      return riFreeze({status:'verified-witness',operation,delta,
        ledger:{retired,demolishedFootprint:footprintLoss},attempts,exhausted:null,stats:budget.snapshot()});
    }
    return refusal(null);
  }catch(error){
    if(error instanceof LareBudgetExceeded)return refusal(error.resource);
    throw error;
  }finally{iterator?.return();}
}

// Derive a reduced accepted baseline from the original, never from
// candidate-provided records. Complete groups and independent building
// retirements are the only supported membership changes.
function sreRetirementContext(project,input,budget){
  const operation=createSpatialOperation(input),p=operation.permissions;
  if(!p.destruction||p.regeneration)throw Error('Explicit destruction permission required; regeneration not integrated.');
  const preserving=createSpatialOperation({...operation,permissions:{...p,destruction:false}});
  const {draft}=sreStrictRoadContext(project,preserving,budget,true);
  const eligibility=sreFinishMetered(iterateLareSpatialRetirementEligibility(project,draft,budget),budget);
  return {operation,preserving,eligibility};
}
function sreReducedRetirementBase(project,refs,eligibility,budget){
  const keys=new Set(refs.map(spatialRefKey));
  if(!keys.size||keys.size!==refs.length)throw Error('Missing or duplicate retirement membership.');
  const allowed=new Set(eligibility.buildingRefs.map(spatialRefKey));
  for(const group of eligibility.propertyGroups){
    budget.spend(1+group.refs.length);
    const propertyKey=spatialRefKey({collection:'properties',id:group.propertyId});
    if(!keys.has(propertyKey))continue;
    if(!group.refs.every(ref=>keys.has(spatialRefKey(ref))))
      throw Error('Incomplete property retirement group.');
    for(const ref of group.refs)allowed.add(spatialRefKey(ref));
  }
  if([...keys].some(key=>!allowed.has(key)))throw Error('Protected or ineligible retirement.');
  const reduced=copyJson(project);
  budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(reduced)).length/64)));
  for(const collection of ['properties','plots','buildings']){
    reduced.city[collection]=reduced.city[collection].filter(row=>{
      budget.spend();return !keys.has(spatialRefKey({collection,id:row.id}));
    });
  }
  const plots=new Map(reduced.city.plots.map(row=>[row.id,row]));
  budget.spend(Math.max(1,plots.size));
  for(const property of reduced.city.properties){
    budget.spend(1+property.buildingIds.length);
    const surviving=property.buildingIds.filter(id=>!keys.has(spatialRefKey({collection:'buildings',id})));
    if(surviving.length!==property.buildingIds.length){
      property.buildingIds=surviving;
      stampRoadGenerated(property,property.plotIds.map(id=>plots.get(id)));
    }
  }
  sreFinishMetered(spatialConstraint('storedProject').iterate(reduced),budget);
  return reduced;
}
async function sreVerifyRetirement(project,input,delta,budget){
  const {operation,preserving,eligibility}=sreRetirementContext(project,input,budget);
  const candidate=await reconstructSpatialDelta(project,operation,1,delta,budget);
  if(delta.added.length)throw Error('Regeneration not integrated.');
  const reduced=sreReducedRetirementBase(project,delta.retired,eligibility,budget);
  // A second independently reconstructed transport must contain NO
  // membership changes. Existing preservation gate validates all survivors,
  // including protected infrastructure, ownership, and actual concessions.
  const remaining=await createSpatialDelta(reduced,candidate,preserving,1,budget);
  if(remaining.added.length||remaining.retired.length)throw Error('Unreviewed retirement membership.');
  const {candidate:verified,ledger}=await sreVerifyRoadWitness(reduced,preserving,remaining,budget,true);
  const index=new Map(project.city.buildings.map(b=>[b.id,b]));
  budget.spend(Math.max(1,index.size));
  let demolishedFootprint=0;
  for(const ref of delta.retired){budget.spend();if(ref.collection==='buildings')demolishedFootprint+=index.get(ref.id).area;}
  return {candidate:verified,ledger:{retired:delta.retired.map(r=>({...r})),demolishedFootprint,concessions:ledger}};
}
export async function verifySpatialRetirementWitness(project,input,delta,budget){
  return (await sreVerifyRetirement(project,input,delta,budget)).candidate;
}
// Property-group qualification path. One operation budget for all trials
// and both original/reduced verification gates. No automatic live fallback.
export async function searchSpatialPropertyRetirementRoadGroup(project,input,budget){
  const operation=createSpatialOperation(input),attempts=[];
  const refusal=exhausted=>riFreeze({status:'refused',operation,delta:null,ledger:null,attempts,exhausted,stats:budget.snapshot()});
  try{
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    const {preserving,eligibility}=sreRetirementContext(snapshot,operation,budget);
    // Building count first, then larger footprint as a deterministic
    // obstruction heuristic; final quality optimization belongs to Batch 3.
    const index=new Map(snapshot.city.buildings.map(b=>[b.id,b]));
    budget.spend(Math.max(1,index.size));
    const groups=eligibility.propertyGroups.map(group=>{
      budget.spend(1+group.refs.length);
      const buildings=group.refs.filter(r=>r.collection==='buildings');
      return {group,count:buildings.length,area:buildings.reduce((n,r)=>n+index.get(r.id).area,0)};
    });
    groups.sort((a,b)=>{budget.spend();return a.count-b.count||b.area-a.area||riCompare(a.group.propertyId,b.group.propertyId);});
    for(const {group} of groups.slice(0,16)){
      budget.spend();attempts.push({propertyId:group.propertyId,stats:budget.snapshot()});
      const reduced=sreReducedRetirementBase(snapshot,group.refs,eligibility,budget);
      const trial=await searchSpatialNondestructiveRoadGroup(reduced,preserving,budget,{reusePackingInventory:true});
      if(trial.status!=='verified-witness')continue;
      const candidate=await reconstructSpatialDelta(reduced,preserving,1,trial.delta,budget);
      const delta=await createSpatialDelta(snapshot,candidate,operation,1,budget);
      const {ledger}=await sreVerifyRetirement(snapshot,operation,delta,budget);
      return riFreeze({status:'verified-witness',operation,delta,ledger,attempts,exhausted:null,stats:budget.snapshot()});
    }
    return refusal(null);
  }catch(error){
    if(error instanceof LareBudgetExceeded)return refusal(error.resource);
    throw error;
  }
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
