import { verifyIdentityReservation, verifyIdentityAdditions } from '../core/identity-verification.js';
import { copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { validatePlotTiling027 } from '../core/plot-partition-027.js';
import { deriveOccupiedPlots } from './building-application.js';
import { polygonSignedArea } from '../core/geometry.js';

const b04SameProject027=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const b04Issue027=(code,message,targetId)=>({code,message,targetId});
export function inspectFlexiblePlot027(project,session){
  const draft=session?.flexible,city=project?.city,property=city?.properties.find(p=>p.id===draft?.propertyId);
  if(!draft||!property)return {ok:false,status:'invalid',issues:[b04Issue027('selection','Flexible plot draft is unavailable.')],preview:null};
  const issues=[];
  if(session.propertyId!==property.id||!b04SameProject027(session.boundary,property.boundary))
    issues.push(b04Issue027('stale','The selected property boundary changed; reset this draft.',property.id));
  if(draft.error)issues.push(b04Issue027('geometry',draft.error,property.id));
  try{validatePlotTiling027(property.boundary,draft.plots);}
  catch(error){issues.push(b04Issue027('tiling',error.message,property.id));}
  const ids=draft.plots.map(p=>p.id),others=new Set(city.plots.filter(p=>p.propertyId!==property.id).map(p=>p.id));
  if(new Set(ids).size!==ids.length||ids.some(id=>others.has(id)))
    issues.push(b04Issue027('identity','A proposed plot identity conflicts with another plot.',property.id));
  const protectedIds=draft.authorizations(city);
  if(protectedIds.length&&!draft.approved)
    issues.push(b04Issue027('authorization','Authorize metadata scope or retirement for '+protectedIds.join(', '),property.id));
  const preview={boundary:copyJson(property.boundary),plots:copyJson(draft.plots),plotIds:ids,
    area:property.area,total:draft.plots.reduce((s,p)=>s+polygonSignedArea(p.boundary),0),
    operations:draft.operations.length,protectedIds};
  return {ok:!issues.length,status:issues.length?'invalid':draft.pending?'valid':'unchanged',issues,preview};
}
// Reserve only new identities that survive the entire bounded journal.
// A draft-only creation subsequently retired is represented by its local
// PLOT-DRAFT label in this entry's steps, not by a committed entity ID.
export function flexibleSubdivisionIdentityRequests027(project,session){
  const draft=session?.flexible;
  if(!draft?.pending)throw Error('A plot partition draft is required.');
  const property=project.city.properties.find(p=>p.id===draft.propertyId);
  if(!property)throw Error('Original plot owner disappeared.');
  const existing=new Set(project.city.plots.map(p=>p.id)),active=new Set(property.plotIds),created=new Map();
  for(const [i,op] of draft.operations.entries()){
    if(op.kind==='split'){
      if(!active.has(op.sourceId)||op.retainedId!==op.sourceId||
        existing.has(op.createdId)||created.has(op.createdId)||active.has(op.createdId))
        throw Error('Invalid subdivision identity journal.');
      created.set(op.createdId,i);active.add(op.createdId);
    }else if(op.kind==='merge'){
      if(!Array.isArray(op.sources)||op.sources.length!==2||
        op.retainedId===op.retiredId||!op.sources.includes(op.retainedId)||
        !op.sources.includes(op.retiredId)||!active.has(op.retainedId)||!active.has(op.retiredId))
        throw Error('Invalid plot merge identity journal.');
      active.delete(op.retiredId);
    }else throw Error('Unsupported plot partition journal step.');
  }
  if(active.size!==draft.plots.length||draft.plots.some(p=>!active.has(p.id)))
    throw Error('Untracked draft plot identity.');
  for(const id of created.keys())if(!active.has(id)&&!/^PLOT-DRAFT-\d+-\d+$/.test(id))
    throw Error('Retired draft plot requires an unambiguous local journal label.');
  return [...created].filter(([id])=>active.has(id)).map(([,i])=>({type:'plot',key:'subdivision-'+i}));
}
export function prepareFlexiblePlot027(project,workspace,session,{identityReservation=null}={}){
  const inspected=inspectFlexiblePlot027(project,session),draft=session?.flexible;
  if(!inspected.ok)return {...inspected,candidate:null};
  if(!draft.pending)return {ok:false,status:'unchanged',issues:[b04Issue027('unchanged','No plot changes are pending.')],preview:inspected.preview,candidate:null};
  if(JSON.stringify(project.city)!==draft.baseline)
    return {ok:false,status:'stale',issues:[b04Issue027('stale','The accepted city changed; reset this plot draft.')],preview:inspected.preview,candidate:null};
  try{
    const candidate=copyJson(project),city=candidate.city,property=city.properties.find(p=>p.id===draft.propertyId);
    if(!property)throw Error('Selected property disappeared.');
    const original=new Map(city.plots.filter(p=>p.propertyId===property.id).map(p=>[p.id,p]));
    const history=property.plotPartitionHistory027;
    if(history!==undefined&&(!Array.isArray(history)||history.length>=20))
      throw Error('Unsupported or full plot-partition history; original records must be preserved.');
    let verifiedAllocation=null,requests=[];
    const allocated=new Map();
    if(identityReservation!==null){
      if(project.schemaVersion!==11)throw Error('Identity reservation requires Schema 11.');
      requests=flexibleSubdivisionIdentityRequests027(project,session);
      const {context,receipt}=identityReservation;
      verifiedAllocation=verifyIdentityReservation(project.identityAllocation,project.city,context,requests,receipt);
      const byKey=new Map(receipt.allocations.map(row=>[row.key,row.id]));
      draft.operations.forEach((op,i)=>{
        if(op.kind==='split'&&byKey.has('subdivision-'+i))allocated.set(op.createdId,byKey.get('subdivision-'+i));
      });
      candidate.identityAllocation=verifiedAllocation;
    }
    const mapped=id=>allocated.get(id)??id;
    const sources=[...original.values()].map(copyJson),beforeIds=property.plotIds.slice();
    const afterIds=new Set(draft.plots.map(p=>p.id));
    const replacements=draft.plots.map(p=>{
      const old=original.get(p.id);
      return old?{...copyJson(old),boundary:copyJson(p.boundary)}:{
        id:mapped(p.id),propertyId:property.id,blockId:property.blockId,
        // Existing schema-9 owner reference; not a new physical road connection.
        frontageRoadId:property.frontageRoadId,boundary:copyJson(p.boundary)};
    });
    property.plotIds=draft.plots.map(p=>mapped(p.id));
    city.plots=city.plots.filter(p=>p.propertyId!==property.id).concat(replacements);
    property.plotPartitionHistory027=[...(history??[]),{
      operation:'flexible-plot-partition',sourcePlotIds:beforeIds,resultPlotIds:property.plotIds.slice(),
      retiredIds:beforeIds.filter(id=>!afterIds.has(id)),sourceRecords:sources,
      steps:draft.operations.map(({before,...op})=>verifiedAllocation
        ?(op.kind==='split'
          ?{kind:'split',sourceId:mapped(op.sourceId),retainedId:mapped(op.retainedId),createdId:mapped(op.createdId)}
          :{kind:'merge',sources:op.sources.map(mapped),retainedId:mapped(op.retainedId),retiredId:mapped(op.retiredId)})
        :copyJson(op)),
      authorizedOriginalIds:draft.authorizations(project.city)
    }];
    for(const building of city.buildings.filter(b=>b.propertyId===property.id)){
      building.plotIds=deriveOccupiedPlots(city,property,building);
      if(!building.plotIds.length)throw Error('Building '+building.id+' has no valid plot membership.');
    }
    if(verifiedAllocation)verifyIdentityAdditions(project.identityAllocation,project.city,
      identityReservation.context,requests,identityReservation.receipt,city);
    validateStoredProject(candidate);
    const restored=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
    if(!b04SameProject027(candidate.city,restored.project.city))throw Error('Portable save changed plot records.');
    if(verifiedAllocation&&!b04SameProject027(restored.project.identityAllocation,verifiedAllocation))
      throw Error('Portable save changed subdivision allocation state.');
    return {ok:true,status:'valid',issues:[],preview:inspected.preview,candidate:restored.project};
  }catch(error){return {ok:false,status:'invalid',issues:[b04Issue027('project','Plot Apply rejected: '+error.message)],preview:inspected.preview,candidate:null};}
}
