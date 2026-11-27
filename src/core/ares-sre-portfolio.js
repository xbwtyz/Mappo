import { createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { adaptAresRecoveryRefusal } from './ares-diagnostic-adapters.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { hydrateProjectS10 } from './building-project-s10.js';
import { createAresSreVerifier } from './ares-sre-verifier.js';
import { runAresSerialSearch } from './ares-serial-search.js';
import { searchSpatialUnifiedRoadGroup } from './spatial-recovery-coordinator.js';
import { LARE_PRESERVATION_LIMITS, LARE_DEMOLITION_LIMITS } from './reconciliation-budget.js';
import { riFreeze } from './road-impact-model.js';

// Initial research portfolio: existing Standard schedules only. This is
// not a new geometry solver, default mode or replacement of mounted SRE.
export const ARES_SRE_STRATEGY_IDS=Object.freeze(['sre-baseline','sre-grouped-first','sre-area-deficit-direct']);
const schedules=Object.freeze(['baseline','grouped-first','area-deficit-direct']);
function record(value,keys){
  if(!value||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==keys.length||
    keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))
    throw Error('Invalid ARES SRE portfolio configuration.');
}
function checkRoot(root,context){
  if(typeof root?.snapshot!=='function'||typeof root?.spend!=='function'||typeof root?.expand!=='function')
    throw Error('Existing ARES SRE root budget required.');
  const limits=context.operation.permissions.destruction?LARE_DEMOLITION_LIMITS:LARE_PRESERVATION_LIMITS;
  const s=root.snapshot();
  if(!['work','expansions','remainingWork','remainingExpansions'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)||
     s.work+s.remainingWork>limits.work||s.expansions+s.remainingExpansions>limits.stateExpansions)
    throw Error('ARES SRE Standard root exceeds existing limits.');
}
export async function runAresSrePortfolio(project,contextInput,input,root){
  record(input,['tasks','diagnostics','profile','capacity','policy','checkpoint']);
  const context=createAresDiagnosticContext(contextInput);
  if(context.operation.permissions.regeneration)throw Error('ARES SRE portfolio regeneration unsupported.');
  checkRoot(root,context);
  // Own the persisted source and caller-controlled plan before any await.
  const source=hydrateProjectS10(JSON.parse(aresReplayJson(project,root)));
  const {tasks,diagnostics,profile,capacity,policy}=JSON.parse(aresReplayJson({
    tasks:input.tasks,diagnostics:input.diagnostics,profile:input.profile,capacity:input.capacity,policy:input.policy
  },root));
  const checkpoint=input.checkpoint;
  const verifier=await createAresSreVerifier(source,context,root);
  const snapshotFingerprint=verifier.snapshotFingerprint;
  const strategies=ARES_SRE_STRATEGY_IDS.map((id,i)=>({
    descriptor:{id,version:1,requiredCapabilities:['sre-standard-road-group'],
      requiredPermissions:i?['destruction']:[],
      blockerReasons:i?['search-exhausted','work-limit','domain-violation']:[]},
    async execute(task,feedback,budget){
      if(task.strategyId!==id||task.strategyVersion!==1||task.snapshotFingerprint!==snapshotFingerprint||
        !matchesAresDiagnosticContext({version:1,context:task.context},context))
        throw Error('Stale ARES SRE strategy task.');
      if(i&&!context.operation.permissions.destruction)throw Error('Unauthorized ARES SRE alternate schedule.');
      // The lease is the actual parent of every internal SRE search phase.
      // Keep the complete existing schedule semantics and fallback order.
      const result=await searchSpatialUnifiedRoadGroup(source,context.operation,budget,{quality:'standard',schedule:schedules[i]});
      if(!matchesAresDiagnosticContext({version:1,context:{...context,operation:result.operation}},context))
        throw Error('Mismatched ARES SRE strategy operation.');
      const envelope={version:1,taskId:task.taskId,context,snapshotFingerprint};
      if(result.status==='refused'){
        return {...envelope,status:'refused',proposal:null,diagnostics:[adaptAresRecoveryRefusal(context,result)]};
      }
      if(result.status!=='verified-witness'||!['nondestructive','retirement'].includes(result.kind)||
         !result.delta||!result.basisDelta||result.provisionalAuthorization!==null)
        throw Error('Unsupported ARES SRE strategy witness.');
      // No claimed score, ledger, verification flag or provisional receipt
      // crosses the seam. The C2 verifier reconstructs both deltas anew.
      return {...envelope,status:'proposed',proposal:{kind:result.kind,delta:result.delta,basisDelta:result.basisDelta},diagnostics:[]};
    }
  }));
  return runAresSerialSearch({context,snapshotFingerprint,capabilities:['sre-standard-road-group'],
    diagnostics,strategies,tasks,profile,capacity,verify:verifier.verify,policy,checkpoint},root);
}
