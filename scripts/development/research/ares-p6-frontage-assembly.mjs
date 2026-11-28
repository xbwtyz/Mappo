// P6 batch 7: permission-bound alternative frontage for unresolved owners.
// Reuse SRE locally checked parcel bundles, not a replacement SRE search.
import {createSpatialOperation} from '../../../src/core/spatial-recovery-contract.js';
import {createSpatialConcessionProposalSource} from '../../../src/core/spatial-recovery-concessions.js';
import {classifyRoad} from '../../../src/core/road-graph.js';
import {observeP6ParcelConflicts} from './ares-p6-parcel-conflicts.mjs';
import {observeP6CooperativeParcels} from './ares-p6-cooperative-parcels.mjs';
import {assembleP6DetachedCity} from './ares-p6-detached-city.mjs';
import {createLareBudget,LARE_PRESERVATION_LIMITS,LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
export function tryP6AlternativeFrontageAssembly(project,input,candidateRoads,extraction,e,root){
 const refuse=(reason,details=null)=>({status:'assembly-refused',reason,details,authority:'none',valid:false,landVerified:false,candidate:null});
 const op=createSpatialOperation(input);
 if(!op.permissions.alternativeFrontage||op.permissions.uniformScaling||op.permissions.destruction||op.permissions.regeneration||op.family!=='road'||op.operation!=='translate-road-group'||op.projectId!==(project.id??project.city?.id))return refuse('alternative-frontage-not-authorized');
 if(e.blockPlan.structural||e.identity.changed.some(x=>x.kind!=='block'))return refuse('alternative-frontage-unsupported-topology');
 const left=root.snapshot(),work=Math.min(2500000,left.remainingWork-1500000),states=Math.min(8192,left.remainingExpansions-512);
 if(work<1||states<1)return refuse('alternative-frontage-verification-reserve');
 const b=createLareBudget({work,stateExpansions:states},{parent:root,ceiling:LARE_PRESERVATION_LIMITS});
 const source=project.city,targets=new Set(e.relocationExtension.unresolved),bundles=new Map(),rows=[],selected=new Map(e.relocationExtension.selected.map(s=>[s.id,s])),rigid=new Map(e.rigidTranslations.rows.map(r=>[r.id,r.witness]));
 let stage='proposal-source',tried=0,proposals=0;
 try{
  const generator=createSpatialConcessionProposalSource(project,op,b);
  const alt=new Map(e.alternativeFrontages.rows.map(r=>[r.id,r]));
  const roads=new Map(source.roads.map(r=>[r.id,r]));
  b.spend(Math.max(1,alt.size+roads.size+selected.size+rigid.size+targets.size));
  for(const row of e.parcelReshapes.rows){
   b.spend();
   if(!targets.has(row.id)){
    const s=selected.get(row.id);if(!s)return refuse('missing-retained-selection');
    const o=s.kind==='ordinary'?row.options[s.index]:row.conditionalOptions[s.index];
    if(!o||o.key!==s.key)return refuse('missing-retained-option');
    if(s.kind==='relocated'&&rigid.get(row.id)?.optionIndex!==s.index)return refuse('missing-retained-witness');
    rows.push({...row,options:[o]});continue;
   }
   stage='frontage-proposals';
   const options=[],placements=[];
   const eligible=alt.get(row.id)?.options??[],allowed=new Set(generator.frontages(row.id));
   for(const item of eligible){
    b.spend();if(!allowed.has(item.roadId)||!roads.has(item.roadId)||classifyRoad(roads.get(item.roadId)).protected)continue;
    tried++;
    const iterator=generator.proposals(row.id,{frontageRoadId:item.roadId,scale:1});
    let result;
    try{for(let step=iterator.next();;step=iterator.next()){b.spend();if(step.done){result=step.value;break;}}}finally{iterator.return();}
    for(const bundle of result.slice(0,3)){
     b.spend();aresReplayJson(bundle,b);
     if(bundle.frontageRoadId!==item.roadId||bundle.scale!==1||bundle.property.id!==row.id)continue;
     options.push({key:item.key,family:'alternative-frontage',authority:'none',boundary:bundle.property.boundary});
     placements.push(bundle);proposals++;
    }
   }
   bundles.set(row.id,placements);rows.push({...row,options});
  }
  stage='selection';
  const inventory={status:'parcel-reshape-observed',authority:'none',rows};
  const conflicts=observeP6ParcelConflicts(source,inventory,b);
  if(conflicts.status!=='parcel-conflicts-observed')return refuse(conflicts.reason);
  const joint=observeP6CooperativeParcels(inventory,conflicts,b);
  const details={targets:targets.size,tried,proposals,unresolved:joint.unresolved?.length??targets.size,reason:joint.reason??null};
  if(joint.status!=='cooperative-parcels-observed'||!joint.allObservedOwnersCovered)return refuse('alternative-frontage-incomplete-selection',details);
  const chosen=new Map();
  for(const s of joint.selected){
   b.spend();if(!targets.has(s.id))continue;
   const bundle=bundles.get(s.id)?.[s.index];if(!bundle)return refuse('missing-frontage-bundle');
   chosen.set(s.id,bundle);
  }
  if(chosen.size!==targets.size)return refuse('incomplete-frontage-bundles',details);
  stage='assembly';
  const assembly=assembleP6DetachedCity(source,candidateRoads,extraction,e,b,{frontageBundles:chosen});
  return {...assembly,frontageDetails:details};
 }catch(error){
  if(error instanceof LareBudgetExceeded)return refuse('alternative-frontage-budget-exhausted',{stage,tried,proposals,resource:error.resource});
  return refuse('alternative-frontage-error',{stage,reason:error.message,tried,proposals});
 }
}
