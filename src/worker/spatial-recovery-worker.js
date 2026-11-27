import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../core/spatial-recovery-contract.js';
import { createSpatialHighQualityBudget } from '../core/spatial-recovery-quality.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../core/spatial-recovery-coordinator.js';
import { hydrateProjectS10 } from '../core/building-project-s10.js';
import { riEqual } from '../core/road-impact-model.js';
import { spatialRoadReviewSummary } from '../core/spatial-recovery-review-summary.js';
import { searchSpatialShellRegeneration,searchSpatialGroupRegeneration } from '../core/spatial-recovery-regeneration.js';

import { SRE_ROAD_WORKER_VERSION, normalizeSpatialRoadWorkerRequest, sreWorkerId, sreWorkerSession } from '../core/spatial-recovery-worker-protocol.js';

export async function calculateSpatialRoadWorkerResult(input, control=null) {
  const request = normalizeSpatialRoadWorkerRequest(input);
  const {operation,quality} = request;
  const raw = JSON.parse(request.projectJson);
  if (raw?.schemaVersion !== 11 || (raw.id ?? raw.city?.id) !== operation.projectId)
    throw Error('Road worker project identity or schema mismatch.');
  const project = hydrateProjectS10(raw);
  const ordinaryBudget = () => operation.permissions.destruction ?
    createSpatialDestructionBudget() : createSpatialPreservationBudget();
  const searchBudget = quality === 'high' ? createSpatialHighQualityBudget() : ordinaryBudget();
  const verify=async result=>{
    if(result.status==='verified-witness'){
      const proposal=result.provisionalAuthorization;
      if(proposal&&(!request.reservationContext||!riEqual(proposal.context,request.reservationContext)))
        throw Error('Road worker regeneration context mismatch.');
      const verified=await verifySpatialUnifiedRoadWitness(project,operation,result,ordinaryBudget(),proposal);
      if(!verified||Boolean(result.delta.added.length)!==Boolean(proposal))
        throw Error('Road worker returned unsupported allocation.');
    }else if(result.status!=='refused'||result.delta||result.basisDelta||result.provisionalAuthorization)
      throw Error('Invalid road worker result.');
    return result;
  };
  // Clock only throttles telemetry; it never influences the search policy.
  let phase=null,charges=0,last=0;
  const emit=state=>{last=performance.now();control?.progress(state);};
  const tick=()=>{
    if(control&&phase&&((++charges&4095)===0)&&performance.now()-last>=150)
      emit({...phase,stats:searchBudget.snapshot()});
  };
  const observedBudget=control?Object.freeze({
    spend(n){searchBudget.spend(n);tick();},
    expand(){searchBudget.expand();tick();},
    snapshot:()=>searchBudget.snapshot()
  }):searchBudget;
  const checkpoint=control?async(state,capture)=>{
    phase=state;emit(state);
    await new Promise(resolve=>setTimeout(resolve,0));
    if(control.stopRequested())await control.pause(state,await verify(capture()));
    return 'continue';
  }:null;
  const result = await searchSpatialUnifiedRoadGroup(project,operation,observedBudget,
    {quality,context:request.reservationContext,checkpoint});
  await verify(result);
  return {version:SRE_ROAD_WORKER_VERSION,requestId:request.requestId,sessionId:request.sessionId,
    operation,quality,result};
}

// Fresh verification only: no search, no worker-owned Apply authority.
// The host supplies the independently reserved authorization separately.
export async function calculateSpatialRoadReview(input){
  const {kind,witness,authorization,...base}=input;
  if(kind!=='verify-review')throw Error('Unsupported road review request.');
  const request=normalizeSpatialRoadWorkerRequest(base),operation=request.operation;
  if(request.controlled||witness?.status!=='verified-witness'||!riEqual(witness.operation,operation))
    throw Error('Invalid reviewed road witness.');
  if(!riEqual(authorization??null,witness.provisionalAuthorization??null)||
     (authorization&&!riEqual(authorization.context,request.reservationContext)))
    throw Error('Road review reservation differs from host authorization.');
  const project=hydrateProjectS10(JSON.parse(request.projectJson));
  if(project?.schemaVersion!==11||(project.id??project.city?.id)!==operation.projectId)
    throw Error('Road review project identity mismatch.');
  const budget=operation.permissions.destruction?createSpatialDestructionBudget():createSpatialPreservationBudget();
  const candidate=await verifySpatialUnifiedRoadWitness(project,operation,witness,budget,authorization??null);
  return {version:request.version,requestId:request.requestId,sessionId:request.sessionId,
    operation,quality:request.quality,kind:'verified-review',
    candidateJson:JSON.stringify(candidate),summary:spatialRoadReviewSummary(project,candidate)};
}

