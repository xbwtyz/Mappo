import { createSpatialPermissions } from '../core/spatial-recovery-contract.js';
import { normalizeSpatialRoadGroup } from '../core/spatial-recovery-road-adapter.js';
import { SRE_ROAD_WORKER_VERSION } from '../core/spatial-recovery-worker-protocol.js';
import { normalizeIdentityRequests } from '../core/identity-reservations.js';
import { ROAD_IMPACT_COLLECTIONS,riEqual } from '../core/road-impact-model.js';
import { roadReconciliationPreviewB3 } from '../core/road-inspection.js';
import { createSpatialRoadWorkerClient,createSpatialRoadReviewWorkerClient } from './spatial-recovery-worker-client.js';
import { createSpatialRoadReviewGate } from './spatial-recovery-review-gate.js';
import { copyJson } from '../data/project-format.js';

const sreMountedDefault=()=>({permissions:createSpatialPermissions(),quality:'standard'});
const sreMountedSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sreMountedBusy=new Set(['searching','stopping','planning','verifying','applying']);

// Mounted orchestration only. Existing ordinary road preview stays intact;
// choosing recovery explicitly hands this draft to the same secure host gate.
export function createMountedSpatialRoadRecovery(host,readDraft,changed=()=>{},
  {makeSearch=createSpatialRoadWorkerClient,makeVerifier=createSpatialRoadReviewWorkerClient}={}){
  let policy=sreMountedDefault(),task=null,planId=0;
  const planner=makeVerifier();
  const draftFor=()=>readDraft();
  const bound=t=>{
    if(!t||task!==t||host.view()!==t.view)return false;
    const d=draftFor();
    return Boolean(d&&
      d.draftRevision===t.draftRevision&&sreMountedSame(d.roadIds,t.roadIds)&&
      sreMountedSame(d.offset,t.offset)&&sreMountedSame(d.workspace,t.workspace)&&d.savedDistrictCount===t.savedDistrictCount);
  };
  const current=()=>bound(task)?task:null;
  const gate=createSpatialRoadReviewGate(host,()=>{
    const t=current(),d=draftFor();
    if(!t||!d)return null;
    return {...d,permissions:t.policy.permissions,quality:t.policy.quality,
      reservationRequests:t.reservationRequests};
  },{verify:makeVerifier()});
  const clear=(resetPolicy=false)=>{
    const old=task;task=null;
    old?.compute?.dispose?.();planner.cancel?.();gate.cancel();
    if(resetPolicy)policy=sreMountedDefault();
  };
  const notify=()=>changed();
  const fail=(t,error)=>{
    if(!bound(t))return;
    t.compute?.dispose?.();planner.cancel?.();gate.cancel();
    t.phase='error';t.message=String(error?.message??error);t.review=null;t.geometry=null;t.incumbent=null;
    notify();
  };
  const setPolicy=input=>{
    clear();
    const p=createSpatialPermissions(input.permissions??{});
    if(p.regeneration&&!p.destruction)throw Error('Regeneration requires destruction permission.');
    const quality=input.quality??'standard';
    if(!['standard','high'].includes(quality)||quality==='high'&&(!p.destruction||p.regeneration))
      throw Error('High quality requires destruction and does not support regeneration.');
    policy={permissions:p,quality};notify();
  };
  const inspect=async(t,witness)=>{
    if(!bound(t))return;
    if(witness?.status!=='verified-witness'){
      t.phase='refused';t.message='The bounded recovery search found no verified solution.';notify();return;
    }
    t.phase='verifying';t.message='Independently verifying the recovery result…';notify();
    try{
      const reviewed=await gate.review(witness);
      if(!bound(t))return;
      t.review=reviewed;
      const kinds=new Map(ROAD_IMPACT_COLLECTIONS);
      const refs=[...witness.delta.modified.map(row=>row.ref),...witness.delta.retired,
        ...witness.delta.added.map(row=>row.ref)];
      t.geometry=roadReconciliationPreviewB3(t.view.project,{
        candidateProject:reviewed.candidate,validation:{project:'valid'},unresolved:[],
        changed:refs.map(ref=>({kind:kinds.get(ref.collection),id:ref.id,fields:[]}))
      });
      t.phase='ready';t.message='Review the exact changes before Apply.';notify();
    }catch(error){fail(t,error);}
  };
  const start=()=>{
    clear();
    const d=draftFor();
    if(!d)return false;
    const view=host.view();
    const operation=normalizeSpatialRoadGroup(view.project,view.context.revision,d.roadIds,d.offset,policy.permissions);
    const reservationContext=operation.permissions.regeneration?{projectId:operation.projectId,
      revision:view.context.revision,namespace:view.context.namespace}:null;
    const binding={sessionId:view.context.projectId,projectJson:JSON.stringify(view.project),
      operation,quality:policy.quality,reservationContext};
    const t={...copyJson(d),view,policy,binding,phase:'searching',message:'Searching for recovery…',
      progress:null,review:null,geometry:null,incumbent:null,reservationRequests:null,compute:null};
    task=t;
    try{
      t.compute=makeSearch(()=>bound(t)?binding:null,{
        onProgress:data=>{
          if(!bound(t))return;
          t.progress=data.progress;
          if(data.paused){
            t.incumbent=data.incumbent;
            t.phase='paused';t.message=data.progress.hasIncumbent?
              'Stopped with a verified solution. Continue or review it.':'Stopped before a verified solution. Continue searching.';
          }else if(t.phase!=='stopping'){
            t.phase='searching';t.message='Searching for recovery…';
          }
          notify();
        },
        hostReservationRequests:async plan=>{
          if(!bound(t))throw Error('Stale road regeneration plan.');
          t.phase='planning';t.message='Independently reproducing regeneration reservations…';notify();
          if(planId===Number.MAX_SAFE_INTEGER)throw Error('Road reservation plan sequence exhausted.');
          const requestId=++planId;
          const result=await planner({kind:'plan-reservation',version:SRE_ROAD_WORKER_VERSION,requestId,
            ...binding,basisDelta:plan.basisDelta,regenerationKind:plan.kind});
          if(!bound(t)||result.kind!=='planned-reservation'||result.version!==SRE_ROAD_WORKER_VERSION||
             result.requestId!==requestId||result.sessionId!==binding.sessionId||
             result.quality!==binding.quality||!riEqual(result.operation,binding.operation)||
             result.candidateFingerprint!==plan.candidateFingerprint)
            throw Error('Independent regeneration plan differs from selected witness.');
          t.reservationRequests=normalizeIdentityRequests(result.requests);
          return t.reservationRequests;
        }
      });
      notify();
      Promise.resolve(t.compute({...binding,controlled:true})).then(response=>{
        if(bound(t)&&t.phase!=='verifying'&&t.phase!=='ready')return inspect(t,response.result);
      },error=>{if(bound(t)&&t.phase!=='verifying'&&t.phase!=='ready')fail(t,error);});
      return true;
    }catch(error){fail(t,error);return false;}
  };
  const stop=()=>{
    const t=current();
    if(!t||t.phase!=='searching'||!t.compute.stop())return false;
    t.phase='stopping';t.message='Stopping at the next safe search checkpoint…';notify();return true;
  };
  const resume=()=>{
    const t=current();
    if(!t||t.phase!=='paused'||!t.compute.continue())return false;
    t.incumbent=null;t.phase='searching';t.message='Continuing with remaining search budget…';notify();return true;
  };
  const reviewBest=()=>{
    const t=current();
    if(!t||t.phase!=='paused'||t.incumbent?.status!=='verified-witness')return false;
    const witness=t.incumbent;t.phase='verifying';t.compute.cancel();void inspect(t,witness);return true;
  };
  const apply=async()=>{
    const t=current();
    if(!t||t.phase!=='ready'||!t.review)throw Error('No current reviewed road recovery.');
    t.phase='applying';t.message='Rechecking the exact reviewed road recovery…';notify();
    try{return await gate.apply(t.review.token,t.review);}
    catch(error){fail(t,error);throw error;}
  };
  return Object.freeze({get policy(){return policy;},get state(){return current();},
    get busy(){return sreMountedBusy.has(current()?.phase);},setPolicy,start,stop,resume,reviewBest,apply,
    cancel(){clear();notify();},invalidate(){clear(true);}});
}
