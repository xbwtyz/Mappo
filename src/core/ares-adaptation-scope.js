import { createAresDependencyObservation, matchesAresDependencySource } from './ares-dependency-observation.js';
import { createAresDiagnostic, createAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { spatialRefKey, createSpatialRef } from './spatial-recovery-contract.js';
import { ROAD_IMPACT_COLLECTIONS, riCompare, riFreeze } from './road-impact-model.js';

// Transient discovery scope only. No mode activation, write authorization,
// candidate geometry, membership changes, or default numerical limits.
export const ARES_SCOPE_VERSION=1;
const scopeEvidence=new WeakSet();
const key=spatialRefKey;
const ref=(collection,id)=>createSpatialRef({collection,id});
const byRef=(a,b)=>riCompare(key(a.ref),key(b.ref));
function scopeLimits(input){
  if(!input||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input))||
     Object.keys(input).length!==2||!Object.hasOwn(input,'maxObjects')||!Object.hasOwn(input,'maxHops')||
     !Number.isSafeInteger(input.maxObjects)||input.maxObjects<1||
     !Number.isSafeInteger(input.maxHops)||input.maxHops<0)throw Error('Explicit bounded ARES scope limits required.');
  return {maxObjects:input.maxObjects,maxHops:input.maxHops};
}
function scopeDiagnostic(context,reason,code,message,refs){
  return createAresDiagnostic(context,{reason,code,stage:'adaptation-scope',message,refs,
    source:{id:'ares-adaptation-scope',version:'1'}});
}
function scopeActive(observation,budget){
  const active=new Set(),conflicts=new Map(),moved=new Set();
  for(const road of observation.discovery.changedRoads){
    budget.spend();active.add(key(road.ref));
    for(const [i,side] of [[0,'a'],[1,'b']]){
      const a=road.old[side],b=road.proposed[side];
      if(!Object.is(a.x,b.x)||!Object.is(a.y,b.y)){active.add(key(road.endpointRefs[i]));moved.add(key(road.endpointRefs[i]));}
    }
  }
  for(const row of observation.discovery.blockers){budget.spend();active.add(key(row.propertyRef));}
  for(const node of observation.nodes){
    budget.spend();
    if(active.has(key(node.ref))&&node.classification==='protected')conflicts.set(key(node.ref),node.ref);
  }
  return {active,conflicts:[...conflicts.values()],moved};
}
// Ownership closure only: an actual obstructing property can lead to its own
// plots/buildings and explicit compound/courtyard dependencies. Other links
// expose read-only anchors/context. Do not flood through districts, blocks,
// frontage roads, or stationary junctions. Further geometry-driven feedback
// must be independently discovered by later phase strategies.
function scopeRelatedActive(from,other,edge){
  const c=from.ref.collection,t=other.ref.collection;
  if(c==='properties'&&['plots','buildings'].includes(t)&&
     ['property','plot','building','compound-member'].includes(edge.relation))return true;
  if(c==='buildings'&&t==='buildings'&&edge.relation==='courtyard-occupant')return true;
  return false;
}
export async function discoverAresAdaptationScope(project,contextInput,limitsInput,budget){
  const limits=scopeLimits(limitsInput),context=createAresDiagnosticContext(contextInput);
  const observation=await createAresDependencyObservation(project,context,budget);
  const nodes=new Map(),adj=new Map();
  for(const row of observation.nodes){budget.spend();nodes.set(key(row.ref),row);adj.set(key(row.ref),[]);}
  for(const edge of observation.edges){
    budget.spend();const a=key(edge.from),b=key(edge.to);
    if(!nodes.has(a)||!nodes.has(b))throw Error('Missing scope dependency endpoint.');
    adj.get(a).push({edge,other:b});if(a!==b)adj.get(b).push({edge,other:a});
  }
  const {active,conflicts}=scopeActive(observation,budget);
  const admitted=new Map(),queue=[],unresolved=new Map();
  const mark=(row,depth,reason,expand)=>{
    budget.spend();const k=key(row.ref),existing=admitted.get(k);
    const canExpand=expand&&['requested-intent','review-candidate'].includes(row.classification);
    if(existing){
      if(canExpand&&!existing.expand){existing.expand=true;existing.depth=Math.min(existing.depth,depth);queue.push(k);}
      return;
    }
    if(depth>limits.maxHops||admitted.size>=limits.maxObjects){
      if(!unresolved.has(k))unresolved.set(k,row.ref);
      return;
    }
    admitted.set(k,{row,depth,reason,expand:canExpand});
    if(canExpand)queue.push(k);
  };
  const finish=(status,diagnostics)=>{
    const entries=[...admitted.values()].sort((a,b)=>byRef(a.row,b.row)).map(({row,depth,reason,expand})=>({
      ref:row.ref,classification:row.classification,classificationReason:row.reason,depth,discoveryReason:reason,
      // Read-only context and stationary anchors are never change candidates.
      role:row.classification==='protected'?'protected':expand?'review-candidate':'observe-only'}));
    const scope=riFreeze({version:ARES_SCOPE_VERSION,context,snapshotFingerprint:observation.snapshotFingerprint,
      limits,status,entries,unresolvedRefs:[...unresolved.values()].sort((a,b)=>riCompare(key(a),key(b))),
      reviewRefs:status==='observed'?entries.filter(e=>e.role==='review-candidate').map(e=>e.ref):[],
      diagnostics});
    scopeEvidence.add(scope);return scope;
  };
  if(observation.status!=='observed')return finish('preflight-refused',observation.discovery.diagnostics);
  for(const root of observation.roots){
    const row=nodes.get(key(root));if(!row)throw Error('Missing scope root.');
    mark(row,0,'changed-road-or-setback-root',active.has(key(root)));
  }
  // Deterministic queue: roots are sorted by typed identity, graph edges
  // already sorted; each node expanded at most once.
  const expanded=new Set();
  for(let i=0;i<queue.length;i++){
    const k=queue[i],current=admitted.get(k);
    if(expanded.has(k))continue;
    expanded.add(k);budget.spend();
    for(const {edge,other} of adj.get(k)){
      budget.spend();
      const row=nodes.get(other);
      mark(row,current.depth+1,edge.relation,active.has(other)||scopeRelatedActive(current.row,row,edge));
    }
  }
  // A node first seen beyond the limit could later be admitted by a shorter
  // known path. Only still omitted dependencies count toward refusal.
  for(const k of admitted.keys()){budget.spend();unresolved.delete(k);}
  const diagnostics=[];
  if(unresolved.size)diagnostics.push(scopeDiagnostic(context,'scope-limited','scope-limit',
    'Required dependency observations exceed the explicit scope limits.',[...unresolved.values()]));
  if(conflicts.length)diagnostics.push(scopeDiagnostic(context,'protected-content','scope-protected-blocker',
    'Requested movement or setback obstruction touches protected content.',conflicts));
  return finish(unresolved.size?'scope-limited':conflicts.length?'protected-blocker':'observed',diagnostics);
}

