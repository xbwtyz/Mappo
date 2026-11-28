import { APP_VERSION } from './version.js';
import { hydrateProjectS10 } from './building-project-s10.js';
import { MAX_PROJECT_BYTES, validateJsonTree, validateStoredProject } from '../data/project-validation.js';
import { utf8Size } from '../data/project-format.js';
import { prepareRoadGroupIntentB1 } from './road-intent-c1.js';
import { createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { adaptAresGroupIssue, adaptAresIntentIssue, adaptAresRecoveryRefusal } from './ares-diagnostic-adapters.js';
import { riFreeze } from './road-impact-model.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget } from './spatial-recovery-contract.js';
import { searchSpatialUnifiedRoadGroup } from './spatial-recovery-coordinator.js';

// Separate diagnostic envelope, NOT a portable/workspace schema change.
// Detached diagnostic preflight and explicit Standard refusal replay only;
// no review, Apply or network.
export const ARES_REPLAY_VERSION=1;
const ARES_REPLAY_FORMAT='mappo-ares-diagnostic';
const ARES_REPLAY_KIND='road-group-preflight';
function aresReplayRecord(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
     Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))
    throw Error('Invalid ARES '+label+'.');
}
function aresReplaySource(value){
  if(typeof value!=='string'||!/^[a-f0-9]{40}$/.test(value))throw Error('Exact ARES source revision required.');
  return value;
}
// JSON.stringify alone loses IEEE -0. Preserve numeric values and enumerable
// persisted fields, exclude derived nonenumerable views, reject non-JSON data.
// Existing project depth/size limits also bound this diagnostic envelope.
export function aresReplayJson(value,budget=null){
  const chunks=[];let count=0,length=0;
  function append(s){
    length+=s.length;
    if(length>MAX_PROJECT_BYTES)throw Error('ARES diagnostic exceeds file limit.');
    chunks.push(s);
  }
  function visit(v,depth){
    if(budget)budget.spend();
    if(++count>1200000||depth>64)throw Error('ARES diagnostic exceeds data limits.');
    if(v===null||typeof v==='string'||typeof v==='boolean'){append(JSON.stringify(v));return;}
    if(typeof v==='number'){
      if(!Number.isFinite(v))throw Error('Invalid ARES numeric data.');
      append(Object.is(v,-0)?'-0':JSON.stringify(v));return;
    }
    if(!v||typeof v!=='object')throw Error('Invalid ARES JSON data.');
    if(Array.isArray(v)){
      if(Object.keys(v).length!==v.length)throw Error('Invalid ARES JSON array.');
      append('[');
      for(let i=0;i<v.length;i++){
        if(!Object.hasOwn(v,i))throw Error('Invalid ARES JSON array.');
        if(i)append(',');visit(v[i],depth+1);
      }
      append(']');return;
    }
    if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('Invalid ARES JSON record.');
    append('{');let first=true;
    for(const key of Object.keys(v)){
      if(key==='__proto__')throw Error('Unsafe ARES JSON key.');
      if(!first)append(',');first=false;
      append(JSON.stringify(key));append(':');visit(v[key],depth+1);
    }
    append('}');
  }
  visit(value,0);
  const text=chunks.join('');
  if(utf8Size(text)>MAX_PROJECT_BYTES)throw Error('ARES diagnostic exceeds file limit.');
  return text;
}
function aresReplayContext(input){
  const context=createAresDiagnosticContext(input);
  if(context.sourceVersion!==APP_VERSION)throw Error('Unsupported ARES replay application version.');
  return context;
}
function aresReplayProject(raw,context){
  validateJsonTree(raw);
  if(raw?.schemaVersion!==11||(raw.id??raw.city?.id)!==context.operation.projectId)
    throw Error('ARES replay project identity or schema mismatch.');
  // Hydration operates only on the separately parsed copy.
  const project=hydrateProjectS10(raw);
  validateStoredProject(project);
  return project;
}
function aresObservePreflight(project,context){
  const operation=context.operation;
  const draft=prepareRoadGroupIntentB1(project,operation.editedRefs.map(r=>r.id),operation.geometry.offset);
  const groupRefusal=draft.group?.eligible===false;
  const diagnostics=(draft.issues??[]).map(issue=>groupRefusal?
    adaptAresGroupIssue(context,issue):adaptAresIntentIssue(context,issue)).filter(Boolean);
  // No draft city, candidate, or reservation is returned.
  return riFreeze({status:draft.status,draftable:draft.draftable===true,
    topologyResolved:draft.topologyResolved===true,facesResolved:draft.facesResolved===true,
    proposedNodes:(draft.proposedNodes??[]).map(n=>({id:n.id,x:n.x,y:n.y})),diagnostics});
}
// Explicit consent is required at this entry point. No automatic transmission.
// The caller must identify the actual source revision and accepted session;
// this detached module cannot authenticate either or prove host freshness.
export function exportAresPreflightDiagnostic(project,contextInput,{confirmed=false,sourceRevision}={}){
  if(confirmed!==true)throw Error('Explicit ARES diagnostic export confirmation required.');
  const context=aresReplayContext(contextInput),revision=aresReplaySource(sourceRevision);
  const snapshotJson=aresReplayJson(project);
  const raw=JSON.parse(snapshotJson);
  const observed=aresObservePreflight(aresReplayProject(raw,context),context);
  return aresReplayJson({format:ARES_REPLAY_FORMAT,version:ARES_REPLAY_VERSION,kind:ARES_REPLAY_KIND,
    sourceRevision:revision,context,project:raw,observed});
}
// Historical replay is never live authorization. An optional current context
// can reject stale active-session evidence. Caller supplies verified source.
export function replayAresPreflightDiagnostic(text,{expectedSourceRevision,expectedContext}={}){
  const revision=aresReplaySource(expectedSourceRevision);
  if(typeof text!=='string'||text.length>MAX_PROJECT_BYTES||utf8Size(text)>MAX_PROJECT_BYTES)
    throw Error('Invalid or oversized ARES diagnostic text.');
  let envelope;
  try{envelope=JSON.parse(text);}catch{throw Error('Invalid ARES diagnostic JSON.');}
  validateJsonTree(envelope);
  aresReplayRecord(envelope,['format','version','kind','sourceRevision','context','project','observed'],'diagnostic envelope');
  if(envelope.format!==ARES_REPLAY_FORMAT||envelope.version!==ARES_REPLAY_VERSION||envelope.kind!==ARES_REPLAY_KIND)
    throw Error('Unsupported ARES diagnostic format or replay kind.');
  if(envelope.sourceRevision!==revision)throw Error('ARES diagnostic source revision mismatch.');
  const context=aresReplayContext(envelope.context);
  if(expectedContext!==undefined&&!matchesAresDiagnosticContext({version:1,context},expectedContext))
    throw Error('Stale ARES diagnostic context.');
  const observed=aresObservePreflight(aresReplayProject(envelope.project,context),context);
  const matched=aresReplayJson(envelope.observed)===aresReplayJson(observed);
  return riFreeze({version:ARES_REPLAY_VERSION,kind:ARES_REPLAY_KIND,sourceRevision:revision,
    context,status:matched?'reproduced':'mismatch',observed});
}

