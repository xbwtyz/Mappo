import { inspectPropertyMerge026, preparePropertyMerge026 } from './property-merge-026.js';
import { copyJson,createProjectDocument,encodeProjectDocument,decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { shapeContained } from '../core/building-validation.js';
import { propertyMergeGeometryE3,propertyMergeNeighborsE3 } from '../core/property-merge-geometry-e3.js';
import { PropertyCreationHistoryE1 } from './property-creation-e1.js';

export const PropertyMergeHistoryE3=PropertyCreationHistoryE1;
const e3MergeIssue=(code,message,targetId=null)=>({code,message,targetId});
const e3MergeSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const e3MergeBaseFields=new Set(['id','blockId','districtId','plotIds','buildingIds','boundary','frontage',
  'frontageRoadId','area','usage','frame','local','roadProvenance','propertySplitHistoryE2',
  'propertyMergeHistoryE3']);
function e3MergeRequiresAuthorization(source){
  return Boolean(source.customName||source.customUse||source.customDescription||
    Object.keys(source).some(key=>!e3MergeBaseFields.has(key)));
}

export class PropertyMergeSessionE3{
  constructor(changed=()=>{}){this.changed=changed;this.primaryId=null;this.secondaryId=null;this.approved=false;this.approvedBuildings=new Set();this.validation=null;}
  get active(){return Boolean(this.primaryId);}
  start(city,id){
    if(!city?.properties.some(p=>p.id===id))return false;
    this.primaryId=id;this.secondaryId=null;this.approved=false;this.approvedBuildings.clear();this.validation=null;
    this.changed();return true;
  }
  choose(city,id){
    if(!this.active||id===this.primaryId||!city?.properties.some(p=>p.id===id))return false;
    this.secondaryId=id;this.approved=false;this.approvedBuildings.clear();this.validation=null;this.changed();return true;
  }
  approve(value){this.approved=Boolean(value);this.validation=null;this.changed();}
  approveBuilding(id,value){if(value)this.approvedBuildings.add(id);else this.approvedBuildings.delete(id);this.validation=null;this.changed();}
  reset(){if(!this.active)return false;this.secondaryId=null;this.approved=false;this.approvedBuildings.clear();this.validation=null;this.changed();return true;}
  stop(){if(!this.active)return false;this.primaryId=null;this.secondaryId=null;this.approved=false;this.approvedBuildings.clear();this.validation=null;this.changed();return true;}
  geometry(city){try{return this.secondaryId?propertyMergeGeometryE3(city,this.primaryId,this.secondaryId):null;}catch{return null;}}
  neighbors(city){return propertyMergeNeighborsE3(city,this.primaryId);}
}

export function inspectPropertyMergeE3(project,session){
  if(!project?.city||!session?.active)return {ok:false,status:'choose',
    issues:[e3MergeIssue('selection','Select a property before starting E3.')],preview:null};
  if(!session.secondaryId)return {ok:false,status:'choose',
    issues:[e3MergeIssue('neighbor','Choose a compatible neighboring property from the map or list.')],preview:null};
  let geometry;
  try{geometry=propertyMergeGeometryE3(project.city,session.primaryId,session.secondaryId);}
  catch(error){return {ok:false,status:'invalid',issues:[e3MergeIssue('geometry',error.message)],preview:null};}
  const issues=[],secondary=geometry.secondary;
  const protectedSecondary=e3MergeRequiresAuthorization(secondary);
  if(protectedSecondary&&!session.approved)
    issues.push(e3MergeIssue('authorization','Authorize retirement of '+(secondary.customName||secondary.id)+
      ' with its complete identity preserved in merge lineage.',secondary.id));
  if(geometry.flexible)return inspectPropertyMerge026(project,session,geometry,issues);
  const members=new Set(geometry.buildingIds),plotIds=new Set(geometry.plotIds);
  if(members.size!==geometry.buildingIds.length)
    issues.push(e3MergeIssue('building','The source building lists overlap.'));
  for(const building of project.city.buildings.filter(b=>members.has(b.id))){
    if(!shapeContained(building.footprint,geometry.union)||
      !Array.isArray(building.plotIds)||!building.plotIds.length||
      building.plotIds.some(id=>!plotIds.has(id)))
      issues.push(e3MergeIssue('building','Building '+building.id+' lacks verifiable footprint or plot membership.',building.id));
    if(!Array.isArray(building.accessPath)||building.accessPath.length<2)
      issues.push(e3MergeIssue('access','Building '+building.id+' has no accepted access route.',building.id));
  }
  const preview={...geometry,protectedSecondary,approved:session.approved,
    transferredBuildings:secondary.buildingIds.length,retiredId:secondary.id};
  return {ok:!issues.length,status:issues.length?'invalid':'valid',issues,preview};
}

export function preparePropertyMergeE3(project,workspace,session){
  const inspected=inspectPropertyMergeE3(project,session);
  if(!inspected.ok)return {...inspected,candidate:null};
  if(inspected.preview?.flexible)return preparePropertyMerge026(project,workspace,session,inspected);
  try{
    const candidate=copyJson(project),city=candidate.city,geometry=inspected.preview;
    const primary=city.properties.find(p=>p.id===session.primaryId);
    const secondary=city.properties.find(p=>p.id===session.secondaryId);
    if(!primary||!secondary)throw Error('A source property disappeared.');
    const existing=primary.propertyMergeHistoryE3;
    if(existing!==undefined&&!Array.isArray(existing))
      throw Error('The primary property has unsupported merge history metadata.');
    const oldSecondary=copyJson(secondary);
    const lineage={operation:'adjacent-frontage-merge',sources:[primary.id,secondary.id],
      retainedId:primary.id,retiredId:secondary.id,retiredRecord:oldSecondary};
    const record={...primary,plotIds:[...geometry.plotIds],
      buildingIds:[...geometry.buildingIds],
      boundary:copyJson(geometry.union),frontage:copyJson(geometry.union.slice(0,2)),
      area:geometry.area,local:copyJson(geometry.local),
      roadProvenance:{source:'user-merge-e3'},
      propertyMergeHistoryE3:[...(existing??[]),lineage]};
    city.properties[city.properties.findIndex(p=>p.id===primary.id)]=record;
    city.properties=city.properties.filter(p=>p.id!==secondary.id);
    for(const plot of city.plots){
      if(plot.propertyId===secondary.id){
        if(!geometry.plotIds.includes(plot.id))throw Error('Secondary plot identity was not verified.');
        plot.propertyId=primary.id;
      }
    }
    for(const building of city.buildings){
      if(building.propertyId===secondary.id){
        if(!geometry.buildingIds.includes(building.id))throw Error('Secondary building identity was not verified.');
        building.propertyId=primary.id;
      }
    }
    validateStoredProject(candidate);
    const restored=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace))).project;
    if(!e3MergeSame(candidate.city,restored.city))throw Error('Portable project round-trip changed merge records.');
    return {...inspected,ok:true,status:'valid',candidate:restored,
      retainedId:primary.id,retiredId:secondary.id,lineage};
  }catch(error){
    return {...inspected,ok:false,status:'invalid',
      issues:[e3MergeIssue('project','Merge Apply rejected: '+error.message)],candidate:null};
  }
}
