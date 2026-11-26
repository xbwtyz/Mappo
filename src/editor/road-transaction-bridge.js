import { checkRoadApplyC2, validateRoadApplyC2, validateRoadGroupApplyB1,
  validateRoadGroupDemolitionApplyB1R } from './road-application.js';
import { roadIdentityRequests, allocateRoadCandidate, allocateRoadCandidateForHost } from '../core/road-identity-delta.js';
import { reconcileRoadWorkspace } from './road-workspace.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument, roundTripProjectDocument } from '../data/project-format.js';

// Batch 2, detached bridge for the actual RoadPreviewSession inputs.
// The future mounted caller supplies trusted workspace/draft revisions and
// the exact host view. Worker replies contain no authority or reservations.
const idaRoadApplyTokens=new WeakMap();
const idaRoadApplySame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function idaRoadApplyRequire(ok,message){if(!ok)throw Error(message);}
// S4 follow-up: capture exact persisted intent text once at Begin. The
// synchronous raw assembly holds no authority and is never retained across
// calls; the private snapshot is parsed from that text. Later checks still
// serialize every current field and compare exact text, without copying the
// entire inspected candidate only to immediately stringify that copy.
function idaRoadApplySnapshotJson(session,revision){
  const group=session.roadGroupB1,demolition=session.demolition;
  const entries=map=>[...(map??new Map())];
  // Missing required fields previously failed JSON detachment. Keep that
  // refusal instead of letting an undefined value silently disappear.
  const required=value=>{
    if(value===undefined)throw Error('Incomplete road Apply snapshot.');
    return value;
  };
  if(group){
    return JSON.stringify({kind:demolition?.candidate?'demolition':'group',
      draft:{selectedRoadIds:required(group.selectedRoadIds),offset:required(session.roadIntentOffset),
        parcelChoices:entries(session.parcelChoices),revision,acceptedRevision:revision},
      inspected:demolition?.candidate?null:required(session.reconciliation)});
  }
  return JSON.stringify({kind:'single',draft:{selection:required(session.selection),
    point:session.point||null,
    roadConnectionEdit:session.roadConnectionEdit||null,
    roadIntentOffset:session.roadIntentOffset||null,
    targetJunctionId:session.targetJunctionId??null,
    buildingDecisions:entries(session.buildingDecisions),ownershipChoices:entries(session.ownershipChoices),
    parcelChoices:entries(session.parcelChoices)},inspected:required(session.reconciliation)});
}
function idaRoadApplyCheck(view,session,baselineRevision,revision,fingerprint){
  idaRoadApplyRequire(session?.current?.()&&session.project===view.project&&session.city===view.project.city&&
    Number.isSafeInteger(revision)&&revision>=0&&baselineRevision===revision&&
    Number.isSafeInteger(session.revision)&&session.revision>=0,
    'Stale accepted road project or workspace revision.');
  if(session.roadGroupB1){
    idaRoadApplyRequire(session.roadGroupB1.eligible&&session.pending&&!session.drag&&!session.checking&&
      !session.error&&!session.roadIntentInputError&&!session.reconciliationError&&
      session.settledRevision===session.revision&&session.acceptedFingerprint===fingerprint&&
      (session.demolition?.candidate||session.previewGeometry?.verified),
      'The connected-road preview is not complete and current.');
  }else{
    const check=checkRoadApplyC2(view.project,session,baselineRevision,revision,fingerprint);
    idaRoadApplyRequire(check.ok,check.issues?.[0]?.message??'Stale road preview.');
  }
}
function idaRoadApplyDraft(snapshot){
  const d=copyJson(snapshot.draft);
  for(const key of ['parcelChoices','ownershipChoices','buildingDecisions'])
    if(d[key])d[key]=new Map(d[key]);
  return d;
}
function idaRoadApplyTransaction(snapshot,legacy){
  if(legacy.transaction)return copyJson(legacy.transaction);
  const d=snapshot.draft,connection=d.roadConnectionEdit?.kind;
  const label=connection==='remove'?'Delete road':connection==='shape'?'Reshape road':
    connection==='add'?'Add road connection':connection==='reconnect'?'Reconnect road':
    d.targetJunctionId?'Merge junctions':d.selection.kind==='junction'?'Move road junction':'Move road';
  return {family:'road',operation:'road-reflow',label,targetIds:[d.selection.id,d.targetJunctionId].filter(Boolean)};
}
function idaRoadApplyReconstruct(state,project){
  const {snapshot,workspace,view}=state,draft=idaRoadApplyDraft(snapshot);
  // Demolition capabilities are object-bound and opaque. The independent
  // coordinator supplies a detached before; require exact equality and invoke
  // the original private authorization gate against the original host view.
  if(snapshot.kind==='demolition'){
    idaRoadApplyRequire(idaRoadApplySame(project,view.project),'Demolition baseline changed.');
    return validateRoadGroupDemolitionApplyB1R(view.project,workspace,draft,state.reviewed,state.authorization);
  }
  return snapshot.kind==='group'
    ?validateRoadGroupApplyB1(copyJson(project),workspace,draft,snapshot.inspected)
    :validateRoadApplyC2(copyJson(project),workspace,draft,snapshot.inspected);
}
function idaRoadApplyAllocated(state,project,legacy,receipt){
  idaRoadApplyRequire(legacy.ok,legacy.issues?.[0]?.message??'Road Apply refused.');
  const phase=state.snapshot.kind==='single'?state.snapshot.inspected.phase:'B1';
  const fresh={phase,status:'candidate-only',candidateProject:legacy.candidate,
    validation:{project:'valid',parcels:'pass'},unresolved:[],ledger:legacy.ledger,changed:legacy.changed};
  let allocated,issued;
  if(state.snapshot.kind!=='demolition'&&receipt===undefined&&project===state.view.project){
    // Independent reconstruction already completed. Reuse only the
    // private, freshly validated inventory within this allocation call.
    const {receipt:reserved,...result}=allocateRoadCandidateForHost(state.host,state.view,fresh,
      {allowAdditions:state.snapshot.kind==='single'});
    issued=reserved;allocated=result;
  }else{
    // Keep the separate reviewed demolition authorization/replay path.
    const requests=roadIdentityRequests(project,fresh);
    if(state.snapshot.kind!=='single')
      idaRoadApplyRequire(requests.length===0,'Connected-road operations may not allocate new land or buildings.');
    issued=receipt??state.host.reserve(requests);
    allocated=allocateRoadCandidate(project,fresh,state.view.context,issued);
  }
  const workspace=reconcileRoadWorkspace(state.workspace,project.city,allocated.candidate.city);
  // Reconciliation is repeated using final persistent IDs, not the worker's
  // workspace or a temporary parcel identity. Preserve exact saved histories
  // for ordinary connected-road movement, as the mounted B4 gate requires.
  if(state.snapshot.kind==='group')for(const key of ['districtEditor','fortificationEditor'])
    idaRoadApplyRequire(idaRoadApplySame(state.workspace[key]?.history??[],workspace[key]?.history??[]),
      'Connected road movement would alter saved restore points.');
  const transaction=idaRoadApplyTransaction(state.snapshot,legacy);
  const beforeHistory=state.workspace.districtEditor?.history??[],afterHistory=workspace.districtEditor?.history??beforeHistory;
  if(afterHistory.length<beforeHistory.length){
    const count=state.savedDistrictCount;
    idaRoadApplyRequire(Number.isSafeInteger(count)&&count>=0&&count<=beforeHistory.length,
      'Trusted district saved-history count is required.');
    transaction.editorHistory={key:'districtEditor',
      before:{history:copyJson(beforeHistory),savedCount:count},
      after:{history:copyJson(afterHistory),savedCount:Math.max(0,count-(beforeHistory.length-afterHistory.length))}};
  }
  // S4: the independently reconstructed ordinary candidate already passed
  // both portable validators and exact persisted equality. Reuse that
  // evidence only when final allocation is empty AND both persisted values
  // are exactly unchanged. Changed allocator order, geometry or workspace
  // must take the full final roundtrip. Never use worker/preview evidence.
  let verifiedWorkspace;
  if(state.snapshot.kind!=='demolition'&&allocated.requests.length===0&&
     idaRoadApplySame(legacy.candidate,allocated.candidate)&&
     idaRoadApplySame(legacy.workspace,workspace)){
    verifiedWorkspace=JSON.parse(JSON.stringify(workspace));
  }else{
    const decoded=state.snapshot.kind==='demolition'
      ?decodeProjectDocument(encodeProjectDocument(createProjectDocument(allocated.candidate,workspace)))
      :roundTripProjectDocument(allocated.candidate,workspace);
    idaRoadApplyRequire(idaRoadApplySame(decoded.project,allocated.candidate)&&idaRoadApplySame(decoded.workspace,workspace),
      'Portable roundtrip changed allocated road candidate or workspace.');
    verifiedWorkspace=decoded.workspace;
  }
  return {...allocated,workspace:verifiedWorkspace,transaction,receipt:issued};
}

