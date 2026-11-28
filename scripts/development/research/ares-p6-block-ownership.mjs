// Detached ownership/identity census. Face ancestry is not geometric parcel
// ownership. No block ID allocation, retirement, or permission is granted.
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {ALLOCATION_TYPES} from '../../../src/core/identity-allocation.js';
const order=(a,b)=>a<b?-1:a>b?1:0;
const charge=(b,n)=>b.spend(Math.max(1,n));
const collections=['properties','plots','buildings','openSpaces'];
const key=(collection,id)=>JSON.stringify([collection,id]);
export function observeP6BlockOwnership(source,plan,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,valid:false,authority:'none',landVerified:false});
 if(plan?.status!=='block-plan-observed'||plan.valid!==false||plan.authority!=='none'||!Array.isArray(plan.rows)||!Array.isArray(plan.reverse))return refuse('unqualified-plan');
 const blocks=new Map(),faces=new Map(),reverse=new Map();
 for(const block of source.blocks){
  b.spend();
  if(typeof block.id!=='string'||blocks.has(block.id))return refuse('invalid-block-inventory');
  blocks.set(block.id,block);reverse.set(block.id,[]);
 }
 for(const row of plan.rows){
  b.spend();
  if(typeof row.key!=='string'||faces.has(row.key)||!Array.isArray(row.predecessorIds)||!row.predecessorIds.length)return refuse('invalid-face-inventory');
  faces.set(row.key,row);
  const seen=new Set();
  for(const id of row.predecessorIds){
   b.spend();
   if(!blocks.has(id)||seen.has(id))return refuse('invalid-predecessor');
   seen.add(id);reverse.get(id).push(row.key);
  }
  if(row.status==='retained-record-proposal'){
   if(seen.size!==1||!seen.has(row.record?.id)||!['preserved','reshaped'].includes(row.relation))return refuse('invalid-retained-identity');
  }else if(row.status!=='unallocated-structural-shell'||!['split','merge','many-to-many'].includes(row.relation)||row.record!==undefined||row.geometry?.id!==undefined)return refuse('invalid-structural-identity');
 }
 charge(b,plan.reverse.length+blocks.size);
 const reported=new Map();
 for(const row of plan.reverse){
  b.spend();if(reported.has(row.oldId)||!Array.isArray(row.candidateKeys))return refuse('invalid-reverse');
  reported.set(row.oldId,row.candidateKeys);
 }
 if(reported.size!==blocks.size)return refuse('invalid-reverse');
 const ledger=[],byId=new Map();
 for(const [id,keys] of reverse){
  charge(b,keys.length*keys.length);
  keys.sort(order);
  const claimed=reported.get(id);
  if(!keys.length||!claimed||claimed.length!==keys.length||keys.some((k,i)=>k!==claimed[i]))return refuse('reverse-mismatch');
  const retained=keys.filter(k=>faces.get(k).status==='retained-record-proposal');
  if(retained.length&&(keys.length!==1||faces.get(retained[0]).record.id!==id))return refuse('conflicting-survivor');
  const entry={oldId:id,candidateKeys:keys,retainedKey:retained[0]??null,
   disposition:retained.length?'retained':'structural-choice-pending',references:[]};
  ledger.push(entry);byId.set(id,entry);
 }
 const unbound=[],seenRefs=new Set();
 function addRef(collection,id,blockId){
  b.spend();
  if(typeof id!=='string')return false;
  const ref={collection,id},k=key(collection,id);
  if(seenRefs.has(k))return false;
  seenRefs.add(k);
  if(blockId==null){unbound.push(ref);return true;}
  const owner=byId.get(blockId);
  if(!owner)return false;
  owner.references.push(ref);return true;
 }
 for(const collection of collections){
  if(!Array.isArray(source[collection]))return refuse('missing-land-inventory');
  for(const record of source[collection])if(!addRef(collection,record.id,record.blockId))return refuse('invalid-land-reference');
 }
 // District memberships are contextual references, not permission to change
 // the district or to automatically transfer membership to another block.
 const districtLinks=[],districtIds=new Set();
 for(const district of source.districts??[]){
  b.spend();
  if(typeof district.id!=='string'||districtIds.has(district.id)||!Array.isArray(district.blockIds))return refuse('invalid-district-inventory');
  districtIds.add(district.id);
  const seen=new Set();
  for(const id of district.blockIds){
   b.spend();
   if(!byId.has(id)||seen.has(id))return refuse('invalid-district-reference');
   seen.add(id);districtLinks.push({districtId:district.id,oldId:id});
  }
 }
 charge(b,ledger.length*ledger.length+unbound.length*unbound.length+districtLinks.length*Math.max(1,Math.ceil(Math.log2(districtLinks.length+1))));
 ledger.sort((a,c)=>order(a.oldId,c.oldId));
 const refOrder=(a,c)=>order(a.collection,c.collection)||order(a.id,c.id);
 for(const row of ledger){charge(b,row.references.length*row.references.length);row.references.sort(refOrder);}
 unbound.sort(refOrder);districtLinks.sort((a,c)=>order(a.districtId,c.districtId)||order(a.oldId,c.oldId));
 const pendingFaces=[];
 for(const row of faces.values()){
  b.spend();
  if(row.status==='unallocated-structural-shell')pendingFaces.push({key:row.key,eligibleOldIds:[...row.predecessorIds],districtChoiceRequired:row.choiceRequired.district,usageChoiceRequired:row.choiceRequired.usage,opaquePredecessors:[...row.opaquePredecessors]});
 }
 charge(b,pendingFaces.length*pendingFaces.length);pendingFaces.sort((a,c)=>order(a.key,c.key));
 const pendingOld=ledger.filter(row=>!row.retainedKey).length;
 const result={status:'block-ownership-observed',valid:false,authority:'none',landVerified:false,
  ledger,unbound,districtLinks,pendingFaces,retained:ledger.length-pendingOld,pendingOld,
  minimumNewIds:Math.max(0,pendingFaces.length-pendingOld),
  minimumRetirements:Math.max(0,pendingOld-pendingFaces.length),
  allocationTypeRegistered:Object.hasOwn(ALLOCATION_TYPES,'block'),allocation:'not-performed',retirement:'not-authorized',
  ownership:'candidate-ancestry-only'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));
 return JSON.parse(json);
}
