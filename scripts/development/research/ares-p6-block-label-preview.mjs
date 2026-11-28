// Detached preview of the existing C3 block label convention. Not a
// reservation, accepted identity allocation, retirement or ownership decision.
import {roadTopologyId} from '../../../src/core/road-crossings.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const order=(a,b)=>a<b?-1:a>b?1:0;
const fields=new Set(['id','vertices','area','ring','sector','usage','districtId']);
const charge=(b,n)=>b.spend(Math.max(1,n));
export function previewP6BlockLabels(source,plan,ownership,identity,lineage,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,valid:false,authority:'none',landVerified:false});
 if(plan?.status!=='block-plan-observed'||plan.authority!=='none'||ownership?.status!=='block-ownership-observed'||ownership.authority!=='none'||!identity?.correspondenceValid||identity.authority!=='none'||!lineage?.lineageValid||lineage.authority!=='none')return refuse('unqualified-input');
 charge(b,source.blocks.length+plan.rows.length+lineage.faces.length+ownership.ledger.length);
 const old=new Map(source.blocks.map(r=>[r.id,r]));
 const shells=new Map(plan.rows.filter(r=>r.status==='unallocated-structural-shell').map(r=>[r.key,r]));
 const proof=new Map(lineage.faces.map(r=>[r.candidateKey,r]));
 const used=new Set(),labels=new Map(),groupsSeen=new Set(),rows=[];
 for(const records of [[source.plaza],source.blocks,source.waterFaces??[],source.terrainFaces??[]]){
  for(const row of records){b.spend();if(typeof row?.id!=='string'||used.has(row.id))return refuse('invalid-face-id-inventory');used.add(row.id);}
 }
 for(const row of plan.rows){
  b.spend();
  if(row.status==='retained-record-proposal'){
   if(!old.has(row.record.id)||labels.has(row.record.id))return refuse('invalid-retained-label');
   labels.set(row.record.id,row.key);
   rows.push({key:row.key,label:row.record.id,kind:'retained',predecessorIds:row.predecessorIds,blockers:[]});
  }
 }
 // Preserve C3 group ordering and per-group candidate ordering, including
 // collision suffix behavior. Charge worst-case probes in the local used set.
 for(const [relation,entries] of [['split',identity.split],['merge',identity.merged],['many-to-many',identity.ambiguous]]){
  for(const group of entries){
   charge(b,group.oldIds.length+group.candidateKeys.length);
   const sources=group.oldIds.map(id=>old.get(id));
   const ids=new Set(group.oldIds);
   if(!sources.length||!group.candidateKeys.length||ids.size!==sources.length||sources.some(r=>!r))return refuse('invalid-group');
   for(const id of ids){b.spend();if(groupsSeen.has(id)||labels.has(id))return refuse('overlapping-groups');groupsSeen.add(id);}
   for(const k of group.candidateKeys){
    b.spend();
    const row=shells.get(k),e=proof.get(k);
    if(!row||!e||e.relation!==relation||row.relation!==relation||!row.predecessorIds.length||row.predecessorIds.some(id=>!ids.has(id)))return refuse('missing-structural-proof');
    shells.delete(k);
    const same=sources.length===1&&group.candidateKeys.length===1;
    charge(b,k.length+used.size+1);
    const label=same?sources[0].id:roadTopologyId('BLK-X',k,used);
    if(labels.has(label))return refuse('duplicate-preview-label');
    labels.set(label,k);
    const blockers=[];
    if(!e.areaVerified&&(e.choiceRequired.district||e.choiceRequired.usage))blockers.push('incomplete-ownership-coverage');
    if(e.choiceRequired.district)blockers.push('district-choice-required');
    if(e.choiceRequired.usage)blockers.push('usage-choice-required');
    for(const id of row.predecessorIds){const keys=Object.keys(old.get(id));charge(b,keys.length);if(keys.some(key=>!fields.has(key))&&!blockers.includes('opaque-predecessor'))blockers.push('opaque-predecessor');}
    rows.push({key:k,label,kind:same?'structural-same-id-preview':'new-label-preview',predecessorIds:row.predecessorIds,blockers});
   }
  }
 }
 if(shells.size||rows.length!==plan.rows.length||groupsSeen.size!==ownership.pendingOld)return refuse('incomplete-preview');
 charge(b,rows.length*rows.length+ownership.ledger.length);
 rows.sort((a,c)=>order(a.key,c.key));
 const byKey=new Map(rows.map(r=>[r.key,r.label]));
 const reverse=[];
 for(const row of ownership.ledger){
  charge(b,row.candidateKeys.length);
  const successorLabels=row.candidateKeys.map(k=>byKey.get(k));
  if(successorLabels.some(x=>!x))return refuse('missing-successor-label');
  reverse.push({oldId:row.oldId,successorLabels,wouldRetire:!successorLabels.includes(row.oldId)});
 }
 const result={status:'block-label-preview-observed',valid:false,authority:'none',landVerified:false,
  rows,reverse,newLabels:rows.filter(r=>r.kind==='new-label-preview').length,
  potentialRetirements:reverse.filter(r=>r.wouldRetire).length,
  blockedChoices:rows.filter(r=>r.blockers.length).length,
  convention:'existing-C3-face-labels',historicalNonreuse:'not-established',allocation:'not-performed',retirement:'not-authorized'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
