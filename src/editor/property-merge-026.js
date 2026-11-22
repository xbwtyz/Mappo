import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { reconcileMergeBuildings026 } from './property-merge-adaptation-026.js';

const b03MergeIssue=(code,message,targetId=null)=>({code,message,targetId});

function b03MergeAssemble(project,session,geometry){
  const candidate=copyJson(project),city=candidate.city;
  const primary=city.properties.find(p=>p.id===session.primaryId),
    secondary=city.properties.find(p=>p.id===session.secondaryId);
  if(!primary||!secondary)throw Error('A source property disappeared.');
  if(primary.propertyMergeHistoryE3!==undefined&&!Array.isArray(primary.propertyMergeHistoryE3))
    throw Error('Primary merge lineage has an unsupported format.');
  const retiredRecord=copyJson(secondary);
  const originals=new Map(project.city.buildings.map(b=>[b.id,b]));
  Object.assign(primary,{plotIds:[...geometry.plotIds],buildingIds:[...geometry.buildingIds],
    boundary:copyJson(geometry.union),frontage:copyJson(geometry.union.slice(0,2)),
    area:geometry.area,local:copyJson(geometry.local),
    roadProvenance:{source:'user-merge-e3'}});
  city.properties=city.properties.filter(p=>p.id!==secondary.id);
  for(const id of secondary.plotIds){
    const plot=city.plots.find(p=>p.id===id);
    if(!plot||plot.propertyId!==secondary.id)throw Error('A source plot changed ownership.');
    plot.propertyId=primary.id;
  }
  for(const id of secondary.buildingIds){
    const building=city.buildings.find(b=>b.id===id);
    if(!building||building.propertyId!==secondary.id)throw Error('A source building changed ownership.');
    building.propertyId=primary.id;
  }
  const adaptation=reconcileMergeBuildings026(city,primary,geometry.frontageRoadIds,
    originals,session.approvedBuildings??new Set());
  const lineage={operation:'irregular-partial-edge-merge',sources:[primary.id,secondary.id],
    retainedId:primary.id,retiredId:secondary.id,retiredRecord,
    sourceFrontageRoadIds:[primary.frontageRoadId,secondary.frontageRoadId],
    buildingChanges:adaptation.changes.map(change=>({buildingId:change.buildingId,
      kind:change.kind,originalRecord:copyJson(change.originalRecord)}))};
  primary.propertyMergeHistoryE3=[...(primary.propertyMergeHistoryE3??[]),lineage];
  return {candidate,adaptation,lineage};
}

export function inspectPropertyMerge026(project,session,geometry,existingIssues=[]){
  try{
    const {adaptation}=b03MergeAssemble(project,session,geometry);
    const issues=[...existingIssues,...adaptation.issues];
    const preview={...geometry,protectedSecondary:existingIssues.some(i=>i.code==='authorization'&&i.targetId===geometry.secondary.id),
      approved:session.approved,transferredBuildings:geometry.secondary.buildingIds.length,
      retiredId:geometry.secondary.id,buildingAdaptations:adaptation.changes};
    // Expose protected-secondary consent regardless of whether it was checked.
    preview.protectedSecondary=Boolean(geometry.secondary.customName||
      geometry.secondary.customUse||geometry.secondary.customDescription||
      Object.keys(geometry.secondary).some(key=>!new Set(['id','blockId','districtId','plotIds','buildingIds',
        'boundary','frontage','frontageRoadId','area','usage','frame','local','roadProvenance',
        'propertySplitHistoryE2','propertyMergeHistoryE3']).has(key)));
    return {ok:issues.length===0,status:issues.length?'invalid':'valid',issues,preview};
  }catch(error){
    return {ok:false,status:'invalid',issues:[...existingIssues,b03MergeIssue('project',error.message)],preview:null};
  }
}

export function preparePropertyMerge026(project,workspace,session,inspection){
  if(!inspection.ok)return {...inspection,candidate:null};
  try{
    const {candidate,adaptation,lineage}=b03MergeAssemble(project,session,inspection.preview);
    if(adaptation.issues.length)
      throw Error(adaptation.issues.map(item=>item.message).join(' '));
    validateStoredProject(candidate);
    const restored=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace))).project;
    if(JSON.stringify(restored.city)!==JSON.stringify(candidate.city))
      throw Error('Portable project round-trip changed the merge.');
    return {...inspection,ok:true,status:'valid',candidate:restored,
      retainedId:session.primaryId,retiredId:session.secondaryId,lineage};
  }catch(error){
    return {...inspection,ok:false,status:'invalid',
      issues:[b03MergeIssue('project','Merge Apply rejected: '+error.message)],candidate:null};
  }
}
