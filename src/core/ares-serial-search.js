import { createAresDiagnosticContext, matchesAresDiagnosticContext, createAresDiagnostic } from './ares-diagnostic-contract.js';
import { createAresStrategyRegistry } from './ares-strategy-registry.js';
import { createAresSearchLedger } from './ares-search-ledger.js';
import { createAresCandidateRetention } from './ares-candidate-retention.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { LareBudgetExceeded } from './reconciliation-budget.js';
import { riFreeze } from './road-impact-model.js';

// P3 serial reference, trusted in-process research adapters only. No live
// authority, worker transport, runtime defaults or time-based decisions.
export const ARES_SERIAL_VERSION=1;
function record(v,keys,label){
  if(!v||typeof v!=='object'||Array.isArray(v)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(v))||
    Reflect.ownKeys(v).length!==keys.length||
    keys.some(k=>!Object.hasOwn(v,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))
    throw Error('Invalid ARES '+label+'.');
}
function integer(v,min){
  if(!Number.isSafeInteger(v)||v<min)throw Error('Invalid ARES serial limit.');
  return v;
}
function token(v){
  if(typeof v!=='string'||!v.trim()||v.length>200)throw Error('Invalid ARES serial ID.');
  return v;
}
function detach(v,budget){return riFreeze(JSON.parse(aresReplayJson(v,budget)));}
function diagnosticList(input,context,budget){
  if(!Array.isArray(input))throw Error('Invalid ARES serial feedback.');
  return input.map(d=>{
    budget.spend();
    if(!matchesAresDiagnosticContext(d,context))throw Error('Stale ARES serial feedback.');
    const {version,context:ignored,...payload}=d;
    return createAresDiagnostic(context,payload);
  });
}
function normalizePolicy(p){
  record(p,['verificationReserveWork','verificationReserveExpansions','maxStagnantTasks'],'serial policy');
  return Object.freeze({verificationReserveWork:integer(p.verificationReserveWork,1),
    verificationReserveExpansions:integer(p.verificationReserveExpansions,0),
    maxStagnantTasks:integer(p.maxStagnantTasks,1)});
}
function proposalResult(raw,task,budget){
  const r=detach(raw,budget);
  record(r,['version','taskId','context','snapshotFingerprint','status','proposal','diagnostics'],'strategy result');
  if(r.version!==1||r.taskId!==task.taskId||r.snapshotFingerprint!==task.snapshotFingerprint||
     !matchesAresDiagnosticContext({version:1,context:r.context},task.context))
    throw Error('Stale ARES strategy result.');
  if(!['proposed','refused'].includes(r.status)||(r.status==='refused'?r.proposal!==null:r.proposal===null))
    throw Error('Invalid ARES strategy outcome.');
  return {status:r.status,proposal:r.proposal,diagnostics:diagnosticList(r.diagnostics,task.context,budget)};
}
// Caller declares finite logical tasks and their maximum slices in explicit
// order. Irrelevant tasks remain pending until feedback makes them relevant.
// Each logical task is attempted at most once. Unused capacity stays in
// the original root; later tasks may draw it up to their explicit ceiling.
export async function runAresSerialSearch(input,root){
  record(input,['context','snapshotFingerprint','capabilities','diagnostics','strategies','tasks',
    'profile','capacity','verify','policy','checkpoint'],'serial input');
  const context=createAresDiagnosticContext(input.context),snapshotFingerprint=input.snapshotFingerprint;
  const policy=normalizePolicy(input.policy);
  if(!Array.isArray(input.strategies)||!Array.isArray(input.tasks)||
     (input.checkpoint!==null&&typeof input.checkpoint!=='function'))
    throw Error('Invalid ARES serial configuration.');
  const checkpoint=input.checkpoint;
  const ledger=createAresSearchLedger(context,snapshotFingerprint,root);
  const strategies=new Map(),descriptors=[];
  for(const entry of input.strategies){
    root.spend();record(entry,['descriptor','execute'],'strategy adapter');
    if(typeof entry.execute!=='function')throw Error('Missing ARES strategy executor.');
    const d=entry.descriptor;
    if(strategies.has(d?.id))throw Error('Duplicate ARES strategy executor.');
    strategies.set(d?.id,entry.execute);descriptors.push(d);
  }
  const registry=createAresStrategyRegistry(descriptors,root);
  const retention=createAresCandidateRetention(context,snapshotFingerprint,input.profile,input.capacity,input.verify,root);
  const capabilities=detach(input.capabilities,root);
  let diagnostics=diagnosticList(input.diagnostics,context,root);
  // Prevalidate input before any dispatch, including unknown capabilities,
  // duplicate tokens and malformed initial diagnostic rows.
  registry.assess(context,{capabilities,diagnostics},root);
  const ids=new Set(),pending=input.tasks.map(t=>{
    root.spend();record(t,['taskId','strategyId','limits'],'planned task');
    const taskId=token(t.taskId),strategyId=token(t.strategyId);
    if(ids.has(taskId)||!strategies.has(strategyId))throw Error('Duplicate or unknown ARES planned task.');
    ids.add(taskId);record(t.limits,['work','stateExpansions'],'planned limits');
    return riFreeze({taskId,strategyId,limits:{work:integer(t.limits.work,1),
      stateExpansions:integer(t.limits.stateExpansions,1)}});
  });
  const events=[];let stagnant=0;
  const evidence=()=>riFreeze({version:1,context,snapshotFingerprint,policy,
    pending:[...pending],events:[...events],stagnant,ledger:ledger.snapshot(),retention:retention.snapshot()});
  const finish=(reason,failure=null)=>riFreeze({reason,failure,...evidence()});
  const settlement=(h,status)=>({version:1,taskId:h.task.taskId,context,snapshotFingerprint,status});
  // Stagnation compares measured criteria, not fingerprint tie-breaks.
  function improved(before,after){
    if(!after)return false;
    if(!before)return true;
    return retention.snapshot().profile.criteria.some(c=>before.metrics[c.metric]!==after.metrics[c.metric]);
  }
  while(pending.length){
    if(checkpoint){
      const decision=await checkpoint(evidence());
      if(decision==='stop')return finish('stopped');
      if(decision!==undefined&&decision!=='continue')throw Error('Invalid ARES checkpoint decision.');
    }
    if(stagnant>=policy.maxStagnantTasks)return finish('stagnation-limit');
    let assessment;
    try{assessment=registry.assess(context,{capabilities,diagnostics},root);}
    catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit',e.resource);throw e;}
    const byId=new Map(assessment.assessments.map(a=>[a.descriptor.id,a]));
    // The finite plan order is explicit; no clock or completion-order inputs.
    const index=pending.findIndex(t=>byId.get(t.strategyId).status==='eligible-for-consideration');
    if(index<0)return finish('no-eligible-task');
    const spec=pending[index],row=byId.get(spec.strategyId),left=root.snapshot();
    const limits={work:Math.min(spec.limits.work,left.remainingWork-2-policy.verificationReserveWork),
      stateExpansions:Math.min(spec.limits.stateExpansions,left.remainingExpansions-policy.verificationReserveExpansions)};
    if(limits.work<1||limits.stateExpansions<1)return finish('work-limit',limits.work<1?'work':'stateExpansions');
    const h=ledger.open({version:1,taskId:spec.taskId,strategyId:spec.strategyId,
      strategyVersion:row.descriptor.version,context,snapshotFingerprint,limits});
    pending.splice(index,1);
    let outcome;
    try{
      outcome=proposalResult(await strategies.get(spec.strategyId)(h.task,riFreeze([...diagnostics]),h.budget),h.task,h.budget);
      ledger.settle(h,settlement(h,outcome.status==='proposed'?'completed':'refused'));
    }catch(e){
      ledger.abandon(h);
      events.push(riFreeze({taskId:spec.taskId,status:e instanceof LareBudgetExceeded?'slice-exhausted':'strategy-failed',
        ...(e instanceof LareBudgetExceeded?{resource:e.resource}:{})}));
      if(!(e instanceof LareBudgetExceeded))return finish('failed','strategy-result');
      stagnant++;continue;
    }
    // Feedback is advisory; only the independent verifier can retain a
    // candidate. Deduplicate complete diagnostic rows before later routing.
    let considered=null;
    const before=retention.snapshot().incumbent;
    try{
      const seen=new Set(diagnostics.map(d=>aresReplayJson(d,root)));
      for(const d of outcome.diagnostics){
        const key=aresReplayJson(d,root);
        if(!seen.has(key)){seen.add(key);diagnostics.push(d);}
      }
      if(outcome.status==='proposed')considered=await retention.consider({version:1,context,snapshotFingerprint,proposal:outcome.proposal});
    }catch(e){
      events.push(riFreeze({taskId:spec.taskId,status:e instanceof LareBudgetExceeded?'verification-budget':'verification-failed'}));
      return finish(e instanceof LareBudgetExceeded?'work-limit':'failed',e instanceof LareBudgetExceeded?e.resource:'verification-result');
    }
    const progress=improved(before,retention.snapshot().incumbent);
    stagnant=progress?0:stagnant+1;
    events.push(riFreeze({taskId:spec.taskId,status:outcome.status,considered,improved:progress}));
  }
  return finish('plan-complete');
}
