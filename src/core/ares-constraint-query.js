import { createAresConstraintRegistry } from './ares-constraint-registry.js';
import { createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { riFreeze, riCompare } from './road-impact-model.js';

export const ARES_CONSTRAINT_QUERY_VERSION=1;
// Detached, synchronous internal provider contract. No external plugins,
// persistent geometry, accepted-city authority or new search allowance.
function aresQueryRecord(v,keys,label){
  if(!v||typeof v!=='object'||Array.isArray(v)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(v))||
     Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))
    throw Error('Invalid ARES '+label+'.');
}
function aresQueryText(v,label){
  if(typeof v!=='string'||!v.trim()||v.length>200)throw Error('Invalid ARES '+label+'.');
  return v;
}
function aresQueryRefs(values){
  if(!Array.isArray(values))throw Error('Invalid ARES constraint references.');
  const refs=new Map();
  for(const value of values){
    const ref=createSpatialRef(value);refs.set(spatialRefKey(ref),ref);
  }
  return [...refs.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,ref])=>ref);
}
function aresQueryFrame(v){
  aresQueryRecord(v,['horizontal','vertical'],'coordinate frame');
  if(v.horizontal!=='city-map-unit')throw Error('Unsupported ARES horizontal frame.');
  if(v.vertical===null)return {horizontal:v.horizontal,vertical:null};
  aresQueryRecord(v.vertical,['unit','datum'],'vertical frame');
  return {horizontal:v.horizontal,vertical:{unit:aresQueryText(v.vertical.unit,'vertical unit'),
    datum:aresQueryText(v.vertical.datum,'vertical datum')}};
}
function aresQueryRange(v){
  aresQueryRecord(v,['min','max'],'coordinate range');
  if(!Number.isFinite(v.min)||!Number.isFinite(v.max)||v.min>v.max)
    throw Error('Invalid ARES coordinate range.');
  return {min:v.min,max:v.max};
}
export function createAresConstraintQuery(input){
  aresQueryRecord(input,['version','context','snapshotFingerprint','geometryFingerprint',
    'capability','phase','frame','bounds','refs'],'constraint query');
  if(input.version!==ARES_CONSTRAINT_QUERY_VERSION||!['swept','final'].includes(input.phase))
    throw Error('Unsupported ARES query contract.');
  const frame=aresQueryFrame(input.frame);
  aresQueryRecord(input.bounds,['x','y','z'],'query bounds');
  const bounds={x:aresQueryRange(input.bounds.x),y:aresQueryRange(input.bounds.y),
    z:input.bounds.z===null?null:aresQueryRange(input.bounds.z)};
  if(bounds.z!==null&&frame.vertical===null)throw Error('Vertical bounds require an explicit datum.');
  return riFreeze({version:ARES_CONSTRAINT_QUERY_VERSION,context:createAresDiagnosticContext(input.context),
    snapshotFingerprint:aresQueryText(input.snapshotFingerprint,'snapshot fingerprint'),
    geometryFingerprint:aresQueryText(input.geometryFingerprint,'geometry fingerprint'),
    capability:aresQueryText(input.capability,'capability'),phase:input.phase,frame,bounds,refs:aresQueryRefs(input.refs)});
}
function aresQueryEqual(a,b){
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&aresQueryEqual(a[k],b[k]));
}
export function matchesAresConstraintQuery(evidence,expected){
  const query=createAresConstraintQuery(expected);
  try{
    return evidence?.version===ARES_CONSTRAINT_QUERY_VERSION&&
      matchesAresDiagnosticContext({version:1,context:evidence.query.context},query.context)&&
      aresQueryEqual(createAresConstraintQuery(evidence.query),query);
  }catch{return false;}
}
function aresConstraintRow(v){
  aresQueryRecord(v,['id','ruleVersion','kind','outcome','refs','anchorRefs','detail'],'constraint row');
  if(!['hard-domain','protection','permission','preference'].includes(v.kind)||
     !['satisfied','violated','unknown','unsupported'].includes(v.outcome))
    throw Error('Invalid ARES constraint outcome.');
  return {id:aresQueryText(v.id,'constraint ID'),ruleVersion:aresQueryText(v.ruleVersion,'rule version'),
    kind:v.kind,outcome:v.outcome,refs:aresQueryRefs(v.refs),anchorRefs:aresQueryRefs(v.anchorRefs),
    detail:aresQueryText(v.detail,'constraint detail')};
}
// No rows is not a verified pass. This summary is strictly evidence, not
// authorization, and even satisfied hard rows require independent verification.
function aresConstraintSummary(rows){
  if(rows.some(r=>r.kind!=='preference'&&r.outcome==='violated'))return 'blocked';
  if(!rows.some(r=>r.kind!=='preference')||
     rows.some(r=>r.kind!=='preference'&&['unknown','unsupported'].includes(r.outcome)))return 'unresolved';
  return 'observed-satisfied';
}
function aresProviderEvidence(query,provider,status,rows=[]){
  return riFreeze({version:ARES_CONSTRAINT_QUERY_VERSION,query,provider,
    status,rows,summary:status==='observed'?aresConstraintSummary(rows):'unresolved'});
}
// Internal code registration only. Providers receive frozen detached query
// DTOs and a metered charge function, never the accepted project or a writer.
// Existing operation budget is supplied by the caller; this module creates none.
export function createAresConstraintQueryService(entries){
  if(!Array.isArray(entries))throw Error('Invalid ARES query providers.');
  const handlers=new Map();
  for(const entry of entries){
    aresQueryRecord(entry,['descriptor','evaluate'],'query provider');
    if(typeof entry.evaluate!=='function')throw Error('Invalid ARES provider evaluator.');
    handlers.set(entry.descriptor?.id,entry.evaluate);
  }
  const registry=createAresConstraintRegistry(entries.map(e=>e.descriptor));
  const descriptors=registry.descriptors();
  return Object.freeze({
    descriptors:()=>descriptors,
    query(providerId,input,budget){
      const query=createAresConstraintQuery(input);
      aresQueryText(providerId,'provider ID');
      if(!budget||typeof budget.spend!=='function')throw Error('Shared ARES query budget required.');
      budget.spend();
      const descriptor=descriptors.find(d=>d.id===providerId)??null;
      if(!descriptor||!registry.supports(providerId,query.capability))
        return aresProviderEvidence(query,descriptor,'unsupported');
      // Provider exceptions and budget exhaustion propagate; no partial result
      // or implicit pass. Meter every returned row with the same budget.
      const result=handlers.get(providerId)(query,n=>budget.spend(n));
      if(!Array.isArray(result))throw Error('Invalid ARES provider response.');
      const rows=[],ids=new Set();
      for(const row of result){
        budget.spend();
        const normalized=aresConstraintRow(row);
        if(ids.has(normalized.id))throw Error('Duplicate ARES constraint ID.');
        ids.add(normalized.id);rows.push(normalized);
      }
      rows.sort((a,b)=>riCompare(a.id,b.id));
      return aresProviderEvidence(query,descriptor,'observed',rows);
    }
  });
}
