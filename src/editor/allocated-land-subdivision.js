import { PropertySplitSessionE2,inspectPropertySplitE2,preparePropertySplitE2,propertySplitIdentityRequestsE2 } from './property-split-e2.js';
import { FlexiblePlotDraft027 } from './plot-draft-027.js';
import { inspectFlexiblePlot027,prepareFlexiblePlot027,flexibleSubdivisionIdentityRequests027 } from './plot-application-027.js';
import { copyJson } from '../data/project-format.js';

// Trusted host intent is replayed from the accepted city, never from a
// caller-supplied candidate, session object, or temporary plot identity.
function idaLandFields(value,keys){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
}
function idaLandSplit(project,intent){
  if(!idaLandFields(intent,['propertyId','t','flexible','exitEdge','exitT','approved'])||
    typeof intent.propertyId!=='string'||typeof intent.flexible!=='boolean'||
    !Number.isFinite(intent.t)||!Number.isInteger(intent.exitEdge)||!Number.isFinite(intent.exitT)||
    !Array.isArray(intent.approved)||intent.approved.some(id=>typeof id!=='string')||
    new Set(intent.approved).size!==intent.approved.length)
    throw Error('Invalid property split intent.');
  const draft=new PropertySplitSessionE2();
  if(!draft.start(project.city,intent.propertyId)||
    (draft.flexible!==intent.flexible&&!draft.setFlexible(intent.flexible))||
    !draft.setT(intent.t)||
    (draft.flexible&&(!draft.setExitEdge(intent.exitEdge)||!draft.setExitT(intent.exitT))))
    throw Error('Invalid property split geometry intent.');
  for(const id of intent.approved)draft.approve(id,true);
  const inspection=inspectPropertySplitE2(project,draft);
  if(!inspection.ok)throw Error(inspection.issues[0]?.message);
  return {draft,requests:propertySplitIdentityRequestsE2(project,inspection)};
}
function idaLandSubdivision(project,intent){
  if(!idaLandFields(intent,['propertyId','steps','approved'])||
    typeof intent.propertyId!=='string'||typeof intent.approved!=='boolean'||
    !Array.isArray(intent.steps)||!intent.steps.length||intent.steps.length>12)
    throw Error('Invalid plot subdivision intent.');
  const property=project.city.properties.find(p=>p.id===intent.propertyId);
  if(!property)throw Error('Selected property disappeared.');
  const flexible=new FlexiblePlotDraft027(project.city,property);
  for(const step of intent.steps){
    if(!idaLandFields(step,['sourceIndex','edgeA','edgeB','ratioA','ratioB','retain'])||
      !Number.isInteger(step.sourceIndex)||!flexible.plots[step.sourceIndex]||
      !['first','second'].includes(step.retain))
      throw Error('Invalid subdivision step.');
    flexible.selectedId=flexible.plots[step.sourceIndex].id;
    for(const key of ['edgeA','edgeB','ratioA','ratioB','retain'])flexible[key]=step[key];
    flexible.split(project.city);
  }
  flexible.approved=intent.approved;
  const draft={propertyId:property.id,boundary:copyJson(property.boundary),flexible};
  const inspection=inspectFlexiblePlot027(project,draft);
  if(!inspection.ok)throw Error(inspection.issues[0]?.message);
  return {draft,requests:flexibleSubdivisionIdentityRequests027(project,draft)};
}
function idaLandOperation(kind,project,intent){
  if(kind==='property-split')return idaLandSplit(project,intent);
  if(kind==='plot-subdivision')return idaLandSubdivision(project,intent);
  throw Error('Unsupported land subdivision operation.');
}
function idaLandPrepare(kind,project,workspace,draft,context,receipt){
  const prepare=kind==='property-split'?preparePropertySplitE2:prepareFlexiblePlot027;
  return prepare(project,workspace,draft,{identityReservation:{context,receipt}});
}
export function previewAllocatedLandSubdivision(session,workspace,kind,intent){
  const {project,context}=session.read(),{draft,requests}=idaLandOperation(kind,project,intent);
  const receipt=session.reserve(requests);
  return {context,receipt,result:idaLandPrepare(kind,project,workspace,draft,context,receipt)};
}
export function commitAllocatedLandSubdivision(session,workspace,kind,intent,reservation){
  const {project,context}=session.read();
  if(!reservation?.context||JSON.stringify(context)!==JSON.stringify(reservation.context))
    throw Error('Stale land subdivision reservation.');
  const input=copyJson(intent),{draft,requests}=idaLandOperation(kind,project,input);
  const receipt=reservation.receipt,result=idaLandPrepare(kind,project,workspace,draft,context,receipt);
  if(!result.ok)throw Error(result.issues?.[0]?.message??'Land subdivision refused.');
  return session.commit({requests,receipt,candidateCity:result.candidate.city,
    transaction:{family:'property',operation:kind,label:kind==='property-split'?'Split property':'Subdivide plots',
      targetIds:[input.propertyId,...receipt.allocations.map(row=>row.id)]},
    validateDomain:(before,after)=>{
      const fresh=idaLandOperation(kind,before,input);
      const checked=idaLandPrepare(kind,before,workspace,fresh.draft,context,receipt);
      return checked.ok&&JSON.stringify(checked.candidate)===JSON.stringify(after);
    }
  });
}