const ARES_STANDARD_REFUSAL_KIND='standard-road-recovery-refusal';
// This records one existing completed Standard/baseline operation. The
// caller must supply the original limits and the actual completed result.
// No new policy/quality, controlled-session, or regeneration replay here.
function aresStandardReplayBudget(context,limits){
  if(context.operation.permissions.regeneration)
    throw Error('Regeneration recovery replay is unsupported.');
  aresReplayRecord(limits,['work','stateExpansions'],'replay limits');
  const budget=context.operation.permissions.destruction?
    createSpatialDestructionBudget(limits):createSpatialPreservationBudget(limits);
  return budget;
}
function aresRefusalObservation(context,result,limits){
  if(result?.status!=='refused'||result.stopped||result.delta!==null||
     result.basisDelta!==null||result.kind!==null||result.ledger!==null||
     result.provisionalAuthorization!==null||!Array.isArray(result.attempts))
    throw Error('Expected completed Standard recovery refusal.');
  const diagnostic=adaptAresRecoveryRefusal(context,result);
  const work=diagnostic.work;
  if(work.work+work.remainingWork!==limits.work||
     work.expansions+work.remainingExpansions!==limits.stateExpansions)
    throw Error('ARES refusal budget does not match original limits.');
  // Record phase observations, not candidates or a claim of authentication.
  const attempts=result.attempts.map(row=>{
    if(!row||typeof row.phase!=='string'||!row.phase||
       !['refused','verified-witness','skipped-budget'].includes(row.status)||
       !row.stats||Object.hasOwn(row,'seedTrials')||Object.hasOwn(row,'childTrials'))
      throw Error('Unsupported Standard recovery attempt.');
    const observed={phase:row.phase,status:row.status,stats:row.stats};
    if(Object.hasOwn(row,'exhausted'))observed.exhausted=row.exhausted;
    if(Object.hasOwn(row,'work'))observed.work=row.work;
    return observed;
  });
  return {status:'refused',diagnostic,attempts};
}
export function exportAresStandardRefusalDiagnostic(project,contextInput,result,
    {confirmed=false,sourceRevision,limits,quality,schedule,controlled}={}){
  if(confirmed!==true)throw Error('Explicit ARES diagnostic export confirmation required.');
  if(quality!=='standard'||schedule!=='baseline'||controlled!==false)
    throw Error('Only completed uncontrolled Standard baseline recovery replay is supported.');
  const context=aresReplayContext(contextInput),revision=aresReplaySource(sourceRevision);
  aresStandardReplayBudget(context,limits); // validate existing ceiling, do not run
  const raw=JSON.parse(aresReplayJson(project));
  // Validate another parsed copy; export the original persisted snapshot.
  aresReplayProject(JSON.parse(aresReplayJson(raw)),context);
  const observed=aresRefusalObservation(context,result,limits);
  return aresReplayJson({format:ARES_REPLAY_FORMAT,version:ARES_REPLAY_VERSION,
    kind:ARES_STANDARD_REFUSAL_KIND,sourceRevision:revision,context,project:raw,
    limits:{work:limits.work,stateExpansions:limits.stateExpansions},observed});
}
export async function replayAresStandardRefusalDiagnostic(text,
    {expectedSourceRevision,expectedContext}={}){
  const revision=aresReplaySource(expectedSourceRevision);
  if(typeof text!=='string'||text.length>MAX_PROJECT_BYTES||utf8Size(text)>MAX_PROJECT_BYTES)
    throw Error('Invalid or oversized ARES diagnostic text.');
  let envelope;
  try{envelope=JSON.parse(text);}catch{throw Error('Invalid ARES diagnostic JSON.');}
  validateJsonTree(envelope);
  aresReplayRecord(envelope,['format','version','kind','sourceRevision','context','project','limits','observed'],'recovery diagnostic envelope');
  if(envelope.format!==ARES_REPLAY_FORMAT||envelope.version!==ARES_REPLAY_VERSION||
     envelope.kind!==ARES_STANDARD_REFUSAL_KIND)
    throw Error('Unsupported ARES recovery diagnostic format.');
  if(envelope.sourceRevision!==revision)throw Error('ARES diagnostic source revision mismatch.');
  const context=aresReplayContext(envelope.context);
  if(expectedContext!==undefined&&!matchesAresDiagnosticContext({version:1,context},expectedContext))
    throw Error('Stale ARES diagnostic context.');
  const budget=aresStandardReplayBudget(context,envelope.limits);
  const project=aresReplayProject(envelope.project,context);
  const result=await searchSpatialUnifiedRoadGroup(project,context.operation,budget,
    {quality:'standard',schedule:'baseline'});
  // A changed search result is a mismatch, never an offered witness.
  const observed=result.status==='refused'?
    aresRefusalObservation(context,result,envelope.limits):{status:'different-search-result'};
  const matched=result.status==='refused'&&aresReplayJson(envelope.observed)===aresReplayJson(observed);
  return riFreeze({version:ARES_REPLAY_VERSION,kind:ARES_STANDARD_REFUSAL_KIND,
    sourceRevision:revision,context,status:matched?'reproduced':'mismatch',observed});
}
