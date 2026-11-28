import { createAresDependencyObservation, matchesAresDependencySource } from './ares-dependency-observation.js';
import { createAresDiagnostic, createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { discoverAresLandscape } from './ares-landscape-observation.js';
import { discoverAresDefense } from './ares-defense-observation.js';
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
  return buildAresScope(observation,context,limits,budget);
}
function buildAresScope(observation,context,limits,budget,feedback=null){
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
    // Observation may have a shorter read-only path than the path that
    // permits ownership expansion. Never promote through an over-limit path.
    if(depth>limits.maxHops){
      if(!existing&&!unresolved.has(k))unresolved.set(k,row.ref);
      return;
    }
    if(existing){
      if(depth<existing.depth){existing.depth=depth;existing.reason=reason;}
      if(canExpand&&existing.expansionDepth===null){
        existing.expansionDepth=depth;queue.push(k);
      }
      return;
    }
    if(admitted.size>=limits.maxObjects){
      if(!unresolved.has(k))unresolved.set(k,row.ref);
      return;
    }
    admitted.set(k,{row,depth,reason,expansionDepth:canExpand?depth:null});
    if(canExpand)queue.push(k);
  };
  const finish=(status,diagnostics)=>{
    const entries=[...admitted.values()].sort((a,b)=>byRef(a.row,b.row)).map(({row,depth,reason,expansionDepth})=>({
      ref:row.ref,classification:row.classification,classificationReason:row.reason,depth,discoveryReason:reason,
      // Read-only context and stationary anchors are never change candidates.
      role:row.classification==='protected'?'protected':expansionDepth!==null?'review-candidate':'observe-only'}));
    const scope=riFreeze({version:ARES_SCOPE_VERSION,context,snapshotFingerprint:observation.snapshotFingerprint,
      limits,status,entries,unresolvedRefs:[...unresolved.values()].sort((a,b)=>riCompare(key(a),key(b))),
      reviewRefs:status==='observed'?entries.filter(e=>e.role==='review-candidate').map(e=>e.ref):[],
      diagnostics,...(feedback?{constraintFeedback:feedback}:{})});
    scopeEvidence.add(scope);return scope;
  };
  if(observation.status!=='observed')return finish('preflight-refused',observation.discovery.diagnostics);
  for(const root of observation.roots){
    const row=nodes.get(key(root));if(!row)throw Error('Missing scope root.');
    mark(row,0,'changed-road-or-setback-root',active.has(key(root)));
  }
  // Independently observed constraint refs consume the same object cap.
  // They are never new writable roots. Inspect one direct protected/context
  // neighborhood without following unrelated roads, parcels or districts.
  if(feedback)for(const r of feedback.contactRefs){
    budget.spend();const k=key(r),row=nodes.get(k);
    if(!row)throw Error('Missing constraint scope reference.');
    mark(row,0,'landscape-or-defense-contact',active.has(k));
  }
  if(feedback)for(const r of feedback.contactRefs){
    budget.spend();const k=key(r),entry=admitted.get(k);
    if(!entry||entry.row.classification!=='protected')continue;
    for(const {edge,other} of adj.get(k)){
      budget.spend();const row=nodes.get(other);
      if(row.classification==='protected'||row.classification==='observe-only')
        mark(row,1,edge.relation,false);
    }
  }
  // All expansion roots are queued at depth zero before traversal.
  // FIFO unit-edge expansion gives the first permitted expansion path its
  // shortest depth, independently of earlier read-only observations.
  // Graph edges are sorted; each node expands at most once.
  const expanded=new Set();
  for(let i=0;i<queue.length;i++){
    const k=queue[i],current=admitted.get(k);
    if(expanded.has(k))continue;
    expanded.add(k);budget.spend();
    for(const {edge,other} of adj.get(k)){
      budget.spend();
      const row=nodes.get(other);
      mark(row,current.expansionDepth+1,edge.relation,active.has(other)||scopeRelatedActive(current.row,row,edge));
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
  if(feedback?.finalViolations.length)diagnostics.push(...feedback.diagnostics);
  if(feedback?.finalUnresolved.length)diagnostics.push(scopeDiagnostic(context,'unknown-data','constraint-unresolved',
    'Final landscape or defense constraint evidence is unresolved.',feedback.finalUnresolved.flatMap(e=>e.refs)));
  return finish(unresolved.size?'scope-limited':conflicts.length?'protected-blocker':
    feedback?.finalViolations.length?'constraint-blocked':feedback?.finalUnresolved.length?'constraint-unresolved':'observed',diagnostics);
}

// Public detached integration path: no caller-injected constraint rows. All
// providers receive the same captured snapshot/context and one caller budget.
// The older isolated scope API remains a diagnostic reference. Repeated
// source discovery is deliberately charged, not a second budget or cache.
export async function discoverAresIntegratedScope(project,contextInput,limitsInput,budget){
  const limits=scopeLimits(limitsInput),context=createAresDiagnosticContext(contextInput);
  const snapshot=JSON.parse(aresReplayJson(project,budget));
  const observation=await createAresDependencyObservation(snapshot,context,budget);
  const landscape=await discoverAresLandscape(snapshot,context,budget);
  const defense=await discoverAresDefense(snapshot,context,budget);
  for(const report of [landscape,defense]){
    budget.spend();
    if(report.snapshotFingerprint!==observation.snapshotFingerprint||
       report.status!==observation.status||
       !matchesAresDiagnosticContext({version:1,context:report.context},context))
      throw Error('Inconsistent ARES constraint source.');
  }
  const finalViolations=[],finalUnresolved=[],sweptCandidates=[],diagnostics=[],contacts=new Map();
  for(const entry of [...landscape.evidence.map(constraint=>({constraint,measurements:[]})),...defense.evidence]){
    budget.spend();const {constraint,measurements}=entry;
    for(const row of constraint.rows){
      budget.spend();
      if(row.kind==='preference'||row.outcome==='satisfied')continue;
      const refs=[...new Map([...row.refs,...row.anchorRefs].map(r=>[key(r),r])).entries()]
        .sort(([a],[b])=>riCompare(a,b)).map(([,r])=>r);
      for(const r of refs){budget.spend();contacts.set(key(r),r);}
      const item={provider:constraint.provider.id,query:constraint.query,row,refs,
        measurements:measurements.filter(m=>m.rowId===row.id)};
      if(constraint.query.phase==='swept'){sweptCandidates.push(item);continue;}
      if(row.outcome==='violated'){
        finalViolations.push(item);
        diagnostics.push(createAresDiagnostic(context,{reason:row.kind==='protection'?'protected-content':'domain-violation',
          code:row.id,stage:'final-landscape-defense',message:row.detail,refs,
          source:{id:constraint.provider.id,version:row.ruleVersion}}));
      }else finalUnresolved.push(item);
    }
  }
  const feedback=riFreeze({contactRefs:[...contacts.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,r])=>r),
    finalViolations,finalUnresolved,sweptCandidates,diagnostics,
    providers:[...landscape.providers,...defense.providers],crossings:landscape.crossings,anchors:defense.anchors,
    verticalCapability:landscape.verticalCapability});
  return buildAresScope(observation,context,limits,budget,feedback);
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