// Begin captures only trusted mounted intent and reviewed result, not a
// mutable caller candidate or externally supplied accepted revision. No
// allocation, entropy, accepted write, or history mutation occurs here.
export function beginRoadIdentityApply(host,workspace,session,baselineRevision,revision,
  {asyncWorker=false,savedDistrictCount}={}){
  const view=host.view();
  const fingerprint=JSON.stringify(view.project);
  idaRoadApplyCheck(view,session,baselineRevision,revision,fingerprint);
  const snapshotJson=idaRoadApplySnapshotJson(session,revision),snapshot=JSON.parse(snapshotJson);
  idaRoadApplyRequire(!asyncWorker||(snapshot.kind==='single'&&snapshot.draft.selection.kind==='junction'),
    'Only junction Apply uses the asynchronous worker.');
  const token=Object.freeze({});
  const state={host,view,session,snapshot,snapshotJson,workspace:copyJson(workspace),revision,draftRevision:session.revision,
    asyncWorker:Boolean(asyncWorker),savedDistrictCount,reviewed:session.demolition?.candidate,
    authorization:session.demolition?.authorization};
  idaRoadApplyTokens.set(token,state);
  if(!asyncWorker)return {token};
  const d=snapshot.draft,i=snapshot.inspected;
  return {token,workerRequest:{operation:'apply',projectJson:fingerprint,
    junctionId:d.selection.id,workspace:copyJson(workspace),point:copyJson(d.point),
    targetJunctionId:d.targetJunctionId,decisions:copyJson(d.buildingDecisions),
    ownershipChoices:copyJson(d.ownershipChoices),parcelChoices:copyJson(d.parcelChoices),
    inspected:{candidateJson:i.candidateJson??JSON.stringify(i.candidateProject),ledger:copyJson(i.ledger)}}};
}
export function cancelRoadIdentityApply(token){return idaRoadApplyTokens.delete(token);}

