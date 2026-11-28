// P6 collective fallback: candidate-bearing properties are solved together.
// Existing strict assembler and independent verifier remain mandatory.
import {observeP6ParcelReshapes} from './ares-p6-parcel-reshapes.mjs';
import {observeP6ParcelConflicts} from './ares-p6-parcel-conflicts.mjs';
import {observeP6CooperativeParcels} from './ares-p6-cooperative-parcels.mjs';
import {observeP6FixedBuildings} from './ares-p6-fixed-buildings.mjs';
import {observeP6RigidTranslations} from './ares-p6-rigid-translations.mjs';
import {observeP6RelocatedAccess} from './ares-p6-same-frontage-access.mjs';
import {assembleP6DetachedCity} from './ares-p6-detached-city.mjs';
import {LARE_LIMITS} from '../../../src/core/reconciliation-budget.js';
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

export function tryP6CollectiveAssembly(source,candidateRoads,extraction,e,b){
 const refuse=(reason,details=null)=>({status:'assembly-refused',reason,details,authority:'none',valid:false,landVerified:false,candidate:null});
 // Initial joint fallback handles only the same one-to-one block scope
 // qualified by the assembler. No topology or protection scope expansion.
 if(e.blockPlan.structural||e.identity.changed.some(x=>x.kind!=='block'))return refuse('collective-unsupported-topology');
 const parcelReshapes=observeP6ParcelReshapes(source,extraction,e.propertyFit,b,{collective:true});
 if(parcelReshapes.status!=='parcel-reshape-observed')return refuse(parcelReshapes.reason);
 const empty={status:'cooperative-parcels-observed',authority:'none',selected:[]};
 const initialFixed=observeP6FixedBuildings(source,parcelReshapes,empty,b);
 if(initialFixed.status!=='fixed-buildings-observed')return refuse(initialFixed.reason);
 const rigid=observeP6RigidTranslations(source,parcelReshapes,initialFixed,b,{collective:true});
 if(rigid.status!=='rigid-translations-observed')return refuse(rigid.reason);
 const joint=selectP6JointArrangement(source,parcelReshapes,rigid,b);
 if(joint.status!=='joint-arrangement-observed'||!joint.complete)return refuse(joint.reason??'incomplete-joint-selection',{counts:joint.counts??null,unresolved:joint.unresolved.length});
 const ordinary={status:'cooperative-parcels-observed',authority:'none',selected:joint.selected.filter(s=>s.kind==='ordinary')};
 const fixedBuildings=observeP6FixedBuildings(source,parcelReshapes,ordinary,b);
 if(fixedBuildings.status!=='fixed-buildings-observed')return refuse(fixedBuildings.reason);
 const chosen=new Map(joint.chosenWitnesses.map(r=>[r.id,r.witness]));
 const rigidTranslations={...rigid,rows:rigid.rows.map(r=>({...r,witness:chosen.get(r.id)??null}))};
 const relocationExtension={status:'relocation-extension-observed',authority:'none',selected:joint.selected,unresolved:[]};
 const relocatedAccess=observeP6RelocatedAccess(source,extraction,parcelReshapes,rigidTranslations,relocationExtension,b);
 if(relocatedAccess.status!=='relocated-access-observed')return refuse(relocatedAccess.reason);
 aresReplayJson(joint,b);
 const assembly=assembleP6DetachedCity(source,candidateRoads,extraction,{...e,parcelReshapes,fixedBuildings,rigidTranslations,relocationExtension,relocatedAccess},b);
 return {...assembly,jointCounts:joint.counts};
}
