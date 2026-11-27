import { normalizeSpatialRoadWorkerRequest, SRE_ROAD_WORKER_VERSION } from '../core/spatial-recovery-worker-protocol.js';
import { createSpatialOperation } from '../core/spatial-recovery-contract.js';
import { riEqual } from '../core/road-impact-model.js';

// Detached controller. getBinding must read the current host-owned session,
// accepted revision, normalized intent and permissions, never worker state.
// The caller invalidates immediately on any edit/project change; the response
// check independently catches stale results even when invalidate was missed.
export function createSpatialRoadWorkerController(createWorker,getBinding) {
  if (typeof createWorker !== 'function' || typeof getBinding !== 'function')
    throw Error('Road recovery requires a worker factory and host binding.');
  let active = null, nextId = 0, disposed = false;
  const errorOf = (message,name='Error') => Object.assign(new Error(message),{name});
  const matches = request => {
    const current=getBinding();
    return Boolean(current && current.sessionId===request.sessionId &&
      (current.quality??'standard')===request.quality &&
      riEqual(createSpatialOperation(current.operation),request.operation));
  };
  const finish = (task,error,response) => {
    if (active!==task) return;
    active=null; // Suppress even an already queued message from the old worker.
    try { task.worker?.terminate(); } catch { /* binding still invalidated */ }
    if(error) task.reject(error); else task.resolve(response);
  };
  const cancel = () => {
    if(!active)return false;
    finish(active,errorOf('Road recovery canceled or superseded.','AbortError'));
    return true;
  };
  const compute = input => {
    if(disposed)return Promise.reject(errorOf('Road recovery controller disposed.'));
    cancel();
    return new Promise((resolve,reject)=>{
      let task;
      try {
        if(nextId===Number.MAX_SAFE_INTEGER)throw Error('Road recovery request sequence exhausted.');
        const request=normalizeSpatialRoadWorkerRequest({...input,version:SRE_ROAD_WORKER_VERSION,requestId:++nextId});
        if(!matches(request))throw errorOf('Stale road recovery host binding.','AbortError');
        task={worker:null,request,resolve,reject}; active=task;
        const worker=createWorker(); task.worker=worker;
        worker.addEventListener('message',({data})=>{
          if(active!==task)return;
          try {
            if(!matches(request))throw errorOf('Stale road recovery result.','AbortError');
            if(data?.version!==request.version||data.requestId!==request.requestId||
               data.sessionId!==request.sessionId)
              throw Error('Mismatched road recovery response identity.');
            if(Object.hasOwn(data,'error')){
              if(typeof data.error!=='string'||Object.hasOwn(data,'result'))throw Error('Malformed road recovery error.');
              throw Error(data.error);
            }
            if(data.quality!==request.quality||!riEqual(data.operation,request.operation)||
               !riEqual(data.result?.operation,request.operation))
              throw Error('Mismatched road recovery response intent.');
            const result=data.result;
            if(result.provisionalAuthorization!==null||
               !['verified-witness','refused'].includes(result.status)||
               (result.status==='verified-witness'&&(!result.delta||!result.basisDelta||
                 !Array.isArray(result.delta.added)||result.delta.added.length!==0))||
               (result.status==='refused'&&(result.delta!==null||result.basisDelta!==null)))
              throw Error('Malformed or unsupported road recovery witness.');
            // This is a detached preview response, NOT Apply authority.
            finish(task,null,data);
          }catch(error){finish(task,error);}
        });
        worker.addEventListener('error',event=>finish(task,errorOf('Road recovery worker failed: '+(event.message||'worker error'))));
        worker.addEventListener('messageerror',()=>finish(task,errorOf('Road recovery response could not be decoded.')));
        worker.postMessage(request);
      }catch(error){if(task)finish(task,error);else reject(error);}
    });
  };
  compute.cancel=cancel;
  compute.invalidate=cancel;
  compute.dispose=()=>{disposed=true;cancel();};
  return compute;
}

export function createSpatialRoadWorkerClient(getBinding) {
  return createSpatialRoadWorkerController(()=>{
    if(typeof Worker==='undefined'||typeof Blob==='undefined'||typeof URL==='undefined'||
       typeof URL.createObjectURL!=='function'||typeof SRE_ROAD_WORKER_SOURCE_V1!=='string')
      throw Error('Offline road recovery worker unavailable.');
    const url=URL.createObjectURL(new Blob([SRE_ROAD_WORKER_SOURCE_V1],{type:'text/javascript'}));
    try{return new Worker(url,{name:'mappo-sre-road-recovery'});}
    finally{URL.revokeObjectURL(url);}
  },getBinding);
}
