import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
import { materializeLockedRtreCase } from './ares-rtre-locked-recipes.mjs';
import { inspectFreshRtreNeighborhood } from './ares-rtre-fresh-neighborhood.mjs';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { segmentCuts } from '../../../src/core/boundary.js';
import { createSpatialPreservationBudget } from '../../../src/core/spatial-recovery-contract.js';
import { riCompare,riFreeze } from '../../../src/core/road-impact-model.js';

export const X_MANIFEST=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4x-x1x2.json',import.meta.url),'utf8')));
const point=p=>({x:p.x,y:p.y});
const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const pairKey=(code,ids)=>JSON.stringify([code,[...ids].sort(riCompare)]);
const chargeSort=(n,b)=>b.spend(Math.max(1,n*Math.ceil(Math.log2(n+1))));
const equal=(a,b)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y);
// Observed pair geometry only: signed orientation values and contact
// parameters are evidence, not a linear inequality or a solved constraint.
function pairEvidence(a,b,budget){
  budget.spend(16);
  return {orientations:[orient(a.a,a.b,b.a),orient(a.a,a.b,b.b),orient(b.a,b.b,a.a),orient(b.a,b.b,a.b)],
    cutsAB:segmentCuts(a.a,a.b,b.a,b.b),cutsBA:segmentCuts(b.a,b.b,a.a,a.b)};
}
function snapshot(id,budget){
  const f=materializeLockedRtreCase('g:'+id),text=aresReplayJson(f.project,budget),bytes=Buffer.from(text,'utf8');
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  return {f,text,hash:createHash('sha256').update(bytes).digest('hex')};
}
function indexRoads(city,positions,budget){
  const nodes=new Map(),roads=new Map();
  for(const n of city.nodes){budget.spend();nodes.set(n.id,n);}
  for(const r of city.roads){
    budget.spend(4);
    const a=nodes.get(r.a),b=nodes.get(r.b);
    if(!a||!b)throw Error('Missing P4X road endpoint.');
    roads.set(r.id,{id:r.id,kind:r.kind,endpoints:[r.a,r.b],a:point(positions.get(r.a)??a),b:point(positions.get(r.b)??b)});
  }
  return {nodes,roads};
}
// Separate root and traversal: enumerate every pair with at least one
// changed segment, not the graph oracle's sweep or diagnostic road list.
// Shares authoritative segmentCuts tolerances, not independent primitives.
function auditPairs(city,positions,budget){
  const {roads}=indexRoads(city,positions,budget);
  const all=[...roads.values()],changed=all.filter(r=>r.endpoints.some(id=>positions.has(id)));
  budget.spend(all.length*2);
  const found=new Set();let comparisons=0;
  const changedIds=new Set(changed.map(r=>r.id));
  for(const a of changed)for(const b of all){
    budget.spend();if(a.id===b.id||(changedIds.has(b.id)&&riCompare(a.id,b.id)>0))continue;
    comparisons++;
    const shared=a.endpoints.filter(id=>b.endpoints.includes(id));
    if(shared.length===2)continue;
    if(Math.max(a.a.x,a.b.x)+1e-6<Math.min(b.a.x,b.b.x)||Math.max(b.a.x,b.b.x)+1e-6<Math.min(a.a.x,a.b.x)||
      Math.max(a.a.y,a.b.y)+1e-6<Math.min(b.a.y,b.b.y)||Math.max(b.a.y,b.b.y)+1e-6<Math.min(a.a.y,a.b.y))continue;
    const e=pairEvidence(a,b,budget),cuts=[...e.cutsAB,...e.cutsBA];
    if(cuts.length&&(!shared.length||cuts.some(t=>t>1e-9&&t<1-1e-9)))
      found.add(pairKey(shared.length?'overlapping-roads':'unnormalized-crossing',[a.id,b.id]));
  }
  chargeSort(found.size,budget);
  return {keys:[...found].sort(riCompare),comparisons};
}
// The only public research entry accepts a frozen refusal ID. No geometry,
// report DTO, permissions, solver options or caller-supplied budget.
export async function observeP4XConstraints(id){
  if(typeof id!=='string')throw Error('Frozen P4X refusal ID required.');
  const prior=X_MANIFEST.cases.find(r=>r.id===id);
  if(!prior)throw Error('Unapproved P4X refusal ID.');
  const budget=createSpatialPreservationBudget(G_MANIFEST.search.root);
  const report=await inspectFreshRtreNeighborhood('g:'+id,{mode:'adaptive',maxObjects:10000,maxHops:6},budget);
  const {f,text,hash}=snapshot(id,budget),city=f.project.city;
  if(hash!==prior.source||hash!==report.snapshotFingerprint||report.status!=='research-eligible'||
    aresReplayJson(f.context,budget)!==aresReplayJson(report.context,budget))
    throw Error('P4X locked source or eligibility changed.');
  const positions=new Map(report.requested.map(r=>[r.ref.id,r.point]));
  const eligible=new Map(report.eligibleJunctions.map(r=>[r.ref.id,r]));
  const admittedNodes=new Set(report.entries.filter(r=>r.ref.collection==='nodes').map(r=>r.ref.id));
  const admittedRoads=new Set(report.entries.filter(r=>r.ref.collection==='roads').map(r=>r.ref.id));
  budget.spend(report.entries.length+positions.size+eligible.size);
  const {nodes,roads}=indexRoads(city,positions,budget);
  const maxDisplacement=Math.hypot(prior.offset.x,prior.offset.y);
  const variables=[],fixedNodes=[],segments=[],incompleteRoadIds=[];
  for(const id of [...admittedNodes].sort(riCompare)){
    budget.spend();const n=nodes.get(id);if(!n)throw Error('Missing admitted P4X node.');
    if(eligible.has(id)&&positions.has(id))throw Error('Selected P4X variable.');
    if(eligible.has(id)){
      const e=eligible.get(id);
      variables.push({id,old:point(n),depth:e.depth,primaryIncidentCount:e.primaryIncidentCount,maxDisplacement,
        incidentRefs:e.incidentRefs.map(r=>({...r}))});
    }else fixedNodes.push({id,point:point(positions.get(id)??n),role:positions.has(id)?'exact-requested':'stationary'});
  }
  chargeSort(admittedNodes.size,budget);chargeSort(admittedRoads.size,budget);
  for(const id of [...admittedRoads].sort(riCompare)){
    budget.spend();const r=roads.get(id);if(!r)throw Error('Missing admitted P4X road.');
    if(!r.endpoints.every(n=>admittedNodes.has(n))){incompleteRoadIds.push(id);continue;}
    segments.push({id,kind:r.kind,endpoints:[...r.endpoints],a:point(r.a),b:point(r.b)});
  }
  const conflicts=[],unsupported=[];
  for(const d of report.geometryDiagnostics){
    budget.spend();const ids=d.refs.filter(r=>r.collection==='roads').map(r=>r.id).sort(riCompare);
    if(!['unnormalized-crossing','overlapping-roads'].includes(d.code)||ids.length!==2||!ids.every(r=>roads.has(r))){
      unsupported.push({code:d.code,reason:d.reason,refs:d.refs});continue;
    }
    const [a,b]=ids.map(id=>roads.get(id));
    const endpoints=[...new Set([...a.endpoints,...b.endpoints])].sort(riCompare);
    const movable=endpoints.filter(id=>eligible.has(id));
    const geometry=pairEvidence(a,b,budget);
    conflicts.push({key:pairKey(d.code,ids),code:d.code,roadIds:ids,endpoints,movable,
      outsideAdmitted:endpoints.filter(id=>!admittedNodes.has(id)),geometry});
  }
  chargeSort(conflicts.length,budget);conflicts.sort((a,b)=>riCompare(a.key,b.key));
  const codes=[...new Set(conflicts.map(c=>c.code))].sort(riCompare);
  const auditBudget=createSpatialPreservationBudget(G_MANIFEST.audit.root),auditSource=snapshot(id,auditBudget);
  if(auditSource.hash!==hash)throw Error('P4X audit source mismatch.');
  // Derive exact intent independently from frozen road endpoints and offset.
  const selectedIds=new Set(prior.selectedRoadIds),requested=new Map();
  for(const r of auditSource.f.project.city.roads){
    auditBudget.spend();if(selectedIds.has(r.id)){requested.set(r.a,null);requested.set(r.b,null);}
  }
  for(const n of auditSource.f.project.city.nodes){
    auditBudget.spend();if(requested.has(n.id))requested.set(n.id,{x:prior.offset.x===0?n.x:n.x+prior.offset.x,y:prior.offset.y===0?n.y:n.y+prior.offset.y});
  }
  const intentMatches=requested.size===positions.size&&[...requested].every(([id,p])=>p&&positions.has(id)&&equal(p,positions.get(id)));
  auditBudget.spend(requested.size);
  const audit=auditPairs(auditSource.f.project.city,requested,auditBudget);
  const observed=conflicts.map(c=>c.key),missing=audit.keys.filter(k=>!observed.includes(k)),extra=observed.filter(k=>!audit.keys.includes(k));
  auditBudget.spend(Math.max(1,audit.keys.length*observed.length*2));
  const evidence={version:1,id,source:hash,offset:prior.offset,selectedRoadIds:prior.selectedRoadIds,baselineCodes:codes,
    unsupported,conflicts,model:{version:1,status:'observation-only',variables,fixedNodes,segments,incompleteRoadIds,
      boundary:city.survey.boundary.map(point),limits:X_MANIFEST.limits,
      hardRequirements:['exact-selected-coordinates','fixed-boundary','protected-and-unknown-authorship-fixed','complete-incident-scope','maximum-four-neighbors','bounded-displacement','road-graph-validity','cyclic-order','landscape-defense','independent-witness-verification']},
    audit:{intentMatches,missing,extra,comparisons:audit.comparisons,pairCount:audit.keys.length}};
  if(aresReplayJson(f.project,budget)!==text||aresReplayJson(auditSource.f.project,auditBudget)!==auditSource.text)throw Error('P4X source mutated.');
  aresReplayJson(evidence,budget);
  return riFreeze({...evidence,stats:budget.snapshot(),auditStats:auditBudget.snapshot()});
}