// Finish is one-use, even on refusal. Compare the worker's exact result to
// a fresh local domain reconstruction. Non-demolition acceptance binds the
// exact independently verified result to the host's detached inputs; the
// coordinator independently validates identity, full project and history.
// Demolition retains its additional object-bound authorization reconstruction.
export function commitRoadIdentityApply(host,token,workspace,session,revision,workerResult){
  const state=idaRoadApplyTokens.get(token);
  idaRoadApplyRequire(state&&state.host===host,'Unknown or cancelled road Apply token.');
  idaRoadApplyTokens.delete(token);
  const view=host.view();
  idaRoadApplyRequire(view===state.view&&session===state.session&&revision===state.revision&&
    session.revision===state.draftRevision&&idaRoadApplySame(workspace,state.workspace),
    'Accepted identity, workspace or draft revision changed during road Apply.');
  const fingerprint=JSON.stringify(view.project);
  idaRoadApplyCheck(view,session,state.revision,revision,fingerprint);
  idaRoadApplyRequire(idaRoadApplySnapshotJson(session,revision)===state.snapshotJson&&
    session.demolition?.candidate===state.reviewed&&session.demolition?.authorization===state.authorization,
    'Reviewed road intent changed during Apply.');
  const legacy=idaRoadApplyReconstruct(state,view.project);
  idaRoadApplyRequire(legacy.ok,legacy.issues?.[0]?.message??'Road Apply refused.');
  idaRoadApplyRequire(state.asyncWorker?idaRoadApplySame(workerResult,legacy):workerResult===undefined,
    'Worker road Apply result differs from independent reconstruction.');
  const allocated=idaRoadApplyAllocated(state,view.project,legacy);
  idaRoadApplyRequire(host.view()===view&&session.current(),'Accepted road preview changed before publication.');
  // Single-use, synchronous, private evidence. Capture strings rather than
  // retaining a mutable candidate as the authority inside the callback.
  // Only results produced by the local reconstruction above qualify; a
  // preview or worker response can never supply this evidence.
  const evidence=state.snapshot.kind==='demolition'?null:Object.freeze({
    before:JSON.stringify(view.project),after:JSON.stringify(allocated.candidate),
    workspace:JSON.stringify(allocated.workspace),transaction:JSON.stringify(allocated.transaction)
  });
  const committed=host.commit({requests:allocated.requests,receipt:allocated.receipt,
    candidateCity:allocated.candidate.city,transaction:allocated.transaction,
    historyPolicy:state.snapshot.kind==='single'?'legacy-ordinary':'required',
    validateDomain:(before,after)=>{
      if(evidence){
        // Fail closed if the mounted intent, original accepted revision or
        // either detached coordinator input differs. This is not a hash or
        // a reusable permission receipt. The host still runs its own full
        // project, inventory, reservation and atomic history checks.
        return host.view()===view&&session.current()&&
          session.revision===state.draftRevision&&
          idaRoadApplySame(workspace,state.workspace)&&
          idaRoadApplySnapshotJson(session,revision)===state.snapshotJson&&
          session.demolition?.candidate===state.reviewed&&
          session.demolition?.authorization===state.authorization&&
          JSON.stringify(before)===evidence.before&&JSON.stringify(after)===evidence.after&&
          JSON.stringify(allocated.workspace)===evidence.workspace&&
          JSON.stringify(allocated.transaction)===evidence.transaction;
      }
      // Retain the existing independent authorization recheck for demolition.
      const fresh=idaRoadApplyReconstruct(state,before);
      const checked=idaRoadApplyAllocated(state,before,fresh,allocated.receipt);
      return idaRoadApplySame(checked.candidate,after)&&idaRoadApplySame(checked.workspace,allocated.workspace)&&
        idaRoadApplySame(checked.transaction,allocated.transaction);
    }});
  return {...committed,workspace:allocated.workspace,changed:allocated.changed,ledger:allocated.ledger};
}
