import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

const giCopy=copyJson, giPropertyHistorySame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const PROPERTY_FIELDS=Object.freeze(['boundary','frontage','area','local','frame']);

function snapshot(project,propertyId){
  const city=project?.city;
  const site=city?.properties.find(p=>p.id===propertyId);
  if(!site)throw new Error('Property no longer exists.');
  const plots=site.plotIds.map(id=>city.plots.find(p=>p.id===id&&p.propertyId===propertyId));
  if(plots.some(p=>!p))throw new Error('Property plot membership changed.');
  const buildings=site.buildingIds.map(id=>city.buildings.find(b=>b.id===id&&b.propertyId===propertyId));
  if(buildings.some(b=>!b))throw new Error('Property building membership changed.');
  const geometry=Object.fromEntries(PROPERTY_FIELDS.map(key=>[key,giCopy(site[key])]));
  const openSpace=city.openSpaces.find(o=>o.blockId===site.blockId);
  return {propertyId,blockId:site.blockId,plotIds:giCopy(site.plotIds),
    buildingIds:giCopy(site.buildingIds),geometry,
    plots:plots.map(p=>({id:p.id,boundary:giCopy(p.boundary)})),
    buildings:buildings.map(b=>({id:b.id,plotIds:giCopy(b.plotIds)})),
    openSpace:openSpace?{id:openSpace.id,area:openSpace.area}:null};
}
function restore(project,propertyId,target){
  const candidate=giCopy(project),city=candidate.city,site=city.properties.find(p=>p.id===propertyId);
  if(!site||site.blockId!==target.blockId
      ||!giPropertyHistorySame(site.plotIds,target.plotIds)||!giPropertyHistorySame(site.buildingIds,target.buildingIds))
    throw new Error('Property memberships changed since this edit.');
  for(const key of PROPERTY_FIELDS)site[key]=giCopy(target.geometry[key]);
  for(const plotRef of target.plots){
    const plot=city.plots.find(p=>p.id===plotRef.id&&p.propertyId===propertyId);
    if(!plot)throw new Error('Edited plot was deleted.');
    plot.boundary=giCopy(plotRef.boundary);
  }
  for(const row of target.buildings){
    const building=city.buildings.find(b=>b.id===row.id&&b.propertyId===propertyId);
    if(!building)throw new Error('Edited building no longer exists.');
    building.plotIds=giCopy(row.plotIds);
  }
  if(target.openSpace){
    const open=city.openSpaces.find(o=>o.id===target.openSpace.id&&o.blockId===target.blockId);
    if(!open)throw new Error('Block open-space record changed.');
    open.area=target.openSpace.area;
  }
  return candidate;
}

export class PropertyGeometryHistory3I {
  constructor(limit=20){
    if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Invalid property history bound.');
    this.limit=limit;this.past=[];this.future=[];this.serial=0;
  }
  clear(){this.past=[];this.future=[];this.serial=0;}
  count(direction,id){return (direction==='undo'?this.past:this.future).filter(row=>row.propertyId===id).length;}
  entry(direction,id){return (direction==='undo'?this.past:this.future).findLast(row=>row.propertyId===id)??null;}
  record(before,after,propertyId){
    const from=snapshot(before,propertyId),to=snapshot(after,propertyId);
    const structural=!giPropertyHistorySame(from.plotIds,to.plotIds);
    if(giPropertyHistorySame(from,to)&&!structural)return false;
    this.future=this.future.filter(row=>row.propertyId!==propertyId);
    this.past.push({propertyId,from:structural?giCopy(before.city):from,
      to:structural?giCopy(after.city):to,structural,serial:++this.serial});
    while(this.past.length+this.future.length>this.limit){
      const oldest=[...this.past,...this.future].sort((a,b)=>a.serial-b.serial)[0];
      const stack=this.past.includes(oldest)?this.past:this.future;
      stack.splice(stack.indexOf(oldest),1);
    }
    return true;
  }
  can(direction,project,propertyId){
    if(!['undo','redo'].includes(direction)||!propertyId)return false;
    const entry=this.entry(direction,propertyId);
    if(!entry)return false;
    try{return giPropertyHistorySame(entry.structural?project?.city:snapshot(project,propertyId),
      direction==='undo'?entry.to:entry.from);}
    catch{return false;}
  }
  prepare(project,workspace,propertyId,direction){
    if(!this.can(direction,project,propertyId))
      return {ok:false,reason:'No compatible property '+direction+' entry is available.'};
    const entry=this.entry(direction,propertyId);
    try{
      const candidate=entry.structural?giCopy(project)
        :restore(project,propertyId,direction==='undo'?entry.from:entry.to);
      if(entry.structural)candidate.city=giCopy(direction==='undo'?entry.from:entry.to);
      validateStoredProject(candidate);
      const saved=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
      if(!giPropertyHistorySame(candidate.city,saved.project.city))throw new Error('Portable save/load changed the restored city.');
      return {ok:true,candidate:saved.project,entry};
    }catch(error){return {ok:false,reason:'Property '+direction+' rejected: '+error.message};}
  }
  accept(entry,direction){
    const source=direction==='undo'?this.past:this.future, dest=direction==='undo'?this.future:this.past;
    const index=source.indexOf(entry);
    if(index<0)throw new Error('Property history changed.');
    source.splice(index,1);dest.push(entry);
  }
}
