// C1b3a: detached compatibility evidence, not a cooperative solution.
import {shapeWellFormed,shapesOverlapInterior} from '../../../src/core/building-validation.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {LARE_LIMITS} from '../../../src/core/reconciliation-budget.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
function box(r,b){
 const q=[Infinity,Infinity,-Infinity,-Infinity];
 for(const p of r){b.spend();q[0]=Math.min(q[0],p.x);q[1]=Math.min(q[1],p.y);q[2]=Math.max(q[2],p.x);q[3]=Math.max(q[3],p.y);}
 return q;
}
function validRing(r,b){const n=Array.isArray(r)?r.length:0;charge(b,8*n*n+n);return shapeWellFormed(r);}
function overlap(a,c,b){
 b.spend();
 if(a.box[2]<c.box[0]-1e-6||c.box[2]<a.box[0]-1e-6||a.box[3]<c.box[1]-1e-6||c.box[3]<a.box[1]-1e-6)return false;
 charge(b,32*a.ring.length*c.ring.length+8*(a.ring.length+c.ring.length));
 return shapesOverlapInterior(a.ring,c.ring);
}
export function observeP6ParcelConflicts(source,reshapes,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(reshapes?.status!=='parcel-reshape-observed'||reshapes.authority!=='none'||!Array.isArray(reshapes.rows))return refuse('unqualified-input');
 const inventory=new Map(),observed=new Map(),fixed=[],candidates=[],unknown=[];
 for(const p of source.properties){b.spend();if(inventory.has(p.id))return refuse('duplicate-property');inventory.set(p.id,p);}
 for(const row of reshapes.rows){
  b.spend();if(!inventory.has(row.id)||observed.has(row.id)||!Array.isArray(row.options)||row.options.length>LARE_LIMITS.parcelCandidates)return refuse('invalid-candidate-census');
  observed.set(row.id,row);
  for(let i=0;i<row.options.length;i++){
   b.spend();const o=row.options[i];
   if(o.authority!=='none'||!validRing(o.boundary,b))return refuse('invalid-candidate-ring');
   candidates.push({id:row.id,index:i,key:o.key,ring:o.boundary,box:box(o.boundary,b)});
  }
 }
 // Unaffected and protected properties are fixed context. Affected rows
 // without a proposal are unresolved, NOT cleared or authorized for removal.
 for(const p of inventory.values()){
  b.spend();const row=observed.get(p.id);
  if(row?.options.length)continue;
  const kind=!row||row.classification==='protected'?'fixed-context':'unresolved-original';
  if(!validRing(p.boundary,b)){unknown.push({id:p.id,kind});continue;}
  fixed.push({id:p.id,kind,ring:p.boundary,box:box(p.boundary,b)});
 }
 const rows=[],pairs=[];
 for(let i=0;i<candidates.length;i++){
  b.spend();const a=candidates[i],fixedHits=[],unresolvedHits=[];
  for(const c of fixed)if(overlap(a,c,b))(c.kind==='fixed-context'?fixedHits:unresolvedHits).push(c.id);
  for(let j=i+1;j<candidates.length;j++){
   b.spend();const c=candidates[j];
   if(a.id!==c.id&&overlap(a,c,b))pairs.push({a:[a.id,a.index],b:[c.id,c.index]});
  }
  rows.push({id:a.id,index:a.index,key:a.key,fixedHits,unresolvedHits});
 }
 const counts={candidates:rows.length,fixedBlocked:0,unresolvedContact:0,pairConflicts:pairs.length,unknownContext:unknown.length};
 for(const row of rows){b.spend();if(row.fixedHits.length)counts.fixedBlocked++;if(row.unresolvedHits.length)counts.unresolvedContact++;}
 const result={status:'parcel-conflicts-observed',authority:'none',valid:false,landVerified:false,rows,pairs,unknown,counts,
  coverage:'property-interior-only',selection:'not-performed',unresolvedOriginals:'not-authorized-for-removal'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
