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
export function prepareFlexiblePlot027(project,workspace,session){
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
    const sources=[...original.values()].map(copyJson),beforeIds=property.plotIds.slice();
    const afterIds=new Set(draft.plots.map(p=>p.id));
    const replacements=draft.plots.map(p=>{
      const old=original.get(p.id);
      return old?{...copyJson(old),boundary:copyJson(p.boundary)}:{
        id:p.id,propertyId:property.id,blockId:property.blockId,
        // Existing schema-9 owner reference; not a new physical road connection.
        frontageRoadId:property.frontageRoadId,boundary:copyJson(p.boundary)};
    });
    property.plotIds=draft.plots.map(p=>p.id);
    city.plots=city.plots.filter(p=>p.propertyId!==property.id).concat(replacements);
    property.plotPartitionHistory027=[...(history??[]),{
      operation:'flexible-plot-partition',sourcePlotIds:beforeIds,resultPlotIds:property.plotIds.slice(),
      retiredIds:beforeIds.filter(id=>!afterIds.has(id)),sourceRecords:sources,
      steps:draft.operations.map(({before,...op})=>copyJson(op)),
      authorizedOriginalIds:draft.authorizations(project.city)
    }];
    for(const building of city.buildings.filter(b=>b.propertyId===property.id)){
      building.plotIds=deriveOccupiedPlots(city,property,building);
      if(!building.plotIds.length)throw Error('Building '+building.id+' has no valid plot membership.');
    }
    validateStoredProject(candidate);
    const restored=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
    if(!b04SameProject027(candidate.city,restored.project.city))throw Error('Portable save changed plot records.');
    return {ok:true,status:'valid',issues:[],preview:inspected.preview,candidate:restored.project};
  }catch(error){return {ok:false,status:'invalid',issues:[b04Issue027('project','Plot Apply rejected: '+error.message)],preview:inspected.preview,candidate:null};}
}
