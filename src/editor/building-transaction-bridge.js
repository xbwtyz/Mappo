import { prepareBuildingStructure3H } from './building-structures.js';
import { prepareBuildingComponents } from './building-component-application.js';
import { preparePropertyBuildingClear4E } from './property-building-clear-4e.js';
import { copyJson } from '../data/project-format.js';

// The mounted editor and secure host use the same request shape and domain
// preparation. No worker-provided candidate or legacy draft ID is authority.
function idaEditorBuildingCreates(request){
  return request.operation==='add'&&!(request.courtyard?.hostId&&request.courtyard.only);
}
function idaEditorBuildingRequests(request){
  return idaEditorBuildingCreates(request)?[{type:'building',key:'manual-building'}]:[];
}
export function prepareBuildingEditorOperation(project,workspace,request,{history,identityReservation=null,previewOnly=false}={}){
  if(request.operation==='clear')
    return preparePropertyBuildingClear4E(project,workspace,request.propertyId);
  if(request.operation==='components'){
    const draft=request.componentDraft;
    if(!draft)return {ok:false,status:'invalid',candidate:null,issues:[{message:'Missing component draft.'}]};
    const result=prepareBuildingComponents(project,workspace,request.buildingId,{...draft,
      transform:{dx:draft.dx,dy:draft.dy,angle:draft.angle*Math.PI/180,
        scaleX:draft.scaleX/100,scaleY:draft.scaleY/100}},{previewOnly});
    if(draft.action==='join'&&result.ok&&(!history||!history.fits(project,result.candidate)))
      return {...result,ok:false,status:'invalid',candidate:null,
        issues:[{message:'This join exceeds the session Undo capacity.'}]};
    return result;
  }
  const allocating=identityReservation!==null&&idaEditorBuildingCreates(request);
  const actual=allocating?{...request,buildingId:identityReservation.receipt?.allocations?.[0]?.id}:request;
  return prepareBuildingStructure3H(project,workspace,actual,{
    identityReservation:allocating?identityReservation:null
  });
}
function idaEditorBuildingIntent(request){
  if(!request||typeof request!=='object'||Array.isArray(request)||
    typeof request.propertyId!=='string'||!request.propertyId||
    !['add','replace','delete','components','clear'].includes(request.operation))
    throw Error('Invalid building editor intent.');
  const input=copyJson(request);
  if(input.operation==='components'&&!input.componentDraft)
    throw Error('Missing component draft.');
  return input;
}
function idaEditorBuildingTransaction(project,input,receipt){
  const portal=input.operation==='add'&&input.courtyard?.hostId&&input.courtyard.only;
  const label=portal?'Edit courtyard access':({
    add:'Place building',replace:'Replace building',delete:'Delete building',
    components:'Edit building components',clear:'Clear property buildings'
  })[input.operation];
  const targetIds=input.operation==='clear'?
    [...(project.city.properties.find(p=>p.id===input.propertyId)?.buildingIds??[])]:
    [portal?input.courtyard.hostId:idaEditorBuildingCreates(input)?receipt.allocations[0].id:input.buildingId];
  return {family:'building',operation:'building-structure',label,targetIds};
}
export function previewBuildingEditorTransaction(host,workspace,request){
  const input=idaEditorBuildingIntent(request),{project,context,history}=host.view();
  const receipt=host.reserve(idaEditorBuildingRequests(input));
  const result=prepareBuildingEditorOperation(project,workspace,input,{history,identityReservation:{context,receipt}});
  return {context,receipt,result};
}
export function commitBuildingEditorTransaction(host,workspace,request,reservation){
  const input=idaEditorBuildingIntent(request),{project,context,history}=host.view();
  const receipt=reservation?.receipt;
  if(JSON.stringify(context)!==JSON.stringify(reservation?.context))
    throw Error('Stale building editor reservation.');
  const requests=idaEditorBuildingRequests(input);
  const result=prepareBuildingEditorOperation(project,workspace,input,{history,identityReservation:{context,receipt}});
  if(!result.ok)throw Error(result.reason??result.issues?.[0]?.message??'Building editor Apply refused.');
  return host.commit({requests,receipt,candidateCity:result.candidate.city,
    transaction:idaEditorBuildingTransaction(project,input,receipt),
    validateDomain:(before,after)=>{
      const fresh=prepareBuildingEditorOperation(before,workspace,input,{history,identityReservation:{context,receipt}});
      return fresh.ok&&JSON.stringify(fresh.candidate)===JSON.stringify(after);
    }});
}
