import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../core/spatial-recovery-contract.js';
import { createSpatialHighQualityBudget } from '../core/spatial-recovery-quality.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../core/spatial-recovery-coordinator.js';
import { hydrateProjectS10 } from '../core/building-project-s10.js';
import { riEqual } from '../core/road-impact-model.js';

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
