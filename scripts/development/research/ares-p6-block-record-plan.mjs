// Detached block reconstruction plan. No allocation, retirement, Apply,
// or claim that properties/buildings fit. Inputs are internal diagnostic results.
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
const order=(a,c)=>a<c?-1:a>c?1:0;
const cycle=(vs,b)=>{
 charge(b,2*vs.length);
 if(vs.length<3||new Set(vs).size!==vs.length)return null;
 let i=0;for(let j=1;j<vs.length;j++)if(vs[j]<vs[i])i=j;
 return JSON.stringify([...vs.slice(i),...vs.slice(0,i)]);
};
// Identity matching canonicalizes object keys. Compare all values and own
// keys irrespective of insertion order, preserving array order and signed zero.
export function equalP6BlockRecord(a,c,b){
 b.spend();
 if(Object.is(a,c))return true;
 if(!a||!c||typeof a!=='object'||typeof c!=='object'||Array.isArray(a)!==Array.isArray(c))return false;
 if(Array.isArray(a)&&a.length!==c.length)return false;
 const ak=Object.keys(a),ck=Object.keys(c);
 charge(b,ak.length+ck.length);
 return ak.length===ck.length&&ak.every(k=>Object.hasOwn(c,k)&&equalP6BlockRecord(a[k],c[k],b));
}
const detached=(v,b)=>{const json=aresReplayJson(v,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);};
export function planP6BlockRecords(source,extraction,identity,lineage,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,valid:false,authority:'none',rows:[],reverse:[],landVerified:false});
 if(!extraction?.valid||!identity?.correspondenceValid||identity.valid!==false||identity.authority!=='none'||!lineage?.lineageValid||lineage.valid!==false||lineage.authority!=='none')return refuse('unqualified-input');
 if(identity.added.length||identity.removed.length)return refuse('unmatched-blocks');
 charge(b,source.blocks.length+extraction.faces.length+lineage.faces.length+identity.preserved.length+identity.changed.length);
 const old=new Map(source.blocks.map(r=>[r.id,r])),fresh=new Map(extraction.faces.filter(f=>f.kind==='block').map(f=>[f.key,f]));
 const matches=new Map(),seenOld=new Set();
 for(const [relation,items] of [['preserved',identity.preserved],['reshaped',identity.changed]])for(const m of items){
  b.spend();if(m.kind!=='block')continue;
  if(matches.has(m.candidateKey)||seenOld.has(m.id)||!old.has(m.id)||!fresh.has(m.candidateKey))return refuse('duplicate-or-missing-match');
  matches.set(m.candidateKey,{relation,m});seenOld.add(m.id);
 }
 if(old.size!==source.blocks.length||fresh.size!==extraction.faces.filter(f=>f.kind==='block').length)return refuse('duplicate-inventory');
 const rows=[],reverse=new Map(),seen=new Set();
 for(const l of lineage.faces){
  b.spend();
  const f=fresh.get(l.candidateKey);
  if(!f||seen.has(f.key)||!l.predecessors.length||!Number.isFinite(f.area)||f.area<=1||l.faceArea!==f.area)return refuse('invalid-successor');
  seen.add(f.key);
  const ids=new Set();
  for(const predecessor of l.predecessors){
   b.spend();const id=predecessor.blockId;
   if(!old.has(id)||ids.has(id))return refuse('invalid-predecessor');
   ids.add(id);if(!reverse.has(id))reverse.set(id,[]);reverse.get(id).push(f.key);
  }
  const match=matches.get(f.key);
  if(match){
   const {m,relation}=match,prior=old.get(m.id);
   if(l.relation!==relation||ids.size!==1||!ids.has(m.id)||cycle(prior.vertices,b)!==f.key||cycle(f.vertices,b)!==f.key)return refuse('inconsistent-one-to-one');
   const record=detached(prior,b);
   if(relation==='reshaped')record.area=Math.round(f.area*100)/100;
   // Match the qualified legacy record, including opaque fields.
   if(!equalP6BlockRecord(record,m.record,b))return refuse('record-mismatch');
   rows.push({key:f.key,relation,status:'retained-record-proposal',record,predecessorIds:[m.id]});
  }else{
   if(!['split','merge','many-to-many'].includes(l.relation)||[...ids].some(id=>seenOld.has(id)))return refuse('unresolved-structural-lineage');
   // Shape shell only: no ID, ownership, retirement or arbitrary metadata selection.
   rows.push({key:f.key,relation:l.relation,status:'unallocated-structural-shell',
    geometry:{vertices:detached(f.vertices,b),area:Math.round(f.area*100)/100},
    predecessorIds:[...ids].sort(order),eligibleDistrictIds:detached(l.eligibleDistrictIds,b),
    eligibleUsages:detached(l.eligibleUsages,b),choiceRequired:detached(l.choiceRequired,b),
    opaquePredecessors:l.predecessors.filter(p=>p.hasOpaqueFields).map(p=>p.blockId)});
  }
 }
 if(seen.size!==fresh.size||reverse.size!==old.size)return refuse('incomplete-census');
 charge(b,rows.length*rows.length+reverse.size*reverse.size);
 const back=[...reverse].map(([oldId,keys])=>{charge(b,keys.length*keys.length);return {oldId,candidateKeys:keys.sort(order)};}).sort((a,c)=>order(a.oldId,c.oldId));
 if(aresReplayJson(back,b)!==aresReplayJson(lineage.reverse,b))return refuse('reverse-lineage-mismatch');
 rows.sort((a,c)=>order(a.key,c.key));
 const retained=rows.filter(r=>r.status==='retained-record-proposal').length;
 return detached({status:'block-plan-observed',valid:false,authority:'none',landVerified:false,rows,reverse:back,
  retained,structural:rows.length-retained,allocation:'not-authorized',retirement:'not-authorized'},b);
}
