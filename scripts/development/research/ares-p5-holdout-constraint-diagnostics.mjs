import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {holdoutLockedRow,HOLDOUT_OPTIONS} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {insideOrOn,clearance} from '../../../src/core/boundary.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';

const topologyJobs=Object.freeze([140837110633,140837110641,140837110651,140837110653,140837110657,140837110664,140837110675,140837110682,140837110687,140837110688,140837110705,140837110710,140837110715,140837110738,140837110755,140837110842]);
const geometryJobs=Object.freeze([140834563368,140834563392,140834563405,140834563423,140834563424,140834563433,140834563438,140834563443,140834563456,140834563462,140834563465,140834563472,140834563473,140834563481,140834563501,140834563513]);
const topology=new Map(),geometry=new Map();
function archive(kind,run,source,jobs,accept){
  for(const job of jobs){
    const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-'+kind+'-'+run+'-'+job+'.json',import.meta.url),'utf8'));
    if(e.run!==run||e.attempt!==1||e.source!==source||e.job!==job||!Array.isArray(e.rows))throw Error('Invalid archived evidence identity.');
    for(const r of e.rows){
      const lock=holdoutLockedRow(r.caseId);
      if(r.source!==lock.source||r.authority!=='none'||JSON.stringify(r.options)!==JSON.stringify(lock.options)||JSON.stringify(r.offset)!==JSON.stringify(lock.offset)||JSON.stringify(r.selectedRoadIds)!==JSON.stringify(lock.selectedRoadIds)||r.group!==lock.group)throw Error('Archive does not match frozen recipe.');
      accept(r);
    }
  }
}
archive('topology',46099035262,'576faaa267556adef0d9af771201b68eefaee785',topologyJobs,r=>{if(topology.has(r.caseId))throw Error('Duplicate topology evidence.');topology.set(r.caseId,riFreeze(r));});
archive('geometry',46098228359,'20d819b97c6bd1268afe552cf1901f3d45e963ec',geometryJobs,r=>{const k=r.caseId+':'+r.arm;if(!['R5','analytical','hybrid'].includes(r.arm)||geometry.has(k))throw Error('Duplicate/unknown geometry arm.');geometry.set(k,riFreeze(r));});
if(topology.size!==100||geometry.size!==300)throw Error('Incomplete archived evidence.');
const root=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
const point=n=>({x:n.x,y:n.y});
const same=(a,b)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y);
const family=s=>s.split(':')[0];
function count(values){const out={};for(const x of values)out[x]=(out[x]??0)+1;return out;}

