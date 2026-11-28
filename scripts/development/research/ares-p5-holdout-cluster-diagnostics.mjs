import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {holdoutLockedRow,HOLDOUT_OPTIONS} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {measureContactCover,measureConnectedFour} from './ares-p5-holdout-cover.mjs';

const jobs=[140838411129,140838411150,140838411151,140838411152,140838411153,140838411154,140838411165,140838411171,140838411196,140838411198,140838411202,140838411204,140838411217,140838411336,140838411365,140838411437];
const archived=new Map();
for(const job of jobs){
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-constraints-46099461897-'+job+'.json',import.meta.url),'utf8'));
 if(e.run!==46099461897||e.attempt!==1||e.source!=='2706daaec197228defc68cbf352b588546cac47f'||e.job!==job)throw Error('Constraint archive identity changed.');
 for(const r of e.rows){
  const lock=holdoutLockedRow(r.caseId);
  if(archived.has(r.caseId)||r.source!==lock.source||r.authority!=='none'||r.category!=='diagnosed'||r.morphology!==lock.options.morphology||r.group!==lock.group||JSON.stringify(r.offset)!==JSON.stringify(lock.offset))throw Error('Constraint archive mismatch.');
  archived.set(r.caseId,riFreeze(r));
 }
}
if(archived.size!==100)throw Error('Incomplete constraint archive.');
export const CLUSTER_CASES=Object.freeze([...archived.values()].filter(r=>r.hybridCategory==='search-refused').map(r=>r.caseId).sort());
if(CLUSTER_CASES.length!==29)throw Error('Unexpected cluster cohort.');
const root=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
export async function diagnoseHoldoutCluster(caseId){
 const lock=holdoutLockedRow(caseId),r=archived.get(caseId);
 if(!CLUSTER_CASES.includes(caseId))throw Error('Only frozen unresolved holdout cases eligible.');
 const budget=root(),base={caseId,source:lock.source,morphology:r.morphology,group:r.group,offset:r.offset,authority:'none'};
 try{
  const f=materializeLockedRtreCase(caseId),before=aresReplayJson(f.project,budget),bytes=Buffer.from(before,'utf8');
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(createHash('sha256').update(bytes).digest('hex')!==lock.source)throw Error('Cluster source mismatch.');
  const report=await inspectFreshRtreNeighborhood(caseId,{mode:HOLDOUT_OPTIONS.mode,maxObjects:HOLDOUT_OPTIONS.maxObjects,maxHops:HOLDOUT_OPTIONS.maxHops},budget);
  if(report.snapshotFingerprint!==lock.source||report.status!=='research-eligible')throw Error('Cluster eligibility mismatch.');
  const selected=new Set(report.requested.map(n=>n.ref.id)),eligible=new Set(report.eligibleJunctions.map(n=>n.ref.id));
  if(eligible.size!==r.constraints.eligibleNeighborCount)throw Error('Eligible count changed.');
  const city=f.project.city,roads=new Map(),nodes=new Map(),raw=new Map();
  for(const n of city.nodes){budget.spend();nodes.set(n.id,n);raw.set(n.id,[]);}
  for(const road of city.roads){budget.spend();roads.set(road.id,road);raw.get(road.a).push(road.b);raw.get(road.b).push(road.a);}
  const pairs=r.constraints.pairs.map(p=>{
   budget.spend(8);const ids=[...new Set(p.roadIds.flatMap(id=>{const road=roads.get(id);return [road.a,road.b];}).filter(id=>eligible.has(id)&&!selected.has(id)))].sort();
   if(JSON.stringify(ids)!==JSON.stringify(p.eligibleNeighborEndpoints))throw Error('Endpoint eligibility changed.');
   return {...p,eligibleNeighborEndpoints:ids};
  });
  const adj=new Map();
  for(const id of [...eligible].sort()){
   const q=[id],seen=new Set(q),next=new Set();
   for(const n of q)for(const v of raw.get(n)){budget.spend();if(selected.has(v)&&!seen.has(v)){seen.add(v);q.push(v);}else if(v!==id&&eligible.has(v))next.add(v);}
   adj.set(id,[...next].sort());
  }
  const geometry=pairs.map(p=>p.eligibleNeighborEndpoints);
  // Optimistic relaxation: an initially locally eligible interior split is
  // treated as free coverage. Reclassification after motion, order, global
  // closure and final/swept verification remain required in future work.
  const mandatory=pairs.filter(p=>!(p.status==='research-contact-only'&&p.kind==='interior-interior'));
  const combined=mandatory.map(p=>p.eligibleNeighborEndpoints);
  const arms={};
  for(const [name,clauses] of [['geometry',geometry],['optimisticSplit',combined]]){
   // Keep both arms inside the existing shared root; no budget reset.
   const cover=measureContactCover(clauses,budget);
   const connected=cover.status==='no-endpoint-cover'?{status:'no-endpoint-cover',witness:null}:cover.lower>4?{status:'requires-more-than-four',witness:null}:measureConnectedFour(clauses,adj,budget);
   for(const witness of [cover.witness,connected.witness])if(witness!==null){
    if(witness.some(id=>!eligible.has(id)||selected.has(id))||!clauses.every(c=>c.some(id=>witness.includes(id))))throw Error('Invalid cover witness.');
   }
   arms[name]={clauses:clauses.length,cover,connected};
  }
  const degree={};
  for(const id of selected){budget.spend();const d=raw.get(id).length;degree[d]=(degree[d]??0)+1;}
  const counts={};for(const p of pairs){budget.spend();counts[p.kind]=(counts[p.kind]??0)+1;}
  const result={...base,category:'diagnosed',selectedCount:selected.size,eligibleCount:eligible.size,selectedDegreeHistogram:degree,contactKinds:counts,contactPairs:pairs.length,optimisticallySplittable:pairs.length-mandatory.length,arms};
  if(aresReplayJson(f.project,budget)!==before)throw Error('Cluster diagnostic mutated source.');
  aresReplayJson(result,budget);return riFreeze({...result,stats:budget.snapshot()});
 }catch(e){if(e instanceof LareBudgetExceeded)return riFreeze({...base,category:'diagnostic-work-limit',reason:e.resource,stats:budget.snapshot()});throw e;}
}
