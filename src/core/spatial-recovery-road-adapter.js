import { createSpatialOperation, createSpatialInventory, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { createSpatialDelta, reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { describeSpatialCapability, spatialConstraint } from './spatial-recovery-registry.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from './road-intent-c1.js';
import { iterateRoadGroupReflowB1 } from './neighborhood-reflow.js';
import { LareBudgetExceeded, createLareBudget, LARE_PRESERVATION_LIMITS, LARE_DEMOLITION_LIMITS } from './reconciliation-budget.js';
import { scoreSpatialPreservation, preferVerifiedSpatialPreservation, scoreSpatialConcessions, compareSpatialConcessionCost, measureSpatialRetirementCost, improvesSpatialRetirementCost } from './spatial-recovery-score.js';
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
  const {draft,topology}=sreStrictRoadContext(project,preserving,budget,true);
  const eligibility=sreFinishMetered(iterateLareSpatialRetirementEligibility(project,draft,budget),budget);
  return {operation,preserving,eligibility,topology};
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

// Shared trial primitive for future restoration. The original eligibility
// and complete membership are rederived before candidate verification.
// A forced scale is an explicit detached diagnostic, never a default policy.
async function sreTrialRetirementSubset(project,operation,preserving,eligibility,refs,budget,diagnosticScale=null){
  const reduced=sreReducedRetirementBase(project,refs,eligibility,budget);
  const trialBudget=createLareBudget(LARE_PRESERVATION_LIMITS,{parent:budget,ceiling:LARE_PRESERVATION_LIMITS});
  let trial;
  try{
    trial=diagnosticScale===null?
      await searchSpatialNondestructiveRoadGroup(reduced,preserving,trialBudget,{reusePackingInventory:true}):
      await searchSpatialConcessionRoadGroup(reduced,preserving,trialBudget,{scale:diagnosticScale,relaxedOnlyDiagnostic:true});
  }catch(error){
    if(error instanceof LareBudgetExceeded)return {status:'refused',exhausted:error.resource};
    throw error;
  }
  if(trial.status!=='verified-witness')return {status:'refused',exhausted:trial.exhausted??null};
  const candidate=await reconstructSpatialDelta(reduced,preserving,1,trial.delta,budget);
  const delta=await createSpatialDelta(project,candidate,operation,1,budget);
  const {ledger}=await sreVerifyRetirement(project,operation,delta,budget);
  return {status:'verified-witness',delta,ledger};
}
export async function searchSpatialRetirementSubsetRoadGroup(project,input,refs,budget,{diagnosticScale=null}={}){
  const operation=createSpatialOperation(input);
  const refusal=exhausted=>riFreeze({status:'refused',operation,delta:null,ledger:null,exhausted,stats:budget.snapshot()});
  try{
    if(!Array.isArray(refs))throw Error('Missing retirement membership.');
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    const {preserving,eligibility}=sreRetirementContext(snapshot,operation,budget);
    const selected=refs.map(createSpatialRef).sort((a,b)=>riCompare(spatialRefKey(a),spatialRefKey(b)));
    const result=await sreTrialRetirementSubset(snapshot,operation,preserving,eligibility,selected,budget,diagnosticScale);
    if(result.status!=='verified-witness')return refusal(result.exhausted);
    return riFreeze({...result,operation,exhausted:null,stats:budget.snapshot()});
  }catch(error){
    if(error instanceof LareBudgetExceeded)return refusal(error.resource);
    throw error;
  }
}
// R19-inspired broad group discovery: use actual compressed block geometry,
// then all eligible groups. No preselected witness sets or fixture answers.
// Only detached scope-authorized groups are eligible; this is not a new
// topology or destruction permission and does not replace the single path.
// Area deficit is a ranking heuristic, not a packing feasibility proof.
 // Work only with independently derived eligible complete property groups.
 // Prefer more released land per retired record; deterministic ties by ID.
export function selectSpatialAreaDeficitSeed(groups,properties,blocks,changedFaces,budget){
  const losses=new Map(),byBlock=new Map();
  for(const face of changedFaces){
    budget.spend();
    const old=blocks.get(face.id)?.area,next=face.record?.area;
    if(face.kind==='block'&&Number.isFinite(old)&&Number.isFinite(next)&&old-next>1e-6)
      losses.set(face.id,old-next);
  }
  for(const group of groups){
    budget.spend(1+group.refs.length);
    const p=properties.get(group.propertyId);
    if(!p||!losses.has(p.blockId)||!Number.isFinite(p.area)||p.area<=0||!group.refs.length)continue;
    if(!byBlock.has(p.blockId))byBlock.set(p.blockId,[]);
    byBlock.get(p.blockId).push({group,area:p.area,cost:group.refs.length});
  }
  const selected=[];
  for(const id of [...byBlock.keys()].sort(riCompare)){
    const rows=byBlock.get(id);
    rows.sort((a,b)=>{budget.spend();return b.area/b.cost-a.area/a.cost||a.cost-b.cost||riCompare(a.group.propertyId,b.group.propertyId);});
    let released=0;
    for(const row of rows){
      budget.spend();selected.push(row.group);released+=row.area;
      if(released>=losses.get(id))break;
    }
  }
  return selected.sort((a,b)=>{budget.spend();return riCompare(a.propertyId,b.propertyId);});
}
export async function searchSpatialGroupedRetirementRoadGroup(project,input,budget,{seedPolicy='baseline'}={}){
  if(!['baseline','area-deficit','area-deficit-direct'].includes(seedPolicy))throw Error('Unsupported grouped retirement seed policy.');
  const operation=createSpatialOperation(input),attempts=[];
  const refusal=exhausted=>riFreeze({status:'refused',operation,delta:null,ledger:null,attempts,exhausted,stats:budget.snapshot()});
  try{
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    const {preserving,eligibility,topology}=sreRetirementContext(snapshot,operation,budget);
    const blocks=new Map(snapshot.city.blocks.map(b=>[b.id,b]));
    const properties=new Map(snapshot.city.properties.map(p=>[p.id,p]));
    budget.spend(Math.max(1,blocks.size+properties.size));
    const compressed=new Set();
    for(const face of topology.identity.changed){
      budget.spend();
      if(face.kind==='block'&&face.record?.area<blocks.get(face.id)?.area-1e-6)compressed.add(face.id);
    }
    const groups=eligibility.propertyGroups.slice().sort((a,b)=>{budget.spend();return riCompare(a.propertyId,b.propertyId);});
    const seen=new Set();
    const compressedGroups=groups.filter(g=>compressed.has(properties.get(g.propertyId)?.blockId));
    const tiers=[['compressed-blocks',compressedGroups],['all-eligible',groups]];
    if(seedPolicy!=='baseline'){
      const selected=selectSpatialAreaDeficitSeed(groups,properties,blocks,topology.identity.changed,budget);
      // Avoid a duplicate broad trial. The new trial is capped and cannot
      // borrow extra operation work or invalidate an already verified result.
      if(selected.length&&selected.length<compressedGroups.length)
        tiers.unshift(['area-deficit',selected]);
    }
    for(const [tier,selected] of tiers){
      budget.spend(Math.max(1,groups.length));
      if(!selected.length)continue;
      const ids=selected.map(g=>g.propertyId),key=JSON.stringify(ids);
      if(seen.has(key))continue;
      seen.add(key);
      if(attempts.length>=LARE_DEMOLITION_LIMITS.subsets)break;
      const refs=selected.flatMap(g=>g.refs);
      budget.spend(Math.max(1,refs.length));
      const row={tier,propertyIds:ids,stats:budget.snapshot()};attempts.push(row);
      let trialBudget=budget;
      if(tier==='area-deficit'){
        const remaining=budget.snapshot();
        const work=Math.min(6000000,remaining.remainingWork),stateExpansions=Math.min(16384,remaining.remainingExpansions);
        if(work<1||stateExpansions<1)continue;
        trialBudget=createLareBudget({work,stateExpansions},{parent:budget,ceiling:LARE_DEMOLITION_LIMITS});
      }
      let result;
      const p=operation.permissions;
      const diagnosticScale=tier==='area-deficit'&&seedPolicy==='area-deficit-direct'&&p.alternativeFrontage?
        (p.uniformScaling?1-p.maxLinearReduction:1):null;
      if(tier==='area-deficit'&&seedPolicy==='area-deficit-direct')row.diagnosticScale=diagnosticScale;
      try{result=await sreTrialRetirementSubset(snapshot,operation,preserving,eligibility,refs,trialBudget,diagnosticScale);}
      catch(error){
        if(tier!=='area-deficit'||!(error instanceof LareBudgetExceeded))throw error;
        result={status:'refused',exhausted:error.resource};
      }
      row.status=result.status;row.exhausted=result.exhausted??null;
      if(result.status==='verified-witness')return riFreeze({...result,operation,attempts,exhausted:null,stats:budget.snapshot()});
    }
    return refusal(null);
  }catch(error){
    if(error instanceof LareBudgetExceeded)return refusal(error.resource);
    throw error;
  }
}

// Monotone restoration from a verified detached retirement incumbent.
// Restore exact original records by deriving every trial anew from accepted
// input. Restoring land alone leaves its originally retired children absent.
// No new retirement or identity allocation; no accepted-project mutation.
export async function restoreSpatialRoadRetirements(project,input,seedDelta,budget,{proposalPolicy='baseline'}={}){
  if(!['baseline','diversified','shell-first'].includes(proposalPolicy))throw Error('Unsupported restoration proposal policy.');
  const operation=createSpatialOperation(input),attempts=[],restored=[];
  let incumbent=null,exhausted=null;
  const finish=()=>riFreeze({status:incumbent?'verified-witness':'refused',operation,
    delta:incumbent?.delta??null,ledger:incumbent?.ledger??null,attempts,restored,exhausted,stats:budget.snapshot()});
  try{
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    const {preserving,eligibility}=sreRetirementContext(snapshot,operation,budget);
    const verified=await sreVerifyRetirement(snapshot,operation,seedDelta,budget);
    incumbent={delta:copyJson(seedDelta),ledger:verified.ledger};
    const properties=new Map(snapshot.city.properties.map(p=>[p.id,p]));
    const buildings=new Map(snapshot.city.buildings.map(b=>[b.id,b]));
    budget.spend(Math.max(1,properties.size+buildings.size));
    const groups=eligibility.propertyGroups.map(group=>{
      budget.spend(1+group.refs.length);
      const footprint=group.refs.filter(r=>r.collection==='buildings').reduce((n,r)=>n+buildings.get(r.id).area,0);
      return {group,block:properties.get(group.propertyId).blockId,footprint};
    }).sort((a,b)=>{budget.spend();return b.footprint-a.footprint||riCompare(a.group.propertyId,b.group.propertyId);});
    const seen=new Set();
    const trial=async(tier,refs)=>{
      budget.spend(1+refs.length);
      const current=incumbent.delta.retired;
      const restoreKeys=new Set(refs.map(spatialRefKey));
      const remaining=current.filter(ref=>{budget.spend();return !restoreKeys.has(spatialRefKey(ref));});
      // The nondestructive zero-retirement transition is a distinct path.
      // Do not manufacture an empty destructive witness in this checkpoint.
      if(!remaining.length||remaining.length===current.length)return;
      const key=JSON.stringify(remaining.map(spatialRefKey).sort(riCompare));
      if(seen.has(key)||attempts.length>=LARE_DEMOLITION_LIMITS.subsets)return;
      seen.add(key);
      const row={tier,requested:current.length-remaining.length,status:'refused',stats:budget.snapshot()};
      attempts.push(row);
      let result;
      if(proposalPolicy!=='baseline'){
        const p=operation.permissions;
        const scale=p.alternativeFrontage?(p.uniformScaling?1-p.maxLinearReduction:1):null;
        row.scale=scale;
        const left=budget.snapshot();
        if(left.remainingWork<1||left.remainingExpansions<1)return;
        const bounded=createLareBudget({work:Math.min(5000000,left.remainingWork),
          stateExpansions:Math.min(16384,left.remainingExpansions)},
          {parent:budget,ceiling:LARE_PRESERVATION_LIMITS});
        try{result=await sreTrialRetirementSubset(snapshot,operation,preserving,eligibility,remaining,bounded,scale);}
        catch(error){
          if(!(error instanceof LareBudgetExceeded))throw error;
          row.exhausted=error.resource;row.trialWork=bounded.snapshot().work;return;
        }
        row.trialWork=bounded.snapshot().work;
      }else result=await sreTrialRetirementSubset(snapshot,operation,preserving,eligibility,remaining,budget);
      row.status=result.status;row.exhausted=result.exhausted??null;
      if(result.status!=='verified-witness')return;
      const actual=new Set(result.delta.retired.map(spatialRefKey));
      const expected=new Set(remaining.map(spatialRefKey));
      if(actual.size!==expected.size||result.delta.retired.length!==expected.size||
        [...actual].some(k=>!expected.has(k))||result.delta.added.length)
        throw Error('Restoration would change unapproved retirement membership.');
      const returned=current.filter(ref=>!actual.has(spatialRefKey(ref)));
      budget.spend(Math.max(1,returned.length));
      restored.push(...returned.map(ref=>({...ref})));
      incumbent={delta:result.delta,ledger:result.ledger};
    };
    // Whole blocks first (at most two), then individual groups, then land
    // shells. Each phase has its own bounded proposal inventory; the same
    // parent work/expansion cap is shared with the original search.
    const currentGroups=()=>groups.filter(({group})=>incumbent.delta.retired.some(r=>r.collection==='properties'&&r.id===group.propertyId));
    const blocks=[...new Set(currentGroups().map(row=>row.block))].sort(riCompare);
    if(proposalPolicy==='baseline'){
      for(const block of blocks.slice(0,2))await trial('block',currentGroups().filter(row=>row.block===block).flatMap(row=>row.group.refs));
      for(const {group} of currentGroups().slice(0,6))await trial('whole-property',group.refs);
      for(const {group} of currentGroups().slice(0,6))await trial('property-shell',group.refs.filter(r=>r.collection!=='buildings'));
    }else if(proposalPolicy==='shell-first'){
      // R29-inspired smaller land first. All proposals remain exact
      // subsets of the incumbent; no accepted survivor is retired.
      // Prefer fitting vacant shells without forcing their old buildings
      // to fit simultaneously, then try whole properties and child restores.
      const currentRows=block=>currentGroups().filter(r=>r.block===block)
        .sort((a,b)=>{budget.spend();return properties.get(a.group.propertyId).area-properties.get(b.group.propertyId).area||
          riCompare(a.group.propertyId,b.group.propertyId);});
      const shellRefs=rows=>rows.flatMap(r=>r.group.refs.filter(ref=>ref.collection!=='buildings'));
      for(const size of [4,2,1]){
        for(const block of blocks.slice(0,2)){
          const rows=currentRows(block).slice(0,size);
          await trial('small-shell-batch-'+size,shellRefs(rows));
          const next=currentRows(block).slice(0,size);
          await trial('small-whole-batch-'+size,next.flatMap(r=>r.group.refs));
        }
      }
      const survivingChildren=()=> {
        const retired=new Set(incumbent.delta.retired.map(spatialRefKey));
        return incumbent.delta.retired.filter(r=>r.collection==='buildings'&&
          !retired.has(spatialRefKey({collection:'properties',id:buildings.get(r.id).propertyId})))
          .sort((a,b)=>{budget.spend();return buildings.get(a.id).area-buildings.get(b.id).area||riCompare(a.id,b.id);});
      };
      for(const size of [2,1])await trial('small-child-batch-'+size,survivingChildren().slice(0,size));
    }else{
      // R27-inspired coarse-to-fine, class-interleaved restoration.
      // Derive all proposals from current verified retirements, never
      // from research fixture answers. Try one empowered solver per set.
      const shells=rows=>rows.flatMap(r=>r.group.refs.filter(ref=>ref.collection!=='buildings'));
      const whole=rows=>rows.flatMap(r=>r.group.refs);
      const inBlock=block=>currentGroups().filter(r=>r.block===block);
      for(const block of blocks.slice(0,2)){
        await trial('block',whole(inBlock(block)));
        await trial('block-shell',shells(inBlock(block)));
      }
      for(const size of [4,2,1]){
        for(const block of blocks.slice(0,2)){
          const rows=inBlock(block).slice(0,size);
          await trial('whole-batch-'+size,whole(rows));
          await trial('shell-batch-'+size,shells(inBlock(block).slice(0,size)));
        }
      }
    }
    return finish();
  }catch(error){
    if(error instanceof LareBudgetExceeded){exhausted=error.resource;return finish();}
    throw error;
  }
}

// B3c/d bounded optimization from a fully verified seed. A candidate
// trial has its own small ceiling but charges the same operation parent;
// no fresh overall allowance, no live activation. Never compare claims
// from search: every accepted challenger passes original-to-final replay.
export async function optimizeSpatialRoadRetirements(project,input,seedDelta,budget){
  const operation=createSpatialOperation(input),attempts=[];
  let incumbent=null,initial=null,exhausted=null;
  const finish=()=>{
    const finalKeys=new Set((incumbent?.delta.retired??[]).map(spatialRefKey));
    const initialKeys=new Set((initial?.delta.retired??[]).map(spatialRefKey));
    return riFreeze({status:incumbent?'verified-witness':'refused',operation,
      delta:incumbent?.delta??null,ledger:incumbent?.ledger??null,cost:incumbent?.cost??null,
      initialCost:initial?.cost??null,attempts,
      restored:initial?.delta.retired.filter(r=>!finalKeys.has(spatialRefKey(r)))??[],
      newlyRetired:incumbent?.delta.retired.filter(r=>!initialKeys.has(spatialRefKey(r)))??[],
      exhausted,stats:budget.snapshot()});
  };
  try{
    const snapshot=copyJson(project);
    budget.spend(Math.max(1,Math.ceil(new TextEncoder().encode(JSON.stringify(snapshot)).length/64)));
    const {preserving,eligibility}=sreRetirementContext(snapshot,operation,budget);
    const verified=await sreVerifyRetirement(snapshot,operation,seedDelta,budget);
    initial=incumbent={delta:copyJson(seedDelta),ledger:verified.ledger,cost:measureSpatialRetirementCost(verified.ledger,budget)};
    const buildings=new Map(snapshot.city.buildings.map(b=>[b.id,b]));
    const properties=new Map(snapshot.city.properties.map(p=>[p.id,p]));
    budget.spend(Math.max(1,buildings.size+properties.size));
    const seen=new Set(),limit={work:4000000,stateExpansions:16384};
    const keys=()=>new Set(incumbent.delta.retired.map(spatialRefKey));
    const trial=async(tier,refs,scale=null)=>{
      budget.spend(Math.max(1,refs.length));
      if(!refs.length||attempts.length>=8)return;
      const key=JSON.stringify([refs.map(spatialRefKey).sort(riCompare),scale]);
      if(seen.has(key))return;seen.add(key);
      const row={tier,scale,status:'refused',selected:false,stats:budget.snapshot()};attempts.push(row);
      const bounded=createLareBudget(limit,{parent:budget});
      try{
        const result=await sreTrialRetirementSubset(snapshot,operation,preserving,eligibility,refs,bounded,scale);
        row.status=result.status;row.exhausted=result.exhausted??null;
        if(result.status!=='verified-witness')return;
        const expected=new Set(refs.map(spatialRefKey));
        if(result.delta.added.length||result.delta.retired.length!==expected.size||
          result.delta.retired.some(r=>!expected.has(spatialRefKey(r))))throw Error('Unexpected optimized retirement membership.');
        const cost=measureSpatialRetirementCost(result.ledger,bounded);
        row.cost=cost;
        if(improvesSpatialRetirementCost(cost,incumbent.cost)){
          incumbent={delta:result.delta,ledger:result.ledger,cost};row.selected=true;
        }
      }catch(error){
        if(!(error instanceof LareBudgetExceeded))throw error;
        row.exhausted=error.resource;
      }
    };
    // Restore individual buildings only when the original parent survives.
    // Rank by footprint saved; retain an exact smaller retirement set.
    const childCandidates=incumbent.delta.retired.filter(r=>r.collection==='buildings'&&
      !keys().has(spatialRefKey({collection:'properties',id:buildings.get(r.id).propertyId})))
      .sort((a,b)=>{budget.spend();return buildings.get(b.id).area-buildings.get(a.id).area||riCompare(a.id,b.id);});
    for(const ref of childCandidates.slice(0,2)){
      if(keys().has(spatialRefKey(ref)))await trial('individual-building',incumbent.delta.retired.filter(r=>spatialRefKey(r)!==spatialRefKey(ref)));
    }
    // Compare the same exact retirement set using ordinary progressive
    // preservation first, then the cheapest permitted isolated frontage tier.
    await trial('same-set-progressive',incumbent.delta.retired);
    if(operation.permissions.alternativeFrontage)await trial('same-set-frontage',incumbent.delta.retired,1);
    // At most two same-block group exchanges and two building exchanges.
    // Componentwise count checks precede expensive solving.
    const groups=eligibility.propertyGroups;
    for(let i=0;i<2;i++){
      const retired=keys(),current=incumbent.delta.retired;
      let exchange=null;
      for(const old of groups){
        budget.spend();
        if(!retired.has(spatialRefKey({collection:'properties',id:old.propertyId})))continue;
        for(const next of groups){
          budget.spend(1+next.refs.length);
          if(properties.get(old.propertyId).blockId!==properties.get(next.propertyId).blockId||
            next.refs.some(r=>retired.has(spatialRefKey(r))))continue;
          if(['plots','buildings'].some(c=>next.refs.filter(r=>r.collection===c).length>old.refs.filter(r=>r.collection===c).length))continue;
          const removed=new Set(old.refs.map(spatialRefKey)),refs=current.filter(r=>!removed.has(spatialRefKey(r))).concat(next.refs);
          if(seen.has(JSON.stringify([refs.map(spatialRefKey).sort(riCompare),null])))continue;
          exchange=refs;break;
        }
        if(exchange)break;
      }
      if(!exchange)break;await trial('same-block-property-exchange',exchange);
    }
    for(let i=0;i<2;i++){
      const retired=keys(),current=incumbent.delta.retired;
      let exchange=null;
      for(const old of current.filter(r=>r.collection==='buildings')){
        budget.spend();const original=buildings.get(old.id);
        if(retired.has(spatialRefKey({collection:'properties',id:original.propertyId})))continue;
        for(const next of eligibility.buildingRefs){
          budget.spend();const replacement=buildings.get(next.id);
          if(retired.has(spatialRefKey(next))||replacement.blockId!==original.blockId||
            retired.has(spatialRefKey({collection:'properties',id:replacement.propertyId}))||
            replacement.area>=original.area)continue;
          const refs=current.filter(r=>spatialRefKey(r)!==spatialRefKey(old)).concat(next);
          if(seen.has(JSON.stringify([refs.map(spatialRefKey).sort(riCompare),null])))continue;
          exchange=refs;break;
        }
        if(exchange)break;
      }
      if(!exchange)break;await trial('same-block-building-exchange',exchange);
    }
    return finish();
  }catch(error){
    if(error instanceof LareBudgetExceeded){exhausted=error.resource;return finish();}
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
