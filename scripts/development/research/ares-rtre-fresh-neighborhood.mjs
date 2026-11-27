import { createHash } from 'node:crypto';
import { lockedRtreCase,materializeLockedRtreCase } from './ares-rtre-locked-recipes.mjs';
import { observeAresRtreGeometry } from '../../../src/core/ares-rtre-geometry.js';
import { observeAresRtreNeighborhood } from '../../../src/core/ares-rtre-neighborhood.js';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { spatialRefKey, createSpatialRef } from '../../../src/core/spatial-recovery-contract.js';
import { classifyRoad } from '../../../src/core/road-graph.js';
import { riFreeze, riCompare } from '../../../src/core/road-impact-model.js';

// Research-only recipe boundary. No project argument, no serialized permit,
// no supplied provenance, no caller-provided editable list. Fresh generation
// is fixture setup (outside timed search); all ensuing observation and
// eligibility accounting uses the one caller-owned root.
const ref=(collection,id)=>createSpatialRef({collection,id});
const key=spatialRefKey;
const roadFields=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
const nodeFields=new Set(['id','x','y']);
const exact=(a,b)=>aresReplayJson(a)===aresReplayJson(b);
function readOptions(options){
  if(!options||Array.isArray(options)||![Object.prototype,null].includes(Object.getPrototypeOf(options))||
    Reflect.ownKeys(options).length!==3||
    !['mode','maxObjects','maxHops'].every(k=>Object.hasOwn(options,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(options,k),'value'))||
    !['strict','adaptive'].includes(options.mode)||!Number.isSafeInteger(options.maxObjects)||options.maxObjects<1||
    !Number.isSafeInteger(options.maxHops)||options.maxHops<0)throw Error('Invalid explicit RTRE research options.');
  return {mode:options.mode,maxObjects:options.maxObjects,maxHops:options.maxHops};
}
function checkBudget(budget,limits){
  if(typeof budget?.snapshot!=='function'||typeof budget?.spend!=='function'||typeof budget?.expand!=='function')
    throw Error('Existing RTRE research budget required.');
  const s=budget.snapshot();
  if(!['work','expansions','remainingWork','remainingExpansions'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||
    s.work+s.remainingWork>limits.work||s.expansions+s.remainingExpansions>limits.stateExpansions)
    throw Error('RTRE research budget exceeds frozen allowance.');
}
function knownFields(row,allowed,budget){
  let known=true;
  for(const k of Object.keys(row)){budget.spend();if(!allowed.has(k))known=false;}
  return known;
}
export async function inspectFreshRtreNeighborhood(caseId,optionsInput,budget){
  if(typeof caseId!=='string')throw Error('Frozen RTRE recipe ID required, not a city.');
  const lock=lockedRtreCase(caseId);
  const options=readOptions(optionsInput);
  checkBudget(budget,lock.limits);
  // The module itself creates and validates this city from the frozen P3
  // recipe, not a caller snapshot. No mutation/editor session intervenes.
  const f=materializeLockedRtreCase(caseId),source=f.project;
  const before=aresReplayJson(source,budget),bytes=Buffer.from(before,'utf8');
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  const fingerprint=createHash('sha256').update(bytes).digest('hex');
  if(fingerprint!==lock.source||(!lock.slot&&!exact(f.context.operation,lock.operation))||!exact(f.limits,lock.limits))
    throw Error('Frozen RTRE recipe identity changed.');
  const mode={mode:options.mode},limits={maxObjects:options.maxObjects,maxHops:options.maxHops};
  const geometry=await observeAresRtreGeometry(source,f.context,mode,budget);
  const neighborhood=await observeAresRtreNeighborhood(source,f.context,mode,limits,budget);
  if(geometry.snapshotFingerprint!==fingerprint||neighborhood.snapshotFingerprint!==fingerprint||
    !exact(geometry.context,f.context)||!exact(neighborhood.context,f.context)||
    geometry.mode!==options.mode||neighborhood.mode!==options.mode)
    throw Error('Inconsistent RTRE research evidence.');
  const result={version:1,caseId,context:f.context,mode:options.mode,limits,snapshotFingerprint:fingerprint,
    authorship:'fresh-frozen-generator-recipe',status:'observed',requested:geometry.requested,
    geometryDiagnostics:geometry.diagnostics,observationStatus:neighborhood.status,
    entries:neighborhood.entries,omittedRefs:neighborhood.omittedRefs,eligibleJunctions:[],excluded:[]};
  const nodes=new Map(),roads=new Map(),incident=new Map();
  for(const n of source.city.nodes){budget.spend();nodes.set(n.id,n);incident.set(n.id,[]);}
  for(const r of source.city.roads){
    budget.spend();roads.set(r.id,r);incident.get(r.a).push(r.id);incident.get(r.b).push(r.id);
  }
  const admitted=new Set(neighborhood.entries.map(r=>key(r.ref)));
  const fixed=new Set(geometry.junctions.filter(r=>r.role==='protected-anchor').map(r=>r.ref.id));
  for(const id of source.city.plaza?.vertices??[]){budget.spend();fixed.add(id);}
  // No repair dispatch for unresolved verification, unknown capability,
  // boundary escape or missing mandatory requested/obstruction roots.
  const fatal=geometry.diagnostics.some(d=>['invalid-input','unknown-data','unclassified','verification-failure','unsupported-capability','work-limit','protected-content'].includes(d.reason)||d.code==='boundary-escape');
  function closure(id){
    const required=new Map(),protectedIds=[],opaqueIds=[];
    const n=nodes.get(id);
    const add=(c,id)=>{budget.spend();const r=ref(c,id);required.set(key(r),r);};
    add('nodes',id);
    if(!knownFields(n,nodeFields,budget))opaqueIds.push(ref('nodes',id));
    for(const rid of incident.get(id)){
      budget.spend();const road=roads.get(rid);
      add('roads',rid);add('nodes',road.a);add('nodes',road.b);
      if(classifyRoad(road).protected)protectedIds.push(ref('roads',rid));
      if(!knownFields(road,roadFields,budget))opaqueIds.push(ref('roads',rid));
      for(const endpoint of [road.a,road.b])
        if(!knownFields(nodes.get(endpoint),nodeFields,budget))opaqueIds.push(ref('nodes',endpoint));
    }
    const refs=[...required.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,r])=>r);
    return {refs,complete:refs.every(r=>admitted.has(key(r))),protectedIds,opaqueIds};
  }
  const requested=geometry.requested.map(r=>r.ref.id);
  let requiredComplete=neighborhood.roots.every(r=>admitted.has(key(r.ref)));
  for(const id of requested){
    const c=closure(id);
    if(!c.complete||c.protectedIds.length||c.opaqueIds.length||fixed.has(id))requiredComplete=false;
  }
  if(geometry.status!=='observed'||fatal)result.status='preflight-refused';
  else if(!requiredComplete)result.status='required-scope-incomplete';
  else if(options.mode==='strict')result.status='strict-no-adjustment';
  else{
    for(const entry of neighborhood.entries){
      budget.spend();
      if(entry.ref.collection!=='nodes'||entry.role==='exact-requested')continue;
      const id=entry.ref.id,c=closure(id);
      let reason=null;
      if(entry.role==='protected-anchor'||fixed.has(id)||c.protectedIds.length)reason='protected-anchor';
      else if(c.opaqueIds.length)reason='opaque-dependency';
      else if(!c.complete)reason='incomplete-incident-scope';
      if(reason)result.excluded.push({ref:entry.ref,reason});
      else result.eligibleJunctions.push({ref:entry.ref,depth:entry.depth,
        incidentRefs:c.refs,old:{x:nodes.get(id).x,y:nodes.get(id).y},
        primaryIncidentCount:incident.get(id).filter(rid=>roads.get(rid).kind==='primary').length});
    }
    result.status=result.eligibleJunctions.length?'research-eligible':'no-eligible-neighbors';
  }
  // The report is descriptive research eligibility, never an authority
  // token or a mutable candidate. Future research must regenerate/recheck
  // the recipe internally rather than trust a serialized report.
  if(aresReplayJson(source,budget)!==before)throw Error('Fresh RTRE source mutated.');
  aresReplayJson(result,budget);
  return riFreeze(result);
}
