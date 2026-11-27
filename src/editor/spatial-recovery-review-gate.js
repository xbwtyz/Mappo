import { createSpatialOperation, spatialRefKey } from '../core/spatial-recovery-contract.js';
import { SRE_ROAD_WORKER_VERSION } from '../core/spatial-recovery-worker-protocol.js';
import { verifySpatialRoadWorkerReservation } from '../core/spatial-recovery-worker-reservation.js';
import { spatialRoadReviewSummary, spatialRoadReviewFingerprint } from '../core/spatial-recovery-review-summary.js';
import { createSpatialRoadReviewWorkerClient } from './spatial-recovery-worker-client.js';
import { reconcileRoadWorkspace } from './road-workspace.js';
import { riEqual, riFreeze } from '../core/road-impact-model.js';
import { copyJson, roundTripProjectDocument } from '../data/project-format.js';

const sreReviewNeed=(ok,message)=>{if(!ok)throw Error(message);};
const sreReviewJsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Host-owned, one-use Review/Apply gate. The trusted mounted caller provides
// the current draft/workspace and independently chosen reservation requests.
// A test may inject the same domain verifier; production defaults to a fresh
// dedicated offline worker. No solver runs as a synchronous UI fallback.
export function createSpatialRoadReviewGate(host,getDraft,{verify=createSpatialRoadReviewWorkerClient()}={}){
  let generation=0,requestId=0;
  const tokens=new WeakMap();
  const capture=view=>{
    const draft=getDraft();
    sreReviewNeed(draft&&Number.isSafeInteger(draft.draftRevision)&&draft.draftRevision>=0&&
      Array.isArray(draft.roadIds)&&draft.roadIds.length>=2&&draft.workspace,
      'Incomplete current road review draft.');
    const op=createSpatialOperation({version:1,family:'road',operation:'translate-road-group',
      projectId:view.project.id??view.project.city.id,revision:view.context.revision,
      editedRefs:draft.roadIds.map(id=>({collection:'roads',id})),permissions:draft.permissions??{},
      geometry:{offset:draft.offset}});
    const quality=draft.quality??'standard';
    sreReviewNeed(['standard','high'].includes(quality)&&
      (quality!=='high'||(op.permissions.destruction&&!op.permissions.regeneration)),
      'Unsupported road review quality.');
    const captureRestorationAudit=draft.captureRestorationAudit??false;
    sreReviewNeed(typeof captureRestorationAudit==='boolean'&&(!captureRestorationAudit||op.permissions.destruction),
      'Invalid road review restoration audit policy.');
    return copyJson({draftRevision:draft.draftRevision,operation:op,quality,captureRestorationAudit,workspace:draft.workspace,
      savedDistrictCount:draft.savedDistrictCount??null,reservationRequests:draft.reservationRequests??null});
  };
  const current=state=>host.view()===state.view&&generation===state.generation&&
    sreReviewJsonEqual(capture(state.view),state.draft);
  const check=state=>sreReviewNeed(current(state),'Stale accepted project or road review draft.');
  const cancel=()=>{generation++;verify.cancel?.();};
  const authorize=state=>{
    const {operation,reservationRequests}=state.draft;
    const proposal=state.witness.provisionalAuthorization;
    const context=operation.permissions.regeneration?{projectId:operation.projectId,
      revision:state.view.context.revision,namespace:state.view.context.namespace}:null;
    if(!proposal){
      sreReviewNeed(proposal===null&&state.witness.delta.added.length===0,'Unreserved road additions.');
      return {context,authorization:null,requests:[],receipt:host.reserve([])};
    }
    sreReviewNeed(context&&Array.isArray(reservationRequests)&&reservationRequests.length,
      'Regeneration requires an independently approved host request plan.');
    const authorization=verifySpatialRoadWorkerReservation(state.view.project,operation,context,reservationRequests,proposal);
    const receipt=host.reserve(authorization.requests);
    // SRE city identity and mounted session identity are deliberately distinct.
    // The allocator transitions and IDs must match exactly across that bridge.
    sreReviewNeed(riEqual(receipt.allocations,authorization.receipt.allocations)&&
      riEqual(receipt.nextState,authorization.receipt.nextState)&&riEqual(receipt.binding,state.view.context),
      'Mounted reservation differs from verified road allocation.');
    return {context,authorization,requests:authorization.requests,receipt};
  };
  const replay=async(state,auth)=>{
    check(state);
    if(requestId===Number.MAX_SAFE_INTEGER)throw Error('Road review request sequence exhausted.');
    const input={kind:'verify-review',version:SRE_ROAD_WORKER_VERSION,requestId:++requestId,
      sessionId:state.view.context.projectId,projectJson:JSON.stringify(state.view.project),
      operation:state.draft.operation,quality:state.draft.quality,reservationContext:auth.context,
      captureRestorationAudit:state.draft.captureRestorationAudit,
      witness:copyJson(state.witness),authorization:auth.authorization};
    const proof=await verify(input);
    check(state);
    sreReviewNeed(proof?.kind==='verified-review'&&proof.version===input.version&&
      proof.requestId===input.requestId&&proof.sessionId===input.sessionId&&proof.quality===input.quality&&
      riEqual(proof.operation,input.operation)&&typeof proof.candidateJson==='string',
      'Road review proof binding mismatch.');
    const fingerprint=await spatialRoadReviewFingerprint(proof.candidateJson);
    check(state);
    sreReviewNeed(fingerprint===state.witness.delta.candidateFingerprint,'Reviewed road candidate fingerprint changed.');
    const candidate=JSON.parse(proof.candidateJson);
    const summary=spatialRoadReviewSummary(state.view.project,candidate);
    sreReviewNeed(riEqual(summary,proof.summary)&&riEqual(candidate.identityAllocation,auth.receipt.nextState),
      'Verified road review ledger or allocation differs.');
    let restorationAudit=null;
    if(state.draft.captureRestorationAudit){
      sreReviewNeed(Object.hasOwn(proof,'restorationAudit'),'Missing independent restoration audit.');
      const audit=proof.restorationAudit;
      if(state.witness.kind==='nondestructive'){
        sreReviewNeed(audit===null&&summary.retired.length===0,'Unexpected nondestructive restoration audit.');
      }else{
        const keys=rows=>rows.map(spatialRefKey).sort();
        const original=new Set(['properties','plots','buildings'].flatMap(collection=>
          state.view.project.city[collection].map(row=>spatialRefKey({collection,id:row.id}))));
        const survivors=new Set(['properties','plots','buildings'].flatMap(collection=>
          candidate.city[collection].map(row=>spatialRefKey({collection,id:row.id}))));
        sreReviewNeed(audit?.version===1&&audit.finalBasisFingerprint===state.witness.basisDelta.candidateFingerprint&&
          ['grossRetired','restored','finalRetired','transitions'].every(k=>Array.isArray(audit[k])),
          'Invalid independent restoration audit binding.');
        const gross=keys(audit.grossRetired),restored=keys(audit.restored),retired=keys(audit.finalRetired);
        sreReviewNeed(riEqual(retired,keys(summary.retired))&&
          riEqual(retired,keys(state.witness.basisDelta.retired))&&
          new Set(gross).size===gross.length&&new Set(restored).size===restored.length&&
          riEqual(gross,[...retired,...restored].sort())&&
          gross.every(k=>original.has(k))&&restored.every(k=>survivors.has(k)),
          'Restoration audit differs from verified candidate membership.');
        restorationAudit=riFreeze(copyJson(audit));
      }
    }else sreReviewNeed(!Object.hasOwn(proof,'restorationAudit'),'Unexpected independent restoration audit.');
    return {candidate,candidateJson:proof.candidateJson,summary,restorationAudit};
  };
  const review=async witness=>{
    cancel();
    const view=host.view(),draft=capture(view);
    const state={view,draft,generation,witness:riFreeze(copyJson(witness))};
    sreReviewNeed(state.witness?.status==='verified-witness'&&state.witness.delta&&state.witness.basisDelta&&
      riEqual(state.witness.operation,draft.operation),'Road witness does not match the current draft.');
    const auth=authorize(state),proof=await replay(state,auth);
    check(state);
    const token=Object.freeze({});
    tokens.set(token,{...state,summary:proof.summary,restorationAudit:proof.restorationAudit,candidateJson:proof.candidateJson});
    return Object.freeze({token,summary:proof.summary,candidateFingerprint:state.witness.delta.candidateFingerprint,
      candidate:riFreeze(proof.candidate),...(draft.captureRestorationAudit?{restorationAudit:proof.restorationAudit}:{})});
  };
  const apply=async(token,consent)=>{
    const state=tokens.get(token);
    sreReviewNeed(state,'Unknown or consumed road review token.');
    tokens.delete(token);
    check(state);
    sreReviewNeed(consent?.candidateFingerprint===state.witness.delta.candidateFingerprint&&
      riEqual(consent.summary,state.summary)&&(!state.draft.captureRestorationAudit||
        Object.hasOwn(consent,'restorationAudit')&&riEqual(consent.restorationAudit,state.restorationAudit)),
      'Exact road review consent is required.');
    const auth=authorize(state),proof=await replay(state,auth);
    check(state);
    sreReviewNeed(proof.candidateJson===state.candidateJson&&riEqual(proof.summary,state.summary)&&
      riEqual(proof.restorationAudit,state.restorationAudit),
      'Fresh road verification differs from the reviewed candidate.');
    const original=state.view.project;
    const workspace=reconcileRoadWorkspace(state.draft.workspace,original.city,proof.candidate.city);
    // Do not silently rewrite other saved restoration points.
    sreReviewNeed(sreReviewJsonEqual(state.draft.workspace.fortificationEditor?.history??[],
      workspace.fortificationEditor?.history??[]),'Road recovery changed defense restoration history.');
    const transaction={family:'road',operation:'spatial-road-recovery',label:'Recover connected roads',
      targetIds:state.draft.operation.editedRefs.map(ref=>ref.id)};
    const before=state.draft.workspace.districtEditor?.history??[],after=workspace.districtEditor?.history??[];
    if(!sreReviewJsonEqual(before,after)){
      const count=state.draft.savedDistrictCount;
      sreReviewNeed(Number.isSafeInteger(count)&&count>=0&&count<=before.length&&after.length<=before.length,
        'Trusted district saved-history count required.');
      transaction.editorHistory={key:'districtEditor',before:{history:copyJson(before),savedCount:count},
        after:{history:copyJson(after),savedCount:Math.max(0,count-(before.length-after.length))}};
    }
    const canonical=roundTripProjectDocument(proof.candidate,workspace);
    sreReviewNeed(sreReviewJsonEqual(canonical.project,proof.candidate)&&sreReviewJsonEqual(canonical.workspace,workspace),
      'Road recovery portable roundtrip changed the reviewed result.');
    check(state);
    const beforeJson=JSON.stringify(original),afterJson=proof.candidateJson;
    const committed=host.commit({requests:auth.requests,receipt:auth.receipt,candidateCity:proof.candidate.city,
      transaction,historyPolicy:'required',validateDomain:(a,b)=>current(state)&&
        JSON.stringify(a)===beforeJson&&JSON.stringify(b)===afterJson});
    return {...committed,workspace:canonical.workspace,summary:proof.summary,
      ...(state.draft.captureRestorationAudit?{restorationAudit:proof.restorationAudit}:{})};
  };
  return Object.freeze({review,apply,cancel});
}
