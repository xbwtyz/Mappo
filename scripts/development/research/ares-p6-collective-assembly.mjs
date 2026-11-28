// P6 collective fallback: candidate-bearing properties are solved together.
// Existing strict assembler and independent verifier remain mandatory.
import {observeP6ParcelReshapes} from './ares-p6-parcel-reshapes.mjs';
import {observeP6ParcelConflicts} from './ares-p6-parcel-conflicts.mjs';
import {observeP6CooperativeParcels} from './ares-p6-cooperative-parcels.mjs';
import {observeP6FixedBuildings} from './ares-p6-fixed-buildings.mjs';
import {observeP6RigidTranslations} from './ares-p6-rigid-translations.mjs';
import {observeP6RelocatedAccess} from './ares-p6-same-frontage-access.mjs';
import {assembleP6DetachedCity} from './ares-p6-detached-city.mjs';
import {LARE_LIMITS,LARE_PRESERVATION_LIMITS,LareBudgetExceeded,createLareBudget} from '../../../src/core/reconciliation-budget.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';

export function selectP6JointArrangement(source,reshapes,rigid,b){
 const refuse=reason=>({status:'refused',reason,authority:'none',selected:[],unresolved:[]});
 if(reshapes?.status!=='parcel-reshape-observed'||rigid?.status!=='rigid-translations-observed'||reshapes.authority!=='none'||rigid.authority!=='none')return refuse('unqualified-input');
 const inventory=new Map(),rows=[],mapping=new Map();
 for(const r of rigid.rows){b.spend();if(inventory.has(r.id))return refuse('duplicate-rigid-owner');inventory.set(r.id,r);}
 for(const row of reshapes.rows){
  b.spend();if(mapping.has(row.id)||!inventory.has(row.id))return refuse('invalid-owner-census');
  const options=[],links=[],witnesses=inventory.get(row.id).witnesses??[];
  if(!Array.isArray(witnesses)||witnesses.length>6)return refuse('invalid-witness-census');
  // Keep ordinary choices first, but reserve space for eligible relocation
  // alternatives. All retained options are paired with their actual witness.
  const ordinaryCap=LARE_LIMITS.parcelCandidates-witnesses.length;
  for(let i=0;i<Math.min(ordinaryCap,row.options.length);i++){
   b.spend();options.push(row.options[i]);links.push({kind:'ordinary',index:i});
  }
  const seen=new Set();
  for(const w of witnesses){
   b.spend();const o=row.conditionalOptions[w.optionIndex];
   if(!o||seen.has(w.optionIndex)||w.authority!=='none'||w.access!=='not-verified'||o.authority!=='none'||o.requiresRigidPlacement!==true||o.key!==w.key)return refuse('invalid-placement-witness');
   seen.add(w.optionIndex);options.push({...o,family:'rigid-relocation'});links.push({kind:'relocated',index:w.optionIndex,witness:w});
  }
  mapping.set(row.id,links);rows.push({...row,options});
 }
 if(inventory.size!==mapping.size)return refuse('invalid-owner-census');
 const combined={status:'parcel-reshape-observed',authority:'none',rows};
 const conflicts=observeP6ParcelConflicts(source,combined,b);
 if(conflicts.status!=='parcel-conflicts-observed')return refuse(conflicts.reason);
 const selection=observeP6CooperativeParcels(combined,conflicts,b);
 if(selection.status!=='cooperative-parcels-observed')return refuse(selection.reason);
 const selected=[],chosenWitnesses=[];
 for(const s of selection.selected){
  b.spend();const link=mapping.get(s.id)?.[s.index];if(!link)return refuse('missing-choice-binding');
  selected.push({id:s.id,key:s.key,index:link.index,kind:link.kind});
  if(link.witness)chosenWitnesses.push({id:s.id,witness:link.witness});
 }
 return {status:'joint-arrangement-observed',authority:'none',valid:false,landVerified:false,reason:selection.reason,
  selected,unresolved:selection.unresolved,chosenWitnesses,complete:selection.allObservedOwnersCovered,
  counts:{owners:rows.length,candidates:conflicts.counts.candidates,pairConflicts:conflicts.counts.pairConflicts,attempts:selection.attempts}};
}

