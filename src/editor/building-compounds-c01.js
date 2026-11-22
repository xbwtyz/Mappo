// C01: property-owned linked compounds. Each child remains an independent
// schema-9 building; compound relationships never overwrite authored geometry.
import {copyJson,createProjectDocument,decodeProjectDocument,encodeProjectDocument} from '../data/project-format.js';
import {validateStoredProject} from '../data/project-validation.js';
import {normalizeBuildingTransform,buildingTransformDirty} from '../core/building-transform.js';
import {polygonSignedArea} from '../core/geometry.js';
import {inspectBuildingGeometry} from '../core/building-validation.js';
import {deriveOccupiedPlots,reattachFrontage} from './building-application.js';

const c01Issue=(code,message,buildingId=null)=>({code,message,buildingId});
const c01Error=(code,message,buildingId=null,preview=null)=>({
  ok:false,status:'invalid',issues:[c01Issue(code,message,buildingId)],candidate:null,preview
});
const c01Groups=p=>p.buildingCompounds??[];
const c01Group=(project,propertyId,groupId)=>{
  const property=project?.city?.properties.find(p=>p.id===propertyId);
  const group=property && c01Groups(property).find(g=>g.id===groupId);
  return property&&group?{property,group}:null;
};
function c01RoundTrip(proposed,workspace) {
  validateStoredProject(proposed);
  const decoded=decodeProjectDocument(encodeProjectDocument(createProjectDocument(proposed,workspace)));
  if (JSON.stringify(decoded.project.city)!==JSON.stringify(proposed.city))
    throw Error('Portable save/load modified compound geometry or membership.');
  return decoded.project;
}
function c01NextGroupId(city) {
  const existing=new Set(city.properties.flatMap(p=>c01Groups(p).map(g=>g.id)));
  for(let i=1;i<100000;i++) {
    const id='CMP-MAN-'+i.toString(36).toUpperCase().padStart(4,'0');
    if(!existing.has(id))return id;
  }
  throw Error('Compound identifier capacity reached.');
}
export function prepareCompoundMembership(project,workspace,request) {
  const {propertyId,groupId,action,memberBuildingIds,name}=request??{};
  const original=project?.city?.properties.find(p=>p.id===propertyId);
  if(!original)return c01Error('property','The selected property is missing.');
  if(!['create','update','dissolve'].includes(action))
    return c01Error('action','Choose create, update or dissolve.');
  const group=c01Groups(original).find(g=>g.id===groupId);
  if(action!=='create'&&!group)return c01Error('group','The compound no longer exists.');
  if(action==='create' && groupId)return c01Error('group','New compounds receive a new ID.');
  const requested=action==='dissolve'?[]:memberBuildingIds;
  if(action!=='dissolve'&&(!Array.isArray(requested)||requested.length<2||
      requested.length>32||new Set(requested).size!==requested.length))
    return c01Error('members','Select 2–32 different buildings on this property.');
  const title=action==='dissolve'?'':String(name??group?.name??'').trim();
  if(action!=='dissolve'&&(!title||title.length>80))
    return c01Error('name','Enter a compound name of 1–80 characters.');
  const proposed=copyJson(project),property=proposed.city.properties.find(p=>p.id===propertyId);
  const groups=c01Groups(property).slice();
  const id=action==='create'?c01NextGroupId(project.city):groupId;
  if(action==='create') groups.push({id,name:title,memberBuildingIds:requested.slice()});
  else if(action==='dissolve') groups.splice(groups.findIndex(g=>g.id===groupId),1);
  else groups.splice(groups.findIndex(g=>g.id===groupId),1,
    {...groups.find(g=>g.id===groupId),name:title,memberBuildingIds:requested.slice()});
  if(!groups.length)delete property.buildingCompounds;
  else property.buildingCompounds=groups;
  if(JSON.stringify(c01Groups(original))===JSON.stringify(c01Groups(property)))
    return c01Error('unchanged','Compound membership and name are unchanged.');
  try{return {ok:true,status:'valid',issues:[],candidate:c01RoundTrip(proposed,workspace),groupId:id};}
  catch(error){return c01Error('project',error.message);}
}
function c01Members(project,propertyId,groupId) {
  const target=c01Group(project,propertyId,groupId);
  if(!target)throw Error('The selected compound no longer exists.');
  const members=target.group.memberBuildingIds.map(id=>{
    const b=project.city.buildings.find(item=>item.id===id&&item.propertyId===propertyId);
    if(!b)throw Error('Compound member '+id+' is missing or has moved to another property.');
    return b;
  });
  return {...target,members};
}
export function compoundTransformFrame(project,propertyId,groupId) {
  const {members}=c01Members(project,propertyId,groupId);
  const pts=members.flatMap(b=>b.footprint);
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
  const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
  return {x:(minX+maxX)/2,y:(minY+maxY)/2,width:maxX-minX,height:maxY-minY};
}
export function previewCompoundTransform(project,propertyId,groupId,input={}) {
  const {members}=c01Members(project,propertyId,groupId);
  const transform=normalizeBuildingTransform(input);
  const frame=compoundTransformFrame(project,propertyId,groupId);
  const c=Math.cos(transform.angle),s=Math.sin(transform.angle);
  const map=p=>{
    const x=(p.x-frame.x)*transform.scaleX;
    const y=(p.y-frame.y)*transform.scaleY;
    return {x:frame.x+transform.dx+c*x-s*y,y:frame.y+transform.dy+s*x+c*y};
  };
  const proposed=copyJson(project);
  const originalIds=new Set(members.map(b=>b.id));
  for(const b of proposed.city.buildings) {
    if(!originalIds.has(b.id))continue;
    b.footprint=b.footprint.map(map);
    b.holes=b.holes.map(h=>h.map(map));
    b.orientation+=transform.angle;
    b.area=polygonSignedArea(b.footprint)-
      b.holes.reduce((sum,h)=>sum+polygonSignedArea(h),0);
    b.entrance=b.entrance?map(b.entrance):null;
    b.accessPath=(b.accessPath??[]).map(map);
  }
  return {project:proposed,buildingIds:members.map(b=>b.id),frame,transform};
}
export function prepareCompoundTransform(project,workspace,propertyId,groupId,transform) {
  let preview;
  try {
    if(!buildingTransformDirty(normalizeBuildingTransform(transform)))
      return c01Error('unchanged','Change the group position, angle or size before Apply.');
    preview=previewCompoundTransform(project,propertyId,groupId,transform);
    const city=preview.project.city;
    for(const id of preview.buildingIds){
      // All proposed footprints are already in the same detached city before
      // we check collisions, so member iteration order cannot change validity.
      const check=inspectBuildingGeometry(city,id,{});
      if(!check.ok)return c01Error('geometry',check.issues[0].message,id,preview);
    }
    for(const id of preview.buildingIds){
      const b=city.buildings.find(item=>item.id===id);
      const property=city.properties.find(p=>p.id===propertyId);
      b.plotIds=deriveOccupiedPlots(city,property,b);
      if(!b.plotIds.length)return c01Error('plots','No occupied plot remains.',id,preview);
    }
    for(const id of preview.buildingIds){
      const b=city.buildings.find(item=>item.id===id);
      const route=reattachFrontage(city,b);
      if(!route)return c01Error('access','No unobstructed access to the existing frontage road.',id,preview);
      b.entrance=route.entrance;b.accessPath=route.accessPath;
    }
    return {ok:true,status:'valid',issues:[],candidate:c01RoundTrip(preview.project,workspace),preview};
  }catch(error){return c01Error('project',error.message,null,preview);}
}
