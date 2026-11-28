// D1b3a: combine ordinary parcel candidates with rigid placement witnesses
// for an interior compatibility experiment. Never accepts a city.
import {observeP6ParcelConflicts} from './ares-p6-parcel-conflicts.mjs';
import {observeP6CooperativeParcels} from './ares-p6-cooperative-parcels.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {shapeContained} from '../../../src/core/building-validation.js';
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