// Expand the candidate inventory only in the block groups containing an
// unresolved owner. Other owners retain the already selected option.
export function focusP6JointOwners(fit,extension,b){
 const unresolved=new Set(extension.unresolved),blocks=new Set(),faces=new Set(),targets=new Set();
 for(const row of fit.rows){
  b.spend();if(!unresolved.has(row.id))continue;
  blocks.add(row.oldBlockId);for(const o of row.options){b.spend();faces.add(o.key);}
 }
 for(const row of fit.rows){
  b.spend();let hit=unresolved.has(row.id)||blocks.has(row.oldBlockId);
  for(const o of row.options){b.spend();if(faces.has(o.key))hit=true;}
  if(hit)targets.add(row.id);
 }
 return targets;
}
export function tryP6CollectiveAssembly(source,candidateRoads,extraction,e,root){
 const refuse=(reason,details=null)=>({status:'assembly-refused',reason,details,authority:'none',valid:false,landVerified:false,candidate:null});
 const remaining=root.snapshot();
 // Scheduling reserve only; all search charges reach the same root.
 // Keep capacity for transport, verification and remaining dry diagnostics.
 const work=Math.min(remaining.remainingWork-1500000,4000000),states=Math.min(remaining.remainingExpansions-512,16384);
 if(work<1||states<1)return refuse('collective-verification-reserve');
 const b=createLareBudget({work,stateExpansions:states},{parent:root,ceiling:LARE_PRESERVATION_LIMITS});
 let stage='focus';const ledger=[];
 const run=(name,fn)=>{stage=name;const before=b.snapshot().work;try{return fn();}finally{ledger.push({stage:name,work:b.snapshot().work-before});}};
 try{
 const result=focusedAssembly(source,candidateRoads,extraction,e,b,run);
 return {...result,jointWork:ledger};
 }catch(error){
  if(error instanceof LareBudgetExceeded)return refuse('collective-budget-exhausted',{resource:error.resource,stage,ledger,stats:b.snapshot()});
  throw error;
 }
}
function focusedAssembly(source,candidateRoads,extraction,e,b,run){
 const refuse=(reason,details=null)=>({status:'assembly-refused',reason,details,authority:'none',valid:false,landVerified:false,candidate:null});
 // Initial joint fallback handles only the same one-to-one block scope
 // qualified by the assembler. No topology or protection scope expansion.
 if(e.blockPlan.structural||e.identity.changed.some(x=>x.kind!=='block'))return refuse('collective-unsupported-topology');
 const targets=run('focus',()=>focusP6JointOwners(e.propertyFit,e.relocationExtension,b));
 const fit={...e.propertyFit,rows:e.propertyFit.rows.filter(r=>targets.has(r.id))};
 b.spend(Math.max(1,e.propertyFit.rows.length));
 const expanded=run('parcel-proposals',()=>observeP6ParcelReshapes(source,extraction,fit,b,{collective:true}));
 if(expanded.status!=='parcel-reshape-observed')return refuse(expanded.reason);
 const fresh=new Map(expanded.rows.map(r=>[r.id,r])),selected=new Map(e.relocationExtension.selected.map(r=>[r.id,r])),priorRigid=new Map(e.rigidTranslations.rows.map(r=>[r.id,r])),heldWitnesses=new Map(),rows=[];
 for(const row of e.parcelReshapes.rows){
  b.spend();
  if(targets.has(row.id)){
   const next=fresh.get(row.id);if(!next)return refuse('missing-expanded-owner');
   rows.push(next);continue;
  }
  const s=selected.get(row.id);
  if(!s)return refuse('unresolved-outside-focus');
  if(s.kind==='ordinary'){
   const option=row.options[s.index];if(!option)return refuse('missing-held-option');
   rows.push({...row,options:[option],conditionalOptions:[]});
  }else if(s.kind==='relocated'){
   const option=row.conditionalOptions[s.index],w=priorRigid.get(row.id)?.witness;
   if(!option||!w||w.optionIndex!==s.index||w.key!==s.key)return refuse('missing-held-witness');
   heldWitnesses.set(row.id,{...w,optionIndex:0});
   rows.push({...row,options:[],conditionalOptions:[option]});
  }else return refuse('invalid-held-choice');
 }
 const parcelReshapes={...expanded,rows};
 const empty={status:'cooperative-parcels-observed',authority:'none',selected:[]};
 const initialFixed=run('fixed-census',()=>observeP6FixedBuildings(source,parcelReshapes,empty,b));
 if(initialFixed.status!=='fixed-buildings-observed')return refuse(initialFixed.reason);
 const generated=run('rigid-proposals',()=>observeP6RigidTranslations(source,{...parcelReshapes,rows:rows.filter(r=>targets.has(r.id))},initialFixed,b,{collective:true}));
 if(generated.status!=='rigid-translations-observed')return refuse(generated.reason);
 const generatedById=new Map(generated.rows.map(r=>[r.id,r]));
 const rigid={...generated,rows:rows.map(r=>generatedById.get(r.id)??{id:r.id,witnesses:heldWitnesses.has(r.id)?[heldWitnesses.get(r.id)]:[]})};
 b.spend(Math.max(1,rows.length*3));
 const joint=run('joint-selection',()=>selectP6JointArrangement(source,parcelReshapes,rigid,b));
 if(joint.status!=='joint-arrangement-observed'||!joint.complete)return refuse(joint.reason??'incomplete-joint-selection',{counts:joint.counts??null,unresolved:joint.unresolved.length,focusedOwners:targets.size});
 const ordinary={status:'cooperative-parcels-observed',authority:'none',selected:joint.selected.filter(s=>s.kind==='ordinary')};
 const fixedBuildings=run('selected-occupancy',()=>observeP6FixedBuildings(source,parcelReshapes,ordinary,b));
 if(fixedBuildings.status!=='fixed-buildings-observed')return refuse(fixedBuildings.reason);
 const chosen=new Map(joint.chosenWitnesses.map(r=>[r.id,r.witness]));
 const rigidTranslations={...rigid,rows:rigid.rows.map(r=>({...r,witness:chosen.get(r.id)??null}))};
 const relocationExtension={status:'relocation-extension-observed',authority:'none',selected:joint.selected,unresolved:[]};
 const relocatedAccess=run('selected-access',()=>observeP6RelocatedAccess(source,extraction,parcelReshapes,rigidTranslations,relocationExtension,b));
 if(relocatedAccess.status!=='relocated-access-observed')return refuse(relocatedAccess.reason);
 aresReplayJson(joint,b);
 const assembly=run('assembly',()=>assembleP6DetachedCity(source,candidateRoads,extraction,{...e,parcelReshapes,fixedBuildings,rigidTranslations,relocationExtension,relocatedAccess},b));
 return {...assembly,jointCounts:{...joint.counts,focusedOwners:targets.size}};
}
