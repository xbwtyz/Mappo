import { createSpatialOperation, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { riCompare, riFreeze } from './road-impact-model.js';

// P1 detached, transient evidence only. No engine may use this as Apply authority.
export const ARES_DIAGNOSTIC_VERSION = 1;
export const ARES_REFUSAL_REASONS = Object.freeze([
  'invalid-input', 'domain-violation', 'protected-content', 'permission-required',
  'scope-limited', 'unsupported-capability', 'unknown-data', 'search-exhausted',
  'work-limit', 'verification-failure', 'stopped', 'canceled', 'stale', 'unclassified'
]);
function aresP1Record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some(k => !keys.includes(k)))
    throw Error('Invalid ARES ' + label + '.');
}
function aresP1Text(value, label, max=200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw Error('Invalid ARES ' + label + '.');
  return value;
}
function aresP1Refs(refs) {
  if (!Array.isArray(refs)) throw Error('Invalid ARES references.');
  const unique = new Map();
  for (const value of refs) {
    const ref = createSpatialRef(value);
    unique.set(spatialRefKey(ref), ref);
  }
  return [...unique.entries()].sort(([a],[b])=>riCompare(a,b)).map(([,v])=>v);
}
function aresP1Work(value) {
  aresP1Record(value,['work','expansions','remainingWork','remainingExpansions'],'work evidence');
  for (const key of ['work','expansions','remainingWork','remainingExpansions'])
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw Error('Invalid ARES work evidence.');
  if (value.expansions > value.work || value.remainingExpansions > Number.MAX_SAFE_INTEGER - value.expansions ||
      value.remainingWork > Number.MAX_SAFE_INTEGER - value.work) throw Error('Invalid ARES work accounting.');
  return {work:value.work,expansions:value.expansions,remainingWork:value.remainingWork,remainingExpansions:value.remainingExpansions};
}
// Preserve the exact normalized existing operation. No future mode is activated.
export function createAresDiagnosticContext(input) {
  aresP1Record(input,['version','sessionId','operation','sourceVersion'],'diagnostic context');
  if (input.version !== ARES_DIAGNOSTIC_VERSION) throw Error('Unsupported ARES diagnostic version.');
  const operation=createSpatialOperation(input.operation);
  if(operation.family!=='road'||operation.operation!=='translate-road-group'||!operation.geometry||
     operation.editedRefs.some(ref=>ref.collection!=='roads')) throw Error('Unsupported ARES P1 operation.');
  return riFreeze({version:ARES_DIAGNOSTIC_VERSION,sessionId:aresP1Text(input.sessionId,'session'),
    sourceVersion:aresP1Text(input.sourceVersion,'source version'),operation});
}
// A caller supplies already-grounded typed refs, not inferred collections or IDs.
// Reason labels describe observed evidence; they never prove global infeasibility.
export function createAresDiagnostic(contextInput,input) {
  const context=createAresDiagnosticContext(contextInput);
  aresP1Record(input,['reason','code','stage','message','refs','source','work','unresolvedIds','measurements'],'diagnostic');
  if(!ARES_REFUSAL_REASONS.includes(input.reason)) throw Error('Unsupported ARES refusal reason.');
  aresP1Record(input.source,['id','version'],'diagnostic source');
  const result={version:ARES_DIAGNOSTIC_VERSION,context,reason:input.reason,
    code:aresP1Text(input.code,'code'),stage:aresP1Text(input.stage,'stage'),
    message:aresP1Text(input.message,'message',4000),refs:aresP1Refs(input.refs),
    source:{id:aresP1Text(input.source.id,'source ID'),version:aresP1Text(input.source.version,'source contract version')}};
  if(Object.hasOwn(input,'work'))result.work=aresP1Work(input.work);
  // Unresolved IDs are source-reported strings, never typed entity claims.
  if(Object.hasOwn(input,'unresolvedIds')){
    if(!Array.isArray(input.unresolvedIds))throw Error('Invalid ARES unresolved IDs.');
    result.unresolvedIds=[...new Set(input.unresolvedIds.map(id=>aresP1Text(id,'unresolved ID')))].sort(riCompare);
  }
  if(Object.hasOwn(input,'measurements')){
    const m=input.measurements;
    aresP1Record(m,['unit','newDistance','requiredDistance','oldDistance','oldRequiredDistance'],'measurements');
    if(m.unit!=='map-unit'||!Number.isFinite(m.newDistance)||m.newDistance<0||
       !Number.isFinite(m.requiredDistance)||m.requiredDistance<0||
       !['oldDistance','oldRequiredDistance'].every(k=>m[k]===null||(Number.isFinite(m[k])&&m[k]>=0)))
      throw Error('Invalid ARES distance measurements.');
    result.measurements={unit:m.unit,newDistance:m.newDistance,requiredDistance:m.requiredDistance,
      oldDistance:m.oldDistance,oldRequiredDistance:m.oldRequiredDistance};
  }
  return riFreeze(result);
}
// Compare complete normalized context, including exact intent and permissions.
// This rejects mismatched evidence; it is not a host revision or authenticity check.
export function matchesAresDiagnosticContext(diagnostic,contextInput) {
  const context=createAresDiagnosticContext(contextInput);
  try {
    if(diagnostic?.version!==ARES_DIAGNOSTIC_VERSION)return false;
    const observed=createAresDiagnosticContext(diagnostic.context);
    return JSON.stringify(observed)===JSON.stringify(context)&&
      ['x','y'].every(k=>Object.is(observed.operation.geometry.offset[k],context.operation.geometry.offset[k]));
  } catch { return false; }
}
