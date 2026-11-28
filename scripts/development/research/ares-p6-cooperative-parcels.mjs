// C1b3b: bounded cooperative candidate selection evidence.
// Never accepts a city or permits dropping an unresolved property.
import {LARE_LIMITS} from '../../../src/core/reconciliation-budget.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const cmp=(a,c)=>a<c?-1:a>c?1:0;
const charge=(b,n)=>b.spend(Math.max(1,n));
const ref=(id,index)=>JSON.stringify([id,index]);
export function observeP6CooperativeParcels(reshapes,conflicts,b){
 if(!b?.spend||!b?.expand||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(reshapes?.status!=='parcel-reshape-observed'||conflicts?.status!=='parcel-conflicts-observed'||reshapes.authority!=='none'||conflicts.authority!=='none')return refuse('unqualified-input');
 const entries=new Map(),owners=new Map(),unresolved=[];
 for(const row of reshapes.rows){
  b.spend();if(owners.has(row.id)||!Array.isArray(row.options)||row.options.length>LARE_LIMITS.parcelCandidates)return refuse('invalid-owner-census');
  const owner={id:row.id,choices:[]};owners.set(row.id,owner);
  if(!row.options.length)unresolved.push(row.id);
  for(let i=0;i<row.options.length;i++){
   b.spend();const o=row.options[i];
   if(o.authority!=='none')return refuse('invalid-option-authority');
   const key=ref(row.id,i);entries.set(key,{key,id:row.id,index:i,faceKey:o.key,family:o.family,allowed:false,seen:false,neighbors:new Set()});
  }
 }
 for(const row of conflicts.rows){
  b.spend();const e=entries.get(ref(row.id,row.index));
  if(!e||e.seen||row.key!==e.faceKey||!Array.isArray(row.fixedHits)||!Array.isArray(row.unresolvedHits))return refuse('invalid-compatibility-census');
  e.seen=true;e.allowed=!row.fixedHits.length&&!row.unresolvedHits.length;
  if(e.allowed)owners.get(e.id).choices.push(e);
 }
 for(const e of entries.values()){b.spend();if(!e.seen)return refuse('missing-compatibility-row');}
 for(const pair of conflicts.pairs){
  b.spend();if(!Array.isArray(pair.a)||pair.a.length!==2||!Array.isArray(pair.b)||pair.b.length!==2)return refuse('invalid-conflict-pair');
  const a=entries.get(ref(...pair.a)),c=entries.get(ref(...pair.b));
  if(!a||!c||a.id===c.id||a.neighbors.has(c.key))return refuse('invalid-conflict-pair');
  a.neighbors.add(c.key);c.neighbors.add(a.key);
 }
 const active=[];
 for(const owner of owners.values()){
  b.spend();if(!reshapes.rows.length)continue;
  if(owner.choices.length){
   charge(b,owner.choices.length*Math.max(1,Math.ceil(Math.log2(owner.choices.length+1))));
   owner.choices.sort((a,c)=>Number(c.family==='world-preserved')-Number(a.family==='world-preserved')||a.index-c.index);
  }
  active.push(owner);
 }
 const unresolvedSet=new Set(unresolved),groups=active.filter(o=>!unresolvedSet.has(o.id));
 charge(b,groups.length*Math.max(1,Math.ceil(Math.log2(groups.length+1))));
 groups.sort((a,c)=>a.choices.length-c.choices.length||cmp(a.id,c.id));
 const selection=[],chosen=new Set(),cursor=new Array(groups.length).fill(0);
 let depth=0,attempts=0,reason=null;
 if(conflicts.unknown.length)reason='unknown-context';
 else if(groups.length>LARE_LIMITS.affectedParcels)reason='selection-scope-limit';
 else if(groups.some(g=>!g.choices.length))reason='blocked-owner';
 // Iterative deterministic backtracking. All candidate-bearing owners must
 // receive a choice or return no selection; unresolved originals stay fixed.
 while(!reason&&depth<groups.length){
  b.spend();const group=groups[depth];
  if(cursor[depth]>=group.choices.length){
   cursor[depth]=0;
   if(depth===0){reason='no-compatible-combination';break;}
   depth--;chosen.delete(selection.pop().key);continue;
  }
  if(attempts>=LARE_LIMITS.stateExpansions){reason='selection-search-limit';break;}
  const option=group.choices[cursor[depth]++];b.expand();attempts++;
  let compatible=true;
  for(const key of chosen){b.spend();if(option.neighbors.has(key)){compatible=false;break;}}
  if(!compatible)continue;
  selection.push(option);chosen.add(option.key);depth++;
 }
 const complete=!reason&&depth===groups.length;
 const selected=complete?selection.map(o=>({id:o.id,index:o.index,key:o.faceKey,family:o.family})):[];
 charge(b,selected.length*Math.max(1,Math.ceil(Math.log2(selected.length+1))));
 selected.sort((a,c)=>cmp(a.id,c.id));
 charge(b,unresolved.length*Math.max(1,Math.ceil(Math.log2(unresolved.length+1))));
 unresolved.sort(cmp);
 const result={status:'cooperative-parcels-observed',authority:'none',valid:false,landVerified:false,
  selection:complete?'compatible-candidate-bearing-subset':'no-selection',reason,selected,unresolved,attempts,
  candidateBearingOwners:groups.length,allObservedOwnersCovered:complete&&!unresolved.length,
  coverage:'property-interior-compatibility-only',unresolvedOriginals:'not-authorized-for-removal'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
