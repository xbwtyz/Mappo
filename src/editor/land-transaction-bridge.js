import { captureEditorApplyEvidence,prepareMountedEditorCommitResult,finishMountedEditorCommit } from './editor-apply-evidence.js';
import { preparePropertyCreationE1 } from './property-creation-e1.js';
import { PropertySplitSessionE2,inspectPropertySplitE2,preparePropertySplitE2,propertySplitIdentityRequestsE2 } from './property-split-e2.js';
import { PropertyMergeSessionE3,preparePropertyMergeE3 } from './property-merge-e3.js';
import { PropertyEditSession3I } from './property-edit.js';
import { inspectPropertyEdit3I,preparePropertyApply3I,propertyEditIdentityRequests3I } from './property-application.js';
import { FlexiblePlotDraft027 } from './plot-draft-027.js';
import { flexibleSubdivisionIdentityRequests027 } from './plot-application-027.js';
import { preparePropertyDeletion4A } from './property-deletion.js';
import { copyJson } from '../data/project-format.js';

const idaMountedLandSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Actual mounted sessions remain the domain input. Secure-mode snapshots
// contain intent only; candidate city and allocation metadata never enter.
export function captureLandEditorIntent(kind,draft){
  if(kind==='property-create')return copyJson(draft);
  if(kind==='property-delete')return {propertyId:draft.propertyId};
  if(kind==='property-split')return {propertyId:draft.propertyId,t:draft.t,
    flexible:draft.flexible,exitEdge:draft.exitEdge,exitT:draft.exitT,approved:[...draft.approved]};
  if(kind==='property-merge')return {primaryId:draft.primaryId,secondaryId:draft.secondaryId,
    approved:draft.approved,approvedBuildings:[...draft.approvedBuildings]};
  if(kind==='property-and-plot')return {active:copyJson(draft.active),
    flexible:draft.flexible?copyJson(draft.flexible):null};
  throw Error('Unsupported mounted land editor operation.');
}
export function prepareLandEditorOperation(project,workspace,kind,draft,{identityReservation=null}={}){
  const options={identityReservation};
  switch(kind){
    case 'property-create':return preparePropertyCreationE1(project,workspace,draft,options);
    case 'property-split':return preparePropertySplitE2(project,workspace,draft,options);
    case 'property-merge':return preparePropertyMergeE3(project,workspace,draft);
    case 'property-and-plot':return preparePropertyApply3I(project,workspace,draft,options);
    case 'property-delete':return preparePropertyDeletion4A(project,workspace,draft.propertyId);
    default:throw Error('Unsupported mounted land editor operation.');
  }
}
// Legacy flexible drafts can recycle a temporary PLOT number after a merge.
// Assign a distinct journal-local label per creation, not per raw draft ID.
// This does not mutate the mounted draft or persist labels as active IDs.
function idaMountedFlexible(city,property,input){
  const draft=new FlexiblePlotDraft027(city,property);
  if(input.baseline!==draft.baseline||input.propertyId!==property.id||
    !idaMountedLandSame(input.parent,draft.parent)||!Array.isArray(input.operations)||
    input.operations.length<1||input.operations.length>12||!Array.isArray(input.plots))
    throw Error('Stale or invalid flexible plot draft.');
  const active=new Map(draft.plots.map(p=>[p.id,p.id]));
  const reserved=new Set(city.plots.map(p=>p.id));
  const mapId=id=>{if(!active.has(id))throw Error('Untracked flexible draft identity.');return active.get(id);};
  const mapPlots=rows=>{
    if(!Array.isArray(rows)||rows.length!==active.size||new Set(rows.map(p=>p.id)).size!==active.size)
      throw Error('Flexible draft journal membership changed.');
    return rows.map(p=>({id:mapId(p.id),boundary:copyJson(p.boundary)}));
  };
  for(const [i,op] of input.operations.entries()){
    const before=mapPlots(op.before);
    if(i===0&&!idaMountedLandSame(before,draft.plots))throw Error('Flexible draft baseline changed.');
    if(op.kind==='split'){
      const sourceId=mapId(op.sourceId);
      if(op.retainedId!==op.sourceId||active.has(op.createdId)||reserved.has(op.createdId))
        throw Error('Invalid flexible split membership.');
      let n=1,label;
      do{label='PLOT-DRAFT-'+i+'-'+n++;}while(reserved.has(label));
      reserved.add(label);active.set(op.createdId,label);
      draft.operations.push({kind:'split',sourceId,retainedId:sourceId,createdId:label,before});
    }else if(op.kind==='merge'){
      if(!Array.isArray(op.sources)||op.sources.length!==2||op.retainedId===op.retiredId||
        !op.sources.includes(op.retainedId)||!op.sources.includes(op.retiredId))
        throw Error('Invalid flexible merge membership.');
      const sources=op.sources.map(mapId),retainedId=mapId(op.retainedId),retiredId=mapId(op.retiredId);
      active.delete(op.retiredId);draft.operations.push({kind:'merge',sources,retainedId,retiredId,before});
    }else throw Error('Unsupported flexible plot journal step.');
  }
  draft.plots=mapPlots(input.plots);draft.approved=input.approved===true;draft.error=input.error||'';
  return draft;
}
function idaMountedLandDraft(project,kind,input){
  const city=project.city;
  if(kind==='property-create'||kind==='property-delete')return input;
  if(kind==='property-split'){
    const draft=new PropertySplitSessionE2();
    if(!draft.start(city,input.propertyId)||(draft.flexible!==input.flexible&&!draft.setFlexible(input.flexible))||
      !draft.setT(input.t)||(draft.flexible&&(!draft.setExitEdge(input.exitEdge)||!draft.setExitT(input.exitT))))
      throw Error('Invalid property split intent.');
    for(const id of input.approved)draft.approve(id,true);
    return draft;
  }
  if(kind==='property-merge'){
    const draft=new PropertyMergeSessionE3();
    if(!draft.start(city,input.primaryId)||!draft.choose(city,input.secondaryId))throw Error('Invalid property merge intent.');
    draft.approve(input.approved===true);
    for(const id of input.approvedBuildings)draft.approveBuilding(id,true);
    return draft;
  }
  const a=input.active,draft=new PropertyEditSession3I();
  if(!a||!draft.start(city,a.propertyId))throw Error('Invalid property edit intent.');
  for(const key of ['originalBoundary','originalDividers','originalPlotIds'])
    if(!idaMountedLandSame(a[key],draft.active[key]))throw Error('Stale property edit baseline.');
  if(input.flexible){
    if(!idaMountedLandSame(a.boundary,a.originalBoundary)||!idaMountedLandSame(a.dividers,a.originalDividers)||
      !idaMountedLandSame(a.plotIds,a.originalPlotIds)||a.countChange)
      throw Error('Flexible draft cannot change parent geometry.');
    draft.flexible=idaMountedFlexible(city,draft.source(city),input.flexible);return draft;
  }
  if(a.countChange){
    const change=a.countChange,index=draft.plotIds.indexOf(change.kind==='split'?change.sourceId:change.retainedId);
    const ok=change.kind==='split'?draft.addDivider(city,index):change.kind==='merge'?draft.removeDivider(index):false;
    if(!ok||!idaMountedLandSame(change,draft.countChange))throw Error('Invalid plot-count intent.');
  }
  if(!idaMountedLandSame(a.plotIds,draft.plotIds))throw Error('Untracked property plot identity.');
  draft.active.boundary=copyJson(a.boundary);draft.active.dividers=copyJson(a.dividers);
  draft.active.polygonEdited=a.polygonEdited===true;draft.active.approved=a.approved===true;
  return draft;
}
function idaMountedLandRequests(project,kind,draft){
  if(kind==='property-create')return [{type:'property',key:'new-property'},{type:'plot',key:'initial-plot'}];
  if(kind==='property-split')return propertySplitIdentityRequestsE2(project,inspectPropertySplitE2(project,draft));
  if(kind==='property-and-plot')return draft.flexibleMode?flexibleSubdivisionIdentityRequests027(project,draft):
    propertyEditIdentityRequests3I(project,inspectPropertyEdit3I(project,draft));
  return [];
}
function idaMountedLandTransaction(kind,draft,result,receipt){
  const label={'property-create':'Create property','property-split':'Split property','property-merge':'Merge properties',
    'property-and-plot':draft.flexible?.pending||draft.countChange?'Edit plot partitions':'Edit property and plots',
    'property-delete':'Delete property'}[kind];
  const targets=kind==='property-create'?[result.propertyId,result.plotId]:kind==='property-merge'?
    [result.retainedId,result.retiredId]:[draft.propertyId];
  return {family:'property',operation:kind,label,targetIds:[...new Set([...targets,...receipt.allocations.map(row=>row.id)])]};
}
export function previewLandEditorTransaction(host,workspace,kind,intent){
  const {project,context}=host.view(),draft=idaMountedLandDraft(project,kind,copyJson(intent));
  const receipt=host.reserve(idaMountedLandRequests(project,kind,draft));
  return {context,receipt,result:prepareLandEditorOperation(project,workspace,kind,draft,{identityReservation:{context,receipt}})};
}
export function commitLandEditorTransaction(host,workspace,kind,intent,reservation,{preserveLegacyCapacity=false,mountedCandidateJson}={}){
  const view=host.view(),{project,context}=view;
  const bindEvidence=captureEditorApplyEvidence(host,view,workspace,intent);
  if(!idaMountedLandSame(context,reservation?.context))throw Error('Stale land editor reservation.');
  const input=copyJson(intent),draft=idaMountedLandDraft(project,kind,input),requests=idaMountedLandRequests(project,kind,draft);
  const receipt=reservation.receipt,result=prepareLandEditorOperation(project,workspace,kind,draft,{identityReservation:{context,receipt}});
  if(!result.ok)throw Error(result.reason??result.issues?.[0]?.message??'Land editor Apply refused.');
  const mountedResult=prepareMountedEditorCommitResult(host,requests,receipt,result,mountedCandidateJson);
  const accepted=host.commit({requests,receipt,candidateCity:result.candidate.city,
    transaction:idaMountedLandTransaction(kind,draft,result,receipt),historyPolicy:preserveLegacyCapacity?'legacy-ordinary':'required',
    validateDomain:bindEvidence(result.candidate)});
  return finishMountedEditorCommit(accepted,mountedResult);
}