// Independently reproduce the regeneration plan on the already selected
// retirement basis. This cannot select another recovery candidate or publish.
export async function calculateSpatialRoadReservationPlan(input){
  const {kind,basisDelta,regenerationKind,...base}=input;
  if(kind!=='plan-reservation')throw Error('Unsupported reservation planning request.');
  const request=normalizeSpatialRoadWorkerRequest(base),op=request.operation;
  if(request.controlled||!request.reservationContext||request.quality!=='standard'||
     !['shell-regeneration','group-regeneration'].includes(regenerationKind)||!basisDelta)
    throw Error('Invalid regeneration plan request.');
  const raw=JSON.parse(request.projectJson);
  if(raw?.schemaVersion!==11||(raw.id??raw.city?.id)!==op.projectId)
    throw Error('Regeneration plan snapshot mismatch.');
  const project=hydrateProjectS10(raw);
  const shell=regenerationKind==='shell-regeneration';
  const plan=await (shell?searchSpatialShellRegeneration:searchSpatialGroupRegeneration)(
    project,op,basisDelta,request.reservationContext,
    createSpatialDestructionBudget({work:shell?2000000:6000000,stateExpansions:131072}));
  if(plan.status!=='verified-witness'||!plan.provisionalAuthorization)
    throw Error('Independent regeneration plan refused.');
  return {kind:'planned-reservation',version:request.version,requestId:request.requestId,
    sessionId:request.sessionId,operation:op,quality:request.quality,
    requests:plan.provisionalAuthorization.requests,candidateFingerprint:plan.delta.candidateFingerprint};
}

// Stop pauses cooperatively at a verified phase boundary; Continue
// resumes the same stack and budget. Hard Cancel is worker termination.
export function installSpatialRoadRecoveryWorker(scope) {
  let active=null;
  const receive=async({data})=>{
    if(data&&Object.hasOwn(data,'command')){
      const task=active;
      if(!task||!task.request.controlled||data.version!==task.request.version||
         data.requestId!==task.request.requestId||data.sessionId!==task.request.sessionId||
         Object.keys(data).length!==4)return;
      if(data.command==='stop')task.stop=true;
      else if(data.command==='continue'){
        task.stop=false;
        const resume=task.resume;task.resume=null;resume?.();
      }
      return;
    }
    const identity={version:SRE_ROAD_WORKER_VERSION,
      requestId:sreWorkerId(data?.requestId)?data.requestId:null,
      sessionId:sreWorkerSession(data?.sessionId)?data.sessionId:null};
    if(active){scope.postMessage({...identity,error:'Road recovery worker is busy.'});return;}
    try{
      if(data?.kind==='plan-reservation'){
        active={request:{controlled:false}};
        scope.postMessage(await calculateSpatialRoadReservationPlan(data));
        return;
      }
      if(data?.kind==='verify-review'){
        active={request:{controlled:false}};
        scope.postMessage(await calculateSpatialRoadReview(data));
        return;
      }
      const request=normalizeSpatialRoadWorkerRequest(data),task={request,stop:false,resume:null};
      active=task;
      const control=request.controlled?{
        stopRequested:()=>task.stop,
        progress:state=>scope.postMessage({...identity,operation:request.operation,quality:request.quality,
          progress:state,paused:false}),
        pause:async(state,result)=>{
          if(!task.stop)return;
          await new Promise(resolve=>{
            task.resume=resolve;
            scope.postMessage({...identity,operation:request.operation,quality:request.quality,
              progress:state,paused:true,incumbent:result});
          });
        }
      }:null;
      scope.postMessage(await calculateSpatialRoadWorkerResult(request,control));
    }catch(error){scope.postMessage({...identity,error:String(error?.message??error)});}
    finally{active=null;}
  };
  scope.addEventListener('message',receive);
}
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope) installSpatialRoadRecoveryWorker(self);
