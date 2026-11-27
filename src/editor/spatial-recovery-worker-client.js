import { normalizeSpatialRoadWorkerRequest, normalizeSpatialRoadReservationContext, spatialRoadControlMessage, SRE_ROAD_WORKER_VERSION } from '../core/spatial-recovery-worker-protocol.js';
import { createSpatialOperation } from '../core/spatial-recovery-contract.js';
import { riEqual, riFreeze } from '../core/road-impact-model.js';
import { verifySpatialRoadWorkerReservation } from '../core/spatial-recovery-worker-reservation.js';

// Detached controller. getBinding must read the current host-owned session,
// accepted revision, normalized intent and permissions, never worker state.
// The caller invalidates immediately on any edit/project change; the response
// check independently catches stale results even when invalidate was missed.
export function createSpatialRoadWorkerController(createWorker,getBinding,{onProgress=null,hostReservationRequests=null}={}) {
  if (typeof createWorker !== 'function' || typeof getBinding !== 'function')
    throw Error('Road recovery requires a worker factory and host binding.');
  let active = null, nextId = 0, disposed = false;
  const errorOf = (message,name='Error') => Object.assign(new Error(message),{name});
  const matches = request => {
    const current=getBinding();
    return Boolean(current && current.sessionId===request.sessionId &&
      (current.quality??'standard')===request.quality &&
      riEqual(createSpatialOperation(current.operation),request.operation)&&
      riEqual(normalizeSpatialRoadReservationContext(request.operation,current.reservationContext??null),request.reservationContext)&&
      (!request.reservationContext||current.projectJson===request.projectJson));
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
  const validateResult=(request,result)=>{
    if(!riEqual(result?.operation,request.operation)||
       !['verified-witness','refused'].includes(result.status)||
       (result.status==='verified-witness'&&(!result.delta||!result.basisDelta||!Array.isArray(result.delta.added)))||
       (result.status==='refused'&&(result.delta!==null||result.basisDelta!==null)))
      throw Error('Malformed or unsupported road recovery witness.');
    const proposal=result.provisionalAuthorization;
    if(!proposal){
      if(proposal!==null||result.delta?.added.length)throw Error('Unreserved road recovery additions.');
      return;
    }
    if(result.status!=='verified-witness'||!request.reservationContext||!result.delta.added.length||
       !['shell-regeneration','group-regeneration'].includes(result.kind)||typeof hostReservationRequests!=='function')
      throw Error('Road regeneration has no independent host reservation policy.');
    const current=getBinding();
    if(typeof current.projectJson!=='string'||current.projectJson!==request.projectJson)
      throw Error('Road regeneration host snapshot changed.');
    // No receipt, candidate or worker-supplied request keys enter this policy.
    const expected=hostReservationRequests(Object.freeze({operation:request.operation,
      kind:result.kind,context:request.reservationContext}));
    if(!matches(request))throw errorOf('Stale road regeneration authorization.','AbortError');
    const auth=verifySpatialRoadWorkerReservation(JSON.parse(current.projectJson),request.operation,
      request.reservationContext,expected,proposal);
    const ids=new Map(auth.receipt.allocations.map(row=>[row.id,row.type]));
    const types={building:'buildings',property:'properties',plot:'plots'};
    for(const {ref} of result.delta.added){
      if(!ids.has(ref?.id)||types[ids.get(ref.id)]!==ref.collection)
        throw Error('Road regeneration addition differs from host reservation.');
      ids.delete(ref.id);
    }
    if(ids.size)throw Error('Road regeneration omitted host reserved identities.');
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
        if(request.reservationContext&&typeof hostReservationRequests!=='function')
          throw Error('Road regeneration requires independent host reservation policy and snapshot.');
        task={worker:null,request,resolve,reject,lastWork:0,lastExpansions:0}; active=task;
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
            if(data.quality!==request.quality||!riEqual(data.operation,request.operation))
              throw Error('Mismatched road recovery response intent.');
            if(Object.hasOwn(data,'progress')){
              const state=data.progress,stats=state?.stats;
              const caps=request.quality==='high'?[256000000,131072]:request.operation.permissions.destruction?[32000000,131072]:[8000000,32768];
              if(!request.controlled||Object.hasOwn(data,'result')||typeof state?.phase!=='string'||
                 typeof state.hasIncumbent!=='boolean'||typeof data.paused!=='boolean'||
                 ![stats?.work,stats?.expansions,stats?.remainingWork,stats?.remainingExpansions].every(n=>Number.isSafeInteger(n)&&n>=0)||
                 stats.work<task.lastWork||stats.expansions<task.lastExpansions||
                 stats.work+stats.remainingWork!==caps[0]||stats.expansions+stats.remainingExpansions!==caps[1])
                throw Error('Invalid road recovery progress.');
              if(data.paused){
                validateResult(request,data.incumbent);
                if((data.incumbent.status==='verified-witness')!==state.hasIncumbent||
                   !riEqual(data.incumbent.stats,stats))throw Error('Invalid paused recovery incumbent.');
              }else if(Object.hasOwn(data,'incumbent'))throw Error('Unexpected road recovery incumbent.');
              task.lastWork=stats.work;task.lastExpansions=stats.expansions;
              onProgress?.(riFreeze(data));
              return;
            }
            validateResult(request,data.result);
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
  const control=command=>{
    const task=active;
    if(!task||!task.request.controlled)return false;
    try{
      if(!matches(task.request))throw errorOf('Stale road recovery control.','AbortError');
      task.worker.postMessage(spatialRoadControlMessage(task.request,command));
      return true;
    }catch(error){finish(task,error);return false;}
  };
  compute.stop=()=>control('stop');
  compute.continue=()=>control('continue');
  compute.cancel=cancel;
  compute.invalidate=cancel;
  compute.dispose=()=>{disposed=true;cancel();};
  return compute;
}

export function createSpatialRoadWorkerClient(getBinding,options) {
  return createSpatialRoadWorkerController(()=>{
    if(typeof Worker==='undefined'||typeof Blob==='undefined'||typeof URL==='undefined'||
       typeof URL.createObjectURL!=='function'||typeof SRE_ROAD_WORKER_SOURCE_V1!=='string')
      throw Error('Offline road recovery worker unavailable.');
    const url=URL.createObjectURL(new Blob([SRE_ROAD_WORKER_SOURCE_V1],{type:'text/javascript'}));
    try{return new Worker(url,{name:'mappo-sre-road-recovery'});}
    finally{URL.revokeObjectURL(url);}
  },getBinding,options);
}

// A fresh dedicated offline verifier, separate from the search worker.
// No fallback to expensive synchronous recovery on the application thread.
export function createSpatialRoadReviewWorkerClient(){
  let active=null;
  const settle=(task,error,value)=>{
    if(active!==task)return;
    active=null;
    try{task.worker?.terminate();}catch{}
    if(error)task.reject(error);else task.resolve(value);
  };
  const cancel=()=>{
    if(!active)return false;
    settle(active,Object.assign(Error('Road review verification canceled.'),{name:'AbortError'}));
    return true;
  };
  const verify=input=>{
    cancel();
    return new Promise((resolve,reject)=>{
      const task={worker:null,resolve,reject};active=task;
      try{
        if(typeof Worker==='undefined'||typeof Blob==='undefined'||typeof URL==='undefined'||
           typeof URL.createObjectURL!=='function'||typeof SRE_ROAD_WORKER_SOURCE_V1!=='string')
          throw Error('Offline road review verifier unavailable.');
        const url=URL.createObjectURL(new Blob([SRE_ROAD_WORKER_SOURCE_V1],{type:'text/javascript'}));
        try{task.worker=new Worker(url,{name:'mappo-sre-road-review'});}
        finally{URL.revokeObjectURL(url);}
        task.worker.addEventListener('message',({data})=>{
          if(active!==task)return;
          if(data?.version!==input.version||data.requestId!==input.requestId||data.sessionId!==input.sessionId)
            return settle(task,Error('Mismatched road review verifier response.'));
          if(data.error)return settle(task,Error(data.error));
          if(data.kind!=='verified-review'||data.quality!==input.quality||!riEqual(data.operation,input.operation)||
             typeof data.candidateJson!=='string'||!data.summary)
            return settle(task,Error('Malformed road review verifier response.'));
          settle(task,null,data);
        });
        task.worker.addEventListener('error',event=>settle(task,Error('Road review verifier failed: '+(event.message||'worker error'))));
        task.worker.addEventListener('messageerror',()=>settle(task,Error('Road review verifier response could not be decoded.')));
        task.worker.postMessage(input);
      }catch(error){settle(task,error);}
    });
  };
  verify.cancel=cancel;
  return verify;
}
