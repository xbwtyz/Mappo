import { createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { LareBudgetExceeded } from './reconciliation-budget.js';
import { riFreeze } from './road-impact-model.js';

// Serial reference ledger. The trusted coordinator supplies an existing
// operation root; no new root, ceiling, concurrent lease or runtime default.
export const ARES_TASK_VERSION=1;
const counters=['work','expansions','remainingWork','remainingExpansions'];
function exactRecord(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==keys.length||
    keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))
    throw Error('Invalid ARES '+label+'.');
}
function token(value){
  if(typeof value!=='string'||!value.trim()||value.length>200)throw Error('Invalid ARES task ID.');
  return value;
}
function fingerprint(value){
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error('Invalid ARES snapshot fingerprint.');
  return value;
}
function taskLimits(input){
  exactRecord(input,['work','stateExpansions'],'task limits');
  if(!Number.isSafeInteger(input.work)||input.work<1||
     !Number.isSafeInteger(input.stateExpansions)||input.stateExpansions<1)
    throw Error('Invalid ARES task limits.');
  return Object.freeze({work:input.work,stateExpansions:input.stateExpansions});
}
function read(root){
  const s=root.snapshot();
  exactRecord(s,counters,'root budget snapshot');
  if(counters.some(k=>!Number.isSafeInteger(s[k])||s[k]<0)||s.expansions>s.work||
     !Number.isSafeInteger(s.work+s.remainingWork)||
     !Number.isSafeInteger(s.expansions+s.remainingExpansions))
    throw Error('Invalid ARES root accounting.');
  return {...s};
}
function sameContext(expected,input){
  return matchesAresDiagnosticContext({version:1,context:expected},input);
}
export function createAresSearchLedger(contextInput,snapshotInput,root){
  const context=createAresDiagnosticContext(contextInput),snapshotFingerprint=fingerprint(snapshotInput);
  if(typeof root?.spend!=='function'||typeof root?.expand!=='function'||typeof root?.snapshot!=='function')
    throw Error('Existing shared ARES root budget required.');
  const initial=read(root),capWork=initial.work+initial.remainingWork,
    capExpansions=initial.expansions+initial.remainingExpansions;
  const seen=new Set(),settled=[];
  let active=null,sequence=0;
  const readRoot=()=>{
    const s=read(root);
    if(s.work+s.remainingWork!==capWork||s.expansions+s.remainingExpansions!==capExpansions)
      throw Error('ARES root limits changed.');
    return s;
  };
  function check(handle){
    if(!active||active.handle!==handle)throw Error('Stale or closed ARES task lease.');
    const s=readRoot();
    if(s.work!==active.start.work+active.work||s.expansions!==active.start.expansions+active.expansions)
      throw Error('ARES root was modified outside the active task.');
    return active;
  }
  function charge(handle,count,expand){
    const a=check(handle);
    if(!Number.isSafeInteger(count)||count<1)throw Error('ARES task charge must be a positive integer.');
    if(expand&&a.expansions>=a.task.limits.stateExpansions)throw new LareBudgetExceeded('stateExpansions');
    if(count>a.task.limits.work-a.work)throw new LareBudgetExceeded('work');
    if(expand)root.expand();else root.spend(count);
    a.work+=count;if(expand)a.expansions++;
    check(handle);
  }
  const usage=a=>Object.freeze({work:a.work,expansions:a.expansions,
    remainingWork:a.task.limits.work-a.work,remainingExpansions:a.task.limits.stateExpansions-a.expansions});
  function close(handle,status){
    const a=check(handle);
    const row=riFreeze({version:ARES_TASK_VERSION,task:a.task,status,usage:usage(a),root:readRoot()});
    settled.push(row);active=null;return row;
  }
  return Object.freeze({
    open(input){
      if(active)throw Error('ARES serial task already active.');
      exactRecord(input,['version','taskId','strategyId','strategyVersion','context','snapshotFingerprint','limits'],'task');
      if(input.version!==ARES_TASK_VERSION||!Number.isSafeInteger(input.strategyVersion)||input.strategyVersion<1)
        throw Error('Unsupported ARES task version.');
      if(!sameContext(context,input.context)||input.snapshotFingerprint!==snapshotFingerprint)
        throw Error('Stale ARES task source.');
      const taskId=token(input.taskId),strategyId=token(input.strategyId),limits=taskLimits(input.limits);
      if(seen.has(taskId))throw Error('Duplicate ARES logical task.');
      const remaining=readRoot();
      // Two logical work units cover dispatch and settlement, charged before
      // exposing the child. Closing a fully exhausted slice stays possible.
      if(limits.work+2>remaining.remainingWork)throw new LareBudgetExceeded('work');
      if(limits.stateExpansions>remaining.remainingExpansions)throw new LareBudgetExceeded('stateExpansions');
      root.spend(2);
      const task=riFreeze({version:ARES_TASK_VERSION,sequence:sequence++,taskId,strategyId,
        strategyVersion:input.strategyVersion,context,snapshotFingerprint,limits});
      const handle=Object.freeze({task,budget:Object.freeze({
        spend(count=1){charge(handle,count,false);},
        expand(){charge(handle,1,true);},
        snapshot(){return usage(check(handle));}
      })});
      active={handle,task,start:readRoot(),work:0,expansions:0};
      seen.add(taskId);return handle;
    },
    settle(handle,result){
      const a=check(handle);
      exactRecord(result,['version','taskId','context','snapshotFingerprint','status'],'task result');
      if(result.version!==ARES_TASK_VERSION||result.taskId!==a.task.taskId||
        !sameContext(context,result.context)||result.snapshotFingerprint!==snapshotFingerprint)
        throw Error('Stale ARES task result.');
      if(!['completed','refused','stopped','failed'].includes(result.status))throw Error('Invalid ARES task status.');
      // Usage comes from actual child operations, never a reported counter.
      // Completion is a bookkeeping outcome, not a verified witness.
      return close(handle,result.status);
    },
    abandon(handle){return close(handle,'failed');},
    snapshot(){
      if(active)check(active.handle);
      return riFreeze({version:ARES_TASK_VERSION,context,snapshotFingerprint,root:readRoot(),
        active:active?{task:active.task,usage:usage(active)}:null,settled:[...settled]});
    }
  });
}
