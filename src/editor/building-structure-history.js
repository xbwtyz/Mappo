import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

const h3StructureSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const h3StripIdentity=record=>{
  const result=copyJson(record);
  delete result.customName;delete result.customUse;
  return result;
};
function h3StructureSnapshot(project,propertyId) {
  const property=project?.city?.properties.find(p=>p.id===propertyId);
  if(!property)throw new Error('Property is no longer available.');
  const rows=project.city.buildings
    .map((record,index)=>({index,record}))
    .filter(row=>row.record.propertyId===propertyId)
    .map(row=>({index:row.index,record:copyJson(row.record)}));
  if(!h3StructureSame(rows.map(row=>row.record.id).slice().sort(),property.buildingIds.slice().sort()))
    throw new Error('Building membership is inconsistent.');
  return {propertyId,buildingIds:copyJson(property.buildingIds),rows};
}
function h3StructureMatches(current,expected) {
  return current.propertyId===expected.propertyId &&
    h3StructureSame(current.buildingIds,expected.buildingIds) &&
    h3StructureSame(current.rows.map(r=>h3StripIdentity(r.record)),expected.rows.map(r=>h3StripIdentity(r.record)));
}
function h3StructureRestore(project,propertyId,snapshot) {
  const candidate=copyJson(project),site=candidate.city.properties.find(p=>p.id===propertyId);
  const current=new Map(candidate.city.buildings.map(b=>[b.id,b]));
  site.buildingIds=copyJson(snapshot.buildingIds);
  const remaining=candidate.city.buildings.filter(b=>b.propertyId!==propertyId);
  for(const row of snapshot.rows) {
    const data=copyJson(row.record),live=current.get(data.id);
    // Applied names and uses belong to the building, not to Undo history.
    if(live)for(const field of ['customName','customUse']){
      if(Object.hasOwn(live,field))data[field]=live[field]; else delete data[field];
    }
    remaining.splice(Math.min(row.index,remaining.length),0,data);
  }
  candidate.city.buildings=remaining;
  return candidate;
}
export class BuildingStructureHistory3H {
  constructor(limit=20){this.limit=limit;this.past=[];this.future=[];this.serial=0;}
  clear(){this.past=[];this.future=[];this.serial=0;}
  get history(){return this.past;}
  count(direction,propertyId) {
    return (direction==='undo'?this.past:this.future).filter(x=>x.propertyId===propertyId).length;
  }
  record(before,after,propertyId,operation) {
    const previous=h3StructureSnapshot(before,propertyId),next=h3StructureSnapshot(after,propertyId);
    if(h3StructureMatches(previous,next))return false;
    this.future=this.future.filter(e=>e.propertyId!==propertyId);
    this.past.push({propertyId,operation,before:previous,after:next,serial:++this.serial});
    while(this.past.length+this.future.length>this.limit){
      const oldest=[...this.past,...this.future].sort((a,b)=>a.serial-b.serial)[0];
      const stack=this.past.includes(oldest)?this.past:this.future;
      stack.splice(stack.indexOf(oldest),1);
    }
    return true;
  }
  entry(direction,propertyId) {
    const source=direction==='undo'?this.past:this.future;
    for(let i=source.length-1;i>=0;i--)if(source[i].propertyId===propertyId)return source[i];
    return null;
  }
  can(direction,project,propertyId) {
    if(!['undo','redo'].includes(direction))return false;
    const entry=this.entry(direction,propertyId);
    if(!entry)return false;
    try{
      return h3StructureMatches(h3StructureSnapshot(project,propertyId),
        direction==='undo'?entry.after:entry.before);
    }catch{return false;}
  }
  prepare(project,workspace,propertyId,direction){
    if(!this.can(direction,project,propertyId))
      return {ok:false,issues:[{code:'history',message:'No compatible structural change to '+direction+'.'}]};
    const entry=this.entry(direction,propertyId);
    try {
      const target=direction==='undo'?entry.before:entry.after;
      const candidate=h3StructureRestore(project,propertyId,target);
      validateStoredProject(candidate);
      const decoded=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
      if(!h3StructureSame(candidate.city,decoded.project.city))
        throw new Error('Structural Undo changed during the portable round trip.');
      return {ok:true,candidate:decoded.project,entry};
    }catch(error){return {ok:false,issues:[{code:'history',message:error.message}]};}
  }
  accept(entry,direction){
    const from=direction==='undo'?this.past:this.future;
    const to=direction==='undo'?this.future:this.past;
    const index=from.indexOf(entry);
    if(index<0)throw new Error('Structural history changed during the operation.');
    from.splice(index,1);to.push(entry);
  }
}