// Outside-scope preservation gate only; never candidate validity or Apply.
// Same membership/order required in this initial non-topology seam. No
// allocations or unrelated metadata changes; review candidates may differ
// but require independent verification and explicit authority elsewhere.
export async function verifyAresOutsideScope(accepted,candidate,scope,contextInput,budget){
  if(!scopeEvidence.has(scope)||scope.status!=='observed')throw Error('Observed ARES scope required.');
  const context=createAresDiagnosticContext(contextInput);
  // Detach both inputs before awaiting the source digest.
  const before=JSON.parse(aresReplayJson(accepted,budget)),after=JSON.parse(aresReplayJson(candidate,budget));
  if(!await matchesAresDependencySource(scope,before,context,budget))throw Error('Stale ARES scope source.');
  const allowed=new Set(scope.reviewRefs.map(key)),violations=[];
  const collections=new Set(ROAD_IMPACT_COLLECTIONS.map(([c])=>c));
  const outside=p=>({...p,city:Object.fromEntries(Object.entries(p.city??{}).filter(([k])=>!collections.has(k)))});
  const equal=(a,b)=>aresReplayJson(a,budget)===aresReplayJson(b,budget);
  if(!equal(outside(before),outside(after)))violations.push({code:'outside-collection-change',ref:null});
  for(const c of collections){
    budget.spend();const a=before.city?.[c],b=after.city?.[c];
    if(a===undefined&&b===undefined)continue;
    if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length){
      violations.push({code:'scope-membership-change',ref:null,collection:c});continue;
    }
    for(let i=0;i<a.length;i++){
      budget.spend();const r=ref(c,a[i].id);
      if(a[i].id!==b[i]?.id){violations.push({code:'scope-membership-or-order-change',ref:r});continue;}
      if(!allowed.has(key(r))&&!equal(a[i],b[i]))violations.push({code:'outside-scope-record-change',ref:r});
    }
  }
  return riFreeze({version:ARES_SCOPE_VERSION,status:violations.length?'outside-scope-changed':'outside-scope-preserved',
    snapshotFingerprint:scope.snapshotFingerprint,context,violations});
}
