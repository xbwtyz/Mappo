import { createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { discoverSpatialDependencies } from './spatial-recovery-dependencies.js';
import { createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { discoverAresRoadSetbacks } from './ares-road-discovery.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { classifyRoad } from './road-graph.js';
import { classifyLareProperty, classifyLareBuilding } from './reconciliation-policy.js';
import { riCompare, riFreeze } from './road-impact-model.js';

// P2-B: source-bound, detached observation graph. No write authorization.
export const ARES_DEPENDENCY_VERSION=1;
const ref=(collection,id)=>createSpatialRef({collection,id});
const key=spatialRefKey;
const order=(a,b)=>riCompare(key(a),key(b));
function aresBudget(budget){
  if(typeof budget?.spend!=='function')throw Error('Shared ARES dependency budget required.');
}
function aresSnapshot(project,budget){
  aresBudget(budget);
  const text=aresReplayJson(project,budget);
  const bytes=new TextEncoder().encode(text);
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  return bytes;
}
async function aresHash(bytes){
  if(!globalThis.crypto?.subtle)throw Error('ARES snapshot fingerprint unavailable.');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
function aresIndexes(project,inventory,budget){
  const indexes=new Map();
  for(const r of inventory.refs){
    budget.spend();
    if(!indexes.has(r.collection)){
      const rows=project.city[r.collection];budget.spend(Math.max(1,rows.length));
      indexes.set(r.collection,new Map(rows.map(row=>[row.id,row])));
    }
  }
  return indexes;
}
function aresLabels(project,inventory,edges,discovery,budget){
  const indexes=aresIndexes(project,inventory,budget),policies=new Map(),dependent=new Set(),
    protectedNodes=new Set(),selected=new Set(inventory.operation.editedRefs.map(key)),
    changed=new Set(discovery.changedRoads.map(r=>key(r.ref)));
  const get=(collection,id)=>indexes.get(collection)?.get(id);
  for(const road of indexes.get('roads')?.values()??[]){
    budget.spend();
    if(classifyRoad(road).protected){protectedNodes.add(road.a);protectedNodes.add(road.b);}
  }
  for(const edge of edges){
    budget.spend();
    if(['courtyard-occupant','compound-member'].includes(edge.relation)){
      dependent.add(key(edge.to));
      if(edge.from.collection==='buildings')dependent.add(key(edge.from));
    }
    if(edge.relation==='gate-approach')protectedNodes.add(edge.to.id);
  }
  function propertyPolicy(id){
    if(!policies.has(id)){
      const p=get('properties',id);
      if(!p)throw Error('Missing ARES property owner.');
      const plots=(p.plotIds??[]).map(id=>{
        budget.spend();const plot=get('plots',id);if(!plot)throw Error('Missing ARES property plot.');return plot;
      });
      // Bound the existing provenance snapshot comparison too.
      aresReplayJson([p,plots],budget);
      policies.set(id,classifyLareProperty(p,plots));
    }
    return policies.get(id);
  }
  return inventory.refs.map(r=>{
    budget.spend();
    const record=get(r.collection,r.id),c=r.collection;
    let classification='observe-only',reason='no-discovery-write-authority';
    if(c==='roads'){
      if(classifyRoad(record).protected){classification='protected';reason='protected-infrastructure';}
      else if(selected.has(key(r))){classification='requested-intent';reason='exact-selected-road';}
      else if(changed.has(key(r))){classification='review-candidate';reason='attached-road';}
      else {classification='review-candidate';reason='neighbor-road';}
    }else if(c==='nodes'){
      if(protectedNodes.has(r.id)){classification='protected';reason='protected-anchor';}
      else {classification='review-candidate';reason='junction-review';}
    }else if(['properties','plots','buildings'].includes(c)){
      const policy=propertyPolicy(c==='properties'?r.id:record.propertyId);
      if(policy.mode!=='adaptive'){classification='protected';reason='property-'+policy.mode;}
      else if(c==='buildings'){
        aresReplayJson(record,budget);
        const p=classifyLareBuilding(record,policy,dependent.has(key(r)));
        classification=p.mode==='rigid'?'review-candidate':'protected';reason=p.reason??'generated-rigid-review';
      }else {classification='review-candidate';reason='generated-property-review';}
    }else if(['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces','walls','gates','towers'].includes(c)){
      classification='protected';reason='landscape-or-defense-authority';
    }
    // A review candidate is only a discovery hint; even generated records
    // may be protected by opaque references or independent domain checks.
    return {ref:r,classification,reason};
  });
}
function aresSeeds(discovery,operation){
  const refs=new Map();
  const add=r=>refs.set(key(r),r);
  for(const r of operation.editedRefs)add(r);
  for(const road of discovery.changedRoads){add(road.ref);for(const r of road.endpointRefs)add(r);}
  for(const b of discovery.blockers){add(b.roadRef);add(b.propertyRef);add(b.blockRef);}
  return [...refs.values()].sort(order);
}
// Recompute discovery and dependency inventory together from one synchronous
// source read. Hash captured bytes afterwards; no await until observations
// have been detached, so later edits cannot relabel evidence.
export async function createAresDependencyObservation(project,contextInput,budget){
  const context=createAresDiagnosticContext(contextInput);
  const bytes=aresSnapshot(project,budget);
  const discovery=discoverAresRoadSetbacks(project,context,budget);
  const {inventory,edges}=discoverSpatialDependencies(project,context.operation,budget);
  const nodes=aresLabels(project,inventory,edges,discovery,budget);
  const roots=aresSeeds(discovery,context.operation);
  const snapshotFingerprint=await aresHash(bytes);
  return riFreeze({version:ARES_DEPENDENCY_VERSION,context,snapshotFingerprint,
    status:discovery.status,roots,nodes,edges,discovery});
}
// Only source/context equality, not an authenticity or permission check.
// A changed revision, signed zero, metadata or geometry invalidates evidence.
export async function matchesAresDependencySource(observation,project,context,budget){
  if(observation?.version!==ARES_DEPENDENCY_VERSION||
     !matchesAresDiagnosticContext({version:1,context:observation.context},context))return false;
  return observation.snapshotFingerprint===await aresHash(aresSnapshot(project,budget));
}
function aresEdgeKey(edge){return JSON.stringify([key(edge.from),key(edge.to),edge.relation]);}
// Index is operation-local. No persistent or cross-revision cache. Caller
// must recheck source before reusing historical observation. Direct neighbors
// only; transitive expansion and bounded scope are a separate P2-C contract.
export function createAresDependencyIndex(observation,budget){
  aresBudget(budget);
  if(observation?.version!==ARES_DEPENDENCY_VERSION||!Object.isFrozen(observation))
    throw Error('Invalid ARES dependency observation.');
  const nodes=new Map(),adjacent=new Map();
  for(const row of observation.nodes){
    budget.spend();const k=key(row.ref);
    if(nodes.has(k))throw Error('Duplicate dependency node.');
    nodes.set(k,row);adjacent.set(k,[]);
  }
  for(const edge of observation.edges){
    budget.spend();const a=key(edge.from),b=key(edge.to);
    if(!nodes.has(a)||!nodes.has(b))throw Error('Missing dependency endpoint.');
    adjacent.get(a).push(edge);if(a!==b)adjacent.get(b).push(edge);
  }
  return Object.freeze({neighbors(refs,shared,{algorithm='indexed'}={}){
    aresBudget(shared);
    if(!Array.isArray(refs)||!['indexed','reference'].includes(algorithm))throw Error('Invalid ARES neighbor query.');
    const requested=new Set();
    for(const r of refs){shared.spend();const k=key(r);if(!nodes.has(k))throw Error('Unknown dependency reference.');requested.add(k);}
    const edges=new Map(),found=new Map();
    const add=edge=>{
      shared.spend();edges.set(aresEdgeKey(edge),edge);
      for(const r of [edge.from,edge.to])if(!requested.has(key(r)))found.set(key(r),nodes.get(key(r)));
    };
    if(algorithm==='indexed'){
      for(const k of requested)for(const edge of adjacent.get(k))add(edge);
    }else{
      for(const edge of observation.edges){
        shared.spend();if(requested.has(key(edge.from))||requested.has(key(edge.to)))add(edge);
      }
    }
    return riFreeze({nodes:[...found.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,v])=>v),
      edges:[...edges.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,v])=>v)});
  }});
}
