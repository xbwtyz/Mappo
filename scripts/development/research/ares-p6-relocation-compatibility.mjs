// D1b3a: combine ordinary parcel candidates with rigid placement witnesses
// for an interior compatibility experiment. Never accepts a city.
import {observeP6ParcelConflicts} from './ares-p6-parcel-conflicts.mjs';
import {observeP6CooperativeParcels} from './ares-p6-cooperative-parcels.mjs';
import {LARE_LIMITS} from '../../../src/core/reconciliation-budget.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {shapeContained,shapeWellFormed,shapesOverlapInterior} from '../../../src/core/building-validation.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
export function observeP6RelocationCompatibility(source,reshapes,rigid,b){
 if(!b?.spend||!b?.expand||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(reshapes?.status!=='parcel-reshape-observed'||rigid?.status!=='rigid-translations-observed'||reshapes.authority!=='none'||rigid.authority!=='none')return refuse('unqualified-input');
 const index=records=>{const m=new Map();for(const r of records){b.spend();if(typeof r.id!=='string'||m.has(r.id))return null;m.set(r.id,r);}return m;};
 const properties=index(source.properties),base=index(reshapes.rows),placements=index(rigid.rows);
 if(!properties||!base||!placements||base.size!==placements.size)return refuse('invalid-owner-census');
 const rows=[],promoted=new Set();
 for(const row of base.values()){
  b.spend();const p=properties.get(row.id),placement=placements.get(row.id);
  if(!p||!placement)return refuse('missing-owner');
  const w=placement.witness;
  if(!w){rows.push(row);continue;}
  if(row.options.length||placement.classification!=='placementObserved'||w.authority!=='none'||w.access!=='not-verified'||!Array.isArray(w.buildings))return refuse('invalid-relocation-witness');
  const o=row.conditionalOptions?.[w.optionIndex];
  if(!o||o.authority!=='none'||o.key!==w.key||o.requiresRigidPlacement!==true||o.frontageRoadId!==p.frontageRoadId)return refuse('invalid-conditional-option');
  charge(b,p.buildingIds.length+w.buildings.length);
  if(w.buildings.length!==p.buildingIds.length||w.buildings.some((x,i)=>x.id!==p.buildingIds[i]||x.authority!=='none'))return refuse('invalid-building-census');
  for(const building of w.buildings){
   b.spend();
   const ring=building.geometry?.regions?.[0]?.ring;
   if(!Array.isArray(ring)||building.geometry.regions.length!==1)return refuse('unsupported-witness');
   charge(b,8*ring.length*o.boundary.length);
   if(!shapeContained(ring,o.boundary))return refuse('witness-outside-property');
  }
  promoted.add(row.id);rows.push({...row,options:[{...o,family:'rigid-relocation'}]});
 }
 const combined={status:'parcel-reshape-observed',authority:'none',rows};
 const conflicts=observeP6ParcelConflicts(source,combined,b);
 if(conflicts.status!=='parcel-conflicts-observed')return refuse('combined-conflicts-'+conflicts.reason);
 const cooperative=observeP6CooperativeParcels(combined,conflicts,b);
 if(cooperative.status!=='cooperative-parcels-observed')return refuse('combined-selection-'+cooperative.reason);
 const counts={ordinaryCandidates:0,relocationCandidates:promoted.size,relocationFixedBlocked:0,relocationUnresolvedContact:0,relocationPairConflicts:0,selectedOrdinary:0,selectedRelocated:0};
 for(const row of rows){b.spend();if(!promoted.has(row.id)&&row.options.length)counts.ordinaryCandidates++;}
 for(const row of conflicts.rows){b.spend();if(promoted.has(row.id)){if(row.fixedHits.length)counts.relocationFixedBlocked++;if(row.unresolvedHits.length)counts.relocationUnresolvedContact++;}}
 for(const pair of conflicts.pairs){b.spend();if(promoted.has(pair.a[0])||promoted.has(pair.b[0]))counts.relocationPairConflicts++;}
 for(const s of cooperative.selected){b.spend();if(promoted.has(s.id))counts.selectedRelocated++;else counts.selectedOrdinary++;}
 const result={status:'relocation-compatibility-observed',authority:'none',valid:false,landVerified:false,counts,conflicts,cooperative,
  coverage:'combined-property-interior-only',access:'not-verified',unresolvedOriginals:'not-authorized-for-removal'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}

// D1b3b: conservative monotonic extension of the existing ordinary
// selection. Rejected owners retain their original boundary as an obstacle.
// No existing choice is sacrificed; no claim of maximal recovery.
export function observeP6RelocationExtension(source,reshapes,rigid,ordinary,compatibility,b){
 if(!b?.spend||!b?.expand||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(reshapes?.status!=='parcel-reshape-observed'||rigid?.status!=='rigid-translations-observed'||ordinary?.status!=='cooperative-parcels-observed'||compatibility?.status!=='relocation-compatibility-observed'||[reshapes,rigid,ordinary,compatibility].some(x=>x.authority!=='none'))return refuse('unqualified-input');
 const index=records=>{const m=new Map();for(const r of records){b.spend();if(typeof r.id!=='string'||m.has(r.id))return null;m.set(r.id,r);}return m;};
 const properties=index(source.properties),base=index(reshapes.rows),placements=index(rigid.rows),baseline=index(ordinary.selected);
 if(!properties||!base||!placements||!baseline||base.size!==placements.size)return refuse('invalid-owner-census');
 const pack=ring=>{
  const n=Array.isArray(ring)?ring.length:0;charge(b,8*n*n+n);
  if(!shapeWellFormed(ring))return null;
  const box=[Infinity,Infinity,-Infinity,-Infinity];
  for(const p of ring){b.spend();box[0]=Math.min(box[0],p.x);box[1]=Math.min(box[1],p.y);box[2]=Math.max(box[2],p.x);box[3]=Math.max(box[3],p.y);}
  return {ring,box};
 };
 const overlaps=(x,y)=>{
  b.spend();const a=x.box,c=y.box;
  if(a[2]<c[0]-1e-6||c[2]<a[0]-1e-6||a[3]<c[1]-1e-6||c[3]<a[1]-1e-6)return false;
  charge(b,32*x.ring.length*y.ring.length+8*(x.ring.length+y.ring.length));
  return shapesOverlapInterior(x.ring,y.ring);
 };
 const live=new Map(),selected=[],pending=new Map(),unknown=[];
 for(const p of properties.values()){
  b.spend();const s=baseline.get(p.id),r=base.get(p.id);
  let ring=p.boundary;
  if(s){
   const o=r?.options[s.index];if(!o||o.key!==s.key||o.authority!=='none')return refuse('invalid-baseline-option');
   ring=o.boundary;selected.push({id:p.id,key:o.key,index:s.index,kind:'ordinary'});
  }
  const shape=pack(ring);if(!shape)unknown.push(p.id);else live.set(p.id,shape);
 }
 if(selected.length!==baseline.size)return refuse('missing-baseline-owner');
 for(const r of base.values()){
  b.spend();const p=properties.get(r.id),placement=placements.get(r.id);
  if(!p||!placement)return refuse('missing-owner');
  const w=placement.witness;if(!w)continue;
  if(baseline.has(r.id)||r.options.length||placement.classification!=='placementObserved'||w.authority!=='none'||w.access!=='not-verified')return refuse('invalid-relocation-witness');
  const o=r.conditionalOptions?.[w.optionIndex];
  if(!o||o.authority!=='none'||o.key!==w.key||o.frontageRoadId!==p.frontageRoadId||o.requiresRigidPlacement!==true||!Array.isArray(w.buildings)||w.buildings.length!==p.buildingIds.length)return refuse('invalid-conditional-option');
  const shape=pack(o.boundary);if(!shape)return refuse('invalid-conditional-ring');
  for(let i=0;i<w.buildings.length;i++){
   b.spend();const building=w.buildings[i],ring=building.geometry?.regions?.[0]?.ring;
   if(building.id!==p.buildingIds[i]||building.authority!=='none'||building.geometry?.regions?.length!==1||!Array.isArray(ring))return refuse('invalid-building-witness');
   charge(b,8*ring.length*o.boundary.length);if(!shapeContained(ring,o.boundary))return refuse('witness-outside-property');
  }
  pending.set(r.id,{id:r.id,key:o.key,index:w.optionIndex,shape,blockers:[]});
 }
 let reason=null,attempts=0,passes=0;
 if(ordinary.selection!=='compatible-candidate-bearing-subset')reason='baseline-unavailable';
 else if(unknown.length)reason='unknown-context';
 else if(base.size>LARE_LIMITS.affectedParcels)reason='scope-limit';
 // Keep the original qualified choices and all other property boundaries.
 // A later accepted relocation may release a blocker, so retry after progress.
 let progress=true;
 while(!reason&&progress&&pending.size){
  progress=false;passes++;
  for(const [id,candidate] of pending){
   b.spend();
   if(attempts>=LARE_LIMITS.stateExpansions){reason='extension-search-limit';break;}
   b.expand();attempts++;
   const blockers=[];
   for(const [otherId,shape] of live){
    b.spend();if(otherId!==id&&overlaps(candidate.shape,shape))blockers.push(otherId);
   }
   candidate.blockers=blockers;
   if(blockers.length)continue;
   live.set(id,candidate.shape);selected.push({id,key:candidate.key,index:candidate.index,kind:'relocated'});
   pending.delete(id);progress=true;
  }
 }
 const selectedIds=new Set(),counts={ordinary:0,relocated:0,unresolved:0};
 for(const s of selected){b.spend();selectedIds.add(s.id);counts[s.kind]++;}
 const unresolved=[];
 for(const r of base.values()){b.spend();if(!selectedIds.has(r.id))unresolved.push(r.id);}
 counts.unresolved=unresolved.length;
 const blockers=[];for(const c of pending.values()){b.spend();blockers.push({id:c.id,blockers:c.blockers});}
 const result={status:'relocation-extension-observed',authority:'none',valid:false,landVerified:false,counts,selected,unresolved,blockers,unknown,attempts,passes,reason,
  coverage:'monotonic-property-interior-extension-only',access:'not-verified',unresolvedOriginals:'not-authorized-for-removal'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
