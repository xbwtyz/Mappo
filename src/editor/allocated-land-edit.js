import { PropertyEditSession3I } from './property-edit.js';
import { inspectPropertyEdit3I,preparePropertyApply3I,propertyEditIdentityRequests3I } from './property-application.js';
import { PropertyMergeSessionE3,inspectPropertyMergeE3,preparePropertyMergeE3 } from './property-merge-e3.js';
import { verifyIdentityAdditions } from '../core/identity-verification.js';
import { copyJson } from '../data/project-format.js';

function idaLandEditFields(value,keys){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
}
function idaLandEditDraft(kind,project,intent){
  const city=project.city;
  if(kind==='property-merge'){
    if(!idaLandEditFields(intent,['primaryId','secondaryId','approved','approvedBuildings'])||
      typeof intent.primaryId!=='string'||typeof intent.secondaryId!=='string'||
      typeof intent.approved!=='boolean'||!Array.isArray(intent.approvedBuildings)||
      intent.approvedBuildings.some(id=>typeof id!=='string')||
      new Set(intent.approvedBuildings).size!==intent.approvedBuildings.length)
      throw Error('Invalid property merge intent.');
    const draft=new PropertyMergeSessionE3();
    if(!draft.start(city,intent.primaryId)||!draft.choose(city,intent.secondaryId))
      throw Error('Invalid property merge selection.');
    draft.approve(intent.approved);
    for(const id of intent.approvedBuildings)draft.approveBuilding(id,true);
    const inspected=inspectPropertyMergeE3(project,draft);
    if(!inspected.ok)throw Error(inspected.issues[0]?.message);
    return {draft,requests:[],targets:[intent.primaryId,intent.secondaryId]};
  }
  if(kind!=='property-edit'||!idaLandEditFields(intent,['propertyId','steps','approved'])||
    typeof intent.propertyId!=='string'||typeof intent.approved!=='boolean'||
    !Array.isArray(intent.steps)||!intent.steps.length||intent.steps.length>64)
    throw Error('Invalid property edit intent.');
  const draft=new PropertyEditSession3I();
  if(!draft.start(city,intent.propertyId))throw Error('Invalid property edit selection.');
  for(const step of intent.steps){
    let ok=false;
    if(step?.kind==='corner'&&idaLandEditFields(step,['kind','index','point'])&&
      idaLandEditFields(step.point,['x','y']))ok=draft.setCorner(step.index,step.point);
    else if(step?.kind==='frontage'&&idaLandEditFields(step,['kind','points'])&&
      Array.isArray(step.points)&&step.points.every(p=>idaLandEditFields(p,['x','y'])))ok=draft.setFrontage(step.points);
    else if(step?.kind==='restore-frontage'&&idaLandEditFields(step,['kind']))ok=draft.restoreFrontage();
    else if(step?.kind==='add-vertex'&&idaLandEditFields(step,['kind','index']))ok=draft.addVertex(step.index);
    else if(step?.kind==='remove-vertex'&&idaLandEditFields(step,['kind','index']))ok=draft.removeVertex(step.index);
    else if(step?.kind==='divider'&&idaLandEditFields(step,['kind','index','ratio']))ok=draft.setDivider(step.index,step.ratio);
    else if(step?.kind==='add-divider'&&idaLandEditFields(step,['kind','index']))ok=draft.addDivider(city,step.index);
    else if(step?.kind==='remove-divider'&&idaLandEditFields(step,['kind','index']))ok=draft.removeDivider(step.index);
    if(!ok)throw Error('Invalid property edit step.');
  }
  if(draft.countChange)draft.approvePlotCount(intent.approved);
  const inspected=inspectPropertyEdit3I(project,draft);
  if(!inspected.ok||!draft.isPending)throw Error(inspected.issues[0]?.message??'No property changes pending.');
  return {draft,requests:propertyEditIdentityRequests3I(project,inspected),targets:[intent.propertyId]};
}
function idaLandEditPrepare(kind,project,workspace,prepared,context,receipt){
  if(kind==='property-edit')return preparePropertyApply3I(project,workspace,prepared.draft,{identityReservation:{context,receipt}});
  const result=preparePropertyMergeE3(project,workspace,prepared.draft);
  if(result.ok){
    const state=verifyIdentityAdditions(project.identityAllocation,project.city,context,[],receipt,result.candidate.city);
    if(JSON.stringify(state)!==JSON.stringify(result.candidate.identityAllocation))
      throw Error('Property merge changed allocation state.');
  }
  return result;
}
export function previewAllocatedLandEdit(session,workspace,kind,intent){
  const {project,context}=session.read(),prepared=idaLandEditDraft(kind,project,intent);
  const receipt=session.reserve(prepared.requests);
  return {context,receipt,result:idaLandEditPrepare(kind,project,workspace,prepared,context,receipt)};
}
export function commitAllocatedLandEdit(session,workspace,kind,intent,reservation){
  const {project,context}=session.read();
  if(!reservation?.context||JSON.stringify(context)!==JSON.stringify(reservation.context))
    throw Error('Stale land edit reservation.');
  const input=copyJson(intent),prepared=idaLandEditDraft(kind,project,input);
  const receipt=reservation.receipt,result=idaLandEditPrepare(kind,project,workspace,prepared,context,receipt);
  if(!result.ok)throw Error(result.issues?.[0]?.message??'Land edit refused.');
  return session.commit({requests:prepared.requests,receipt,candidateCity:result.candidate.city,
    transaction:{family:'property',operation:kind,label:kind==='property-merge'?'Merge properties':'Edit property',
      targetIds:[...prepared.targets,...receipt.allocations.map(row=>row.id)]},
    validateDomain:(before,after)=>{
      const fresh=idaLandEditDraft(kind,before,input);
      const checked=idaLandEditPrepare(kind,before,workspace,fresh,context,receipt);
      return checked.ok&&JSON.stringify(checked.candidate)===JSON.stringify(after);
    }
  });
}
