import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ARES_P3_MANIFEST as manifest, materializeAresP3Case } from './ares-p3-fixtures.mjs';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { createAresSreVerifier } from '../../../src/core/ares-sre-verifier.js';
import { createAresCandidateRetention } from '../../../src/core/ares-candidate-retention.js';
import { runAresSrePortfolio } from '../../../src/core/ares-sre-portfolio.js';
import { searchSpatialUnifiedRoadGroup } from '../../../src/core/spatial-recovery-coordinator.js';
import { adaptAresRecoveryRefusal } from '../../../src/core/ares-diagnostic-adapters.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../../../src/core/spatial-recovery-contract.js';
import { createLareBudget, LareBudgetExceeded, LARE_PRESERVATION_LIMITS, LARE_DEMOLITION_LIMITS } from '../../../src/core/reconciliation-budget.js';
import { riFreeze } from '../../../src/core/road-impact-model.js';
import { inspectAresP3Topology } from './ares-p3-topology-preflight.mjs';

const frozen=riFreeze(JSON.parse(readFileSync(new URL(
  '../../../tests/fixtures/ares-p3-frozen-identities.json',import.meta.url),'utf8')));
const sha=s=>createHash('sha256').update(s).digest('hex');
const now=()=>performance.now();
const heap=()=>process.memoryUsage().heapUsed;
function summary(row){
  return row?{fingerprint:row.candidateFingerprint,metrics:row.metrics}:null;
}
function checkSource(f,source){
  const expected=frozen.rows.find(r=>r.id===f.case.id);
  assert.ok(expected,'Missing pre-measurement frozen identity');
  assert.equal(sha(source),expected.source);
  assert.deepEqual(f.context.operation,expected.operation);
  assert.deepEqual(f.limits,expected.limits);
}
function rootFor(f){
  return f.context.operation.permissions.destruction?
    createSpatialDestructionBudget(f.limits):createSpatialPreservationBudget(f.limits);
}
// Direct reference uses the same independent verifier, ranking profile,
// root cap and dispatch reserve. Its internal Standard schedule is unchanged.
// This is a detached comparison, not the entire W4 mounted workflow.
async function direct(f,root,started){
  const {project,context}=f;
  const verifier=await createAresSreVerifier(project,context,root);
  const r=createAresCandidateRetention(context,verifier.snapshotFingerprint,
    manifest.profile,manifest.capacity,verifier.verify,root);
  const left=root.snapshot(),limits={
    work:left.remainingWork-manifest.policy.verificationReserveWork,
    stateExpansions:left.remainingExpansions-manifest.policy.verificationReserveExpansions
  };
  if(limits.work<1||limits.stateExpansions<1)return {status:'refused',reason:'dispatch-budget',
    incumbent:null,firstVerifiedMs:null,searchMs:null,verificationMs:null,searchWork:null,overheadWork:null,phases:[]};
  const child=createLareBudget(limits,{parent:root,ceiling:context.operation.permissions.destruction?
    LARE_DEMOLITION_LIMITS:LARE_PRESERVATION_LIMITS});
  const t=now();
  const result=await searchSpatialUnifiedRoadGroup(project,context.operation,child,{quality:'standard',schedule:'baseline'});
  const searchMs=now()-t,searchWork=child.snapshot().work;
  const phases=result.attempts.map(a=>({phase:a.phase,status:a.status,work:a.work??null,exhausted:a.exhausted??null}));
  const details={searchMs,searchWork,phases};
  if(result.status==='refused'){
    const d=adaptAresRecoveryRefusal(context,result);
    // Meter the actual reference refusal evidence too.
    aresReplayJson(d,root);
    return {...details,status:'refused',reason:d.reason,incumbent:null,firstVerifiedMs:null,
      verificationMs:null,overheadWork:root.snapshot().work-searchWork};
  }
  if(result.status!=='verified-witness'||!['nondestructive','retirement'].includes(result.kind)||
     !result.delta||!result.basisDelta||result.provisionalAuthorization!==null)
    throw Error('Unexpected reference witness');
  const verifyStart=now();
  try{
    await r.consider({version:1,context,snapshotFingerprint:verifier.snapshotFingerprint,
      proposal:{kind:result.kind,delta:result.delta,basisDelta:result.basisDelta}});
  }catch(e){
    if(!(e instanceof LareBudgetExceeded))throw e;
    return {...details,status:'refused',reason:'verification-budget',incumbent:null,firstVerifiedMs:null,
      verificationMs:now()-verifyStart,overheadWork:root.snapshot().work-searchWork};
  }
  assert.ok(r.snapshot().incumbent,'Direct reference verification did not retain a witness');
  return {...details,status:'verified',reason:'completed',incumbent:summary(r.snapshot().incumbent),
    firstVerifiedMs:now()-started,verificationMs:now()-verifyStart,overheadWork:root.snapshot().work-searchWork};
}
async function serial(f,arm,root,started){
  let firstVerifiedMs=null,observations=0;
  const result=await runAresSrePortfolio(f.project,f.context,{
    tasks:arm.tasks,diagnostics:[],profile:manifest.profile,capacity:manifest.capacity,policy:manifest.policy,
    checkpoint:state=>{
      observations++;
      if(firstVerifiedMs===null&&state.retention.incumbent)firstVerifiedMs=now()-started;
      return 'continue';
    }
  },root);
  assert.deepEqual(result.ledger.root,root.snapshot());
  const incumbent=summary(result.retention.incumbent);
  // If the last task produced the first witness, the return is the first
  // externally observable checkpoint. This is not an internal solver time.
  if(incumbent&&firstVerifiedMs===null)firstVerifiedMs=now()-started;
  const taskWork=result.ledger.settled.reduce((n,row)=>n+row.usage.work,0);
  return {status:result.reason==='failed'?'failure':incumbent?'verified':'refused',
    reason:result.reason,failure:result.failure,incumbent,firstVerifiedMs,searchMs:null,verificationMs:null,
    searchWork:null,taskWork,overheadWork:root.snapshot().work-taskWork,observations,
    phases:result.ledger.settled.map((row,i)=>({taskId:row.task.taskId,strategyId:row.task.strategyId,
      status:row.status,work:row.usage.work,expansions:row.usage.expansions,limits:row.task.limits,
      event:result.events[i]??null})),pending:result.pending.map(t=>t.taskId)};
}
// Each case executes all three arms sequentially in predeclared order on
// one runner. Each arm has a fresh root; no arm can borrow another's work.
export async function measureAresP3Case(id){
  const f=materializeAresP3Case(id),source=aresReplayJson(f.project);
  checkSource(f,source);
  const rows=[];
  for(const [order,arm] of manifest.arms.entries()){
    const root=rootFor(f),started=now(),heapBefore=heap();
    let outcome,preflight=null,preflightMs=null,preflightWork=null;
    try{
      const t=now(),before=root.snapshot().work;
      preflight=inspectAresP3Topology(f.project,f.context,root);
      preflightMs=now()-t;preflightWork=root.snapshot().work-before;
      if(preflight.status==='preflight-refused'){
        outcome={status:'refused',reason:'preflight-refused',incumbent:null,firstVerifiedMs:null,
          searchMs:null,verificationMs:null,searchWork:0,overheadWork:root.snapshot().work,phases:[]};
      }else outcome=arm.kind==='direct-standard-baseline'?await direct(f,root,started):await serial(f,arm,root,started);
    }catch(e){
      // Unknown exceptions are failures, not ordinary search refusals.
      outcome={status:'failure',reason:'exception',failure:String(e?.message??e).slice(0,1000),
        incumbent:null,firstVerifiedMs:null,searchMs:null,verificationMs:null,searchWork:null,overheadWork:null,phases:[]};
    }
    const row={version:1,protocol:manifest.protocol,caseId:id,split:f.case.split,stratum:f.case.stratum,
      source:sha(source),operation:f.context.operation,arm:arm.id,order,limits:f.limits,
      referenceLabel:f.case.reference,measurementRevision:2,preflight,preflightMs,preflightWork,...outcome,wallMs:now()-started,heapBefore,heapAfter:heap(),peakHeap:null,
      stats:root.snapshot(),node:process.version,platform:process.platform,runner:process.env.RUNNER_OS??null};
    // Log each result before assertions so failed runs preserve evidence.
    console.log('ARES_P3_MATCHED '+JSON.stringify(row));
    rows.push(row);
    assert.equal(aresReplayJson(f.project),source,'Accepted source mutated');
    assert.equal(row.stats.work+row.stats.remainingWork,f.limits.work);
    assert.equal(row.stats.expansions+row.stats.remainingExpansions,f.limits.stateExpansions);
    if(row.incumbent){
      assert.match(row.incumbent.fingerprint,/^[a-f0-9]{64}$/);
      assert.deepEqual(Object.keys(row.incumbent.metrics),manifest.profile.criteria.map(c=>c.metric));
      assert.ok(Object.values(row.incumbent.metrics).every(n=>Number.isFinite(n)&&n>=0));
      if(!f.context.operation.permissions.destruction)
        for(const k of ['retiredProperties','retiredPlots','retiredBuildings','demolishedFootprint'])
          assert.equal(row.incumbent.metrics[k],0,'Unauthorized loss');
    }else assert.notEqual(row.status,'verified');
  }
  assert.equal(rows.length,manifest.arms.length);
  assert.ok(rows.every(r=>r.status!=='failure'),'Research execution/verification failed; inspect all logged rows');
  return rows;
}
