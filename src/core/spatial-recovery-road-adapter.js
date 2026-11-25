import { createSpatialOperation, createSpatialInventory, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { reconstructSpatialDelta } from './spatial-recovery-delta.js';
import { describeSpatialCapability, spatialConstraint } from './spatial-recovery-registry.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from './road-intent-c1.js';
import { createLareContext } from './reconciliation-context.js';
import { iterateLareGroupPreservation } from './reconciliation-preservation.js';
import { riBudget, riCompare, riFreeze, riReporter } from './road-impact-model.js';

export function normalizeSpatialRoadGroup(project,revision,selectedRoadIds,offset,permissions={}) {
  if(!Array.isArray(selectedRoadIds))throw Error('Missing road group.');
  return createSpatialOperation({version:1,family:'road',operation:'translate-road-group',
    projectId:project?.id??project?.city?.id,revision,
    editedRefs:selectedRoadIds.map(id=>({collection:'roads',id})),permissions,geometry:{offset}});
}

function sreStrictRoadContext(project,input,budget) {
  const operation=createSpatialOperation(input);
  if(operation.family!=='road'||operation.operation!=='translate-road-group'||!operation.geometry||
    operation.editedRefs.some(ref=>ref.collection!=='roads'))
    throw Error('Unsupported spatial road operation.');
  const p=operation.permissions;
  if(p.alternativeFrontage||p.uniformScaling||p.destruction||p.regeneration)
    throw Error('Relaxed spatial road verification is not integrated.');
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
  const result=sreStrictRoadContext(project,input,budget);
  const candidate=await reconstructSpatialDelta(project,result.operation,1,delta,budget);
  const {draft,topology}=result;
  const violation=await sreFinishMetered(iterateLareGroupPreservation(project,candidate,draft,new Map(),budget),budget);
  if(violation)throw Error('Spatial preservation refused: '+violation.message);
  const {emit,items}=riReporter(),impactSpend=riBudget();
  const spend=(n=1)=>{impactSpend(n);if(n>0)budget.spend(n);};
  const dependencyContext={roadIds:draft.changedRoadIds,junctionIds:draft.proposedNodes.map(n=>n.id),
    changedBlockIds:topology.identity.changed.filter(f=>f.kind==='block').map(f=>f.id),acceptedValid:true};
  await sreFinishMetered(spatialConstraint('landDependencies').iterate(candidate.city,candidate.city,dependencyContext,emit,spend,project.city),budget);
  spatialConstraint('infrastructure').check(project.city,candidate.city,dependencyContext,emit,spend);
  const issue=items().find(i=>i.severity!=='info'&&i.code!=='frontage-geometry'&&
    !(i.kind==='plot'&&i.code==='property-containment'));
  if(issue)throw Error('Spatial dependency refused: '+issue.message);
  await sreFinishMetered(spatialConstraint('storedProject').iterate(candidate),budget);
  return candidate;
}

function sreFinishMetered(iterator,budget) {
  for(let step=iterator.next();;step=iterator.next()){
    budget.spend();
    if(step.done)return step.value;
  }
}