// Frozen recipe only. This is read-only evidence, not a candidate generator,
// a permission grant, a proof of recoverability, or a change to any oracle.
export async function diagnoseHoldoutConstraints(caseId){
  const lock=holdoutLockedRow(caseId),prior=topology.get(caseId),hybrid=geometry.get(caseId+':hybrid');
  const base={caseId,source:lock.source,morphology:lock.options.morphology,group:lock.group,offset:lock.offset,authority:'none',topologyCategory:prior.category,hybridCategory:hybrid.category};
  const budget=root();
  let boundary=null;
  try{
    const f=materializeLockedRtreCase(caseId),before=aresReplayJson(f.project,budget),bytes=Buffer.from(before,'utf8');
    budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
    if(createHash('sha256').update(bytes).digest('hex')!==lock.source)throw Error('Constraint source identity changed.');
    const city=f.project.city,outline=city.survey.boundary;
    if(!Array.isArray(outline)||outline.length<3)throw Error('Missing accepted outline.');
    const nodes=new Map(),roads=new Map(),selected=new Set();
    for(const n of city.nodes){budget.spend();nodes.set(n.id,n);}
    for(const r of city.roads){budget.spend();roads.set(r.id,r);}
    for(const id of lock.selectedRoadIds){budget.spend();const r=roads.get(id);selected.add(r.a);selected.add(r.b);}
    const requested=new Map(prior.observation.requested.map(n=>[n.ref.id,n.point]));
    if(selected.size!==requested.size)throw Error('Archived requested endpoint count changed.');
    const outside=[];
    for(const id of [...selected].sort()){
      const n=nodes.get(id),p={x:lock.offset.x===0?n.x:n.x+lock.offset.x,y:lock.offset.y===0?n.y:n.y+lock.offset.y};
      if(!requested.has(id)||!same(p,requested.get(id)))throw Error('Exact requested endpoint differs from archived intent.');
      budget.spend(6*outline.length);
      const sourceInside=insideOrOn(n,outline),targetInside=insideOrOn(p,outline);
      if(!targetInside)outside.push({id,old:point(n),target:p,sourceInside,oldClearance:clearance(n,outline),targetOutsideDistance:clearance(p,outline)});
    }
    const archivedBoundary=prior.observation.other.some(d=>d.code==='boundary-escape'&&d.reason==='domain-violation');
    if(archivedBoundary!==(outside.length>0)||archivedBoundary!==(prior.category==='preflight-refused')||archivedBoundary!==(hybrid.category==='preflight-refused'))throw Error('Boundary classification disagrees with qualified evidence.');
    if(outside.some(n=>!n.sourceInside))throw Error('Boundary witness originated outside accepted outline.');
    boundary={requestedCount:selected.size,outside,classification:outside.length?'impossible-under-fixed-outline-and-exact-intent':'no-exact-target-outside',outlineVertices:outline.length};
    if(aresReplayJson(f.project,budget)!==before)throw Error('Constraint source mutated.');
    // No eligibility dispatch for boundary-refused cases. A separate root
    // replays the existing P4 read-only neighborhood only for admitted cases.
    let neighborhood=null,neighborhoodStats=null;
    if(!outside.length){
      const nb=root();
      try{
        neighborhood=await inspectFreshRtreNeighborhood(caseId,{mode:HOLDOUT_OPTIONS.mode,maxObjects:HOLDOUT_OPTIONS.maxObjects,maxHops:HOLDOUT_OPTIONS.maxHops},nb);
        if(neighborhood.snapshotFingerprint!==lock.source||!['research-eligible','no-eligible-neighbors'].includes(neighborhood.status))throw Error('Admitted neighborhood differs from archived result.');
      }catch(e){if(e instanceof LareBudgetExceeded)return riFreeze({...base,boundary,category:'neighborhood-work-limit',reason:e.resource,stats:budget.snapshot(),neighborhoodStats:nb.snapshot()});throw e;}
      neighborhoodStats=nb.snapshot();
    }
    const eligible=new Set(neighborhood?.eligibleJunctions.map(n=>n.ref.id)??[]);
    const pairs=[];
    for(const c of prior.observation.conflicts){
      budget.spend(1+c.reasons.length+c.endpointIds.length);
      const families=[...new Set(c.reasons.map(family))].sort();
      const movable=[...new Set(c.endpointIds.filter(id=>eligible.has(id)&&!selected.has(id)))].sort();
      pairs.push({roadIds:c.roadIds,kind:c.contact.kind,status:c.status,families,eligibleNeighborEndpoints:movable,endpointExclusions:c.endpointExclusions});
    }
    const changes=[];
    for(const c of prior.audit?.rotationDiagnostic?.changes??[]){
      budget.spend(1+c.prior.length);
      const ids=[...new Set([c.nodeId,...c.prior.map(r=>r.other)])];
      changes.push({nodeId:c.nodeId,role:c.role,degree:c.degree,geometry:c.geometry,split:c.split,final:c.final,eligibleNeighborIds:ids.filter(id=>eligible.has(id)&&!selected.has(id)).sort()});
    }
    const constraints={pairs,reasonPairCounts:count(pairs.flatMap(p=>p.families)),contactKinds:count(pairs.map(p=>p.kind)),blockedPairs:pairs.filter(p=>p.status==='blocked').length,pairsWithEligibleNeighbor:pairs.filter(p=>p.eligibleNeighborEndpoints.length).length,eligibleNeighborCount:eligible.size,changes,orderChangesWithEligibleNeighbor:changes.filter(c=>c.eligibleNeighborIds.length).length,
      opportunity:outside.length?'fixed-outline-stop':!pairs.length?'no-contact':pairs.every(p=>p.status==='research-contact-only'&&p.kind==='interior-interior')?'strict-split-audit-research':pairs.every(p=>p.status==='research-contact-only'&&p.kind==='interior-interior'||p.eligibleNeighborEndpoints.length>0)?'all-held-pairs-have-local-geometry-or-split-lead':pairs.some(p=>p.eligibleNeighborEndpoints.length>0)?'partial-local-geometry-lead':'no-local-endpoint-lead'};
    aresReplayJson({boundary,constraints},budget);
    return riFreeze({...base,boundary,constraints,category:'diagnosed',stats:budget.snapshot(),neighborhoodStats});
  }catch(e){if(e instanceof LareBudgetExceeded)return riFreeze({...base,boundary,category:'diagnostic-work-limit',reason:e.resource,stats:budget.snapshot()});throw e;}
}
