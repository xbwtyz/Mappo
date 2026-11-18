import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

// Dev 4a: all parcel deletion and restoration occurs on cloned project data.
// History stays session-only and never enters portable documents.
const d4aCopy = copyJson;
const d4aEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const d4aRows = (records, predicate) => records
  .map((record,index) => ({index,record:d4aCopy(record)}))
  .filter(row => predicate(row.record));
const d4aIndex = (rows) => rows.map(row => row.record.id).sort();
const d4aFail = message => ({ok:false,reason:message,candidate:null});

function d4aSnapshot(project,propertyId) {
  const city=project?.city, index=city?.properties.findIndex(p => p.id===propertyId) ?? -1;
  if(index<0) throw new Error('The selected property no longer exists.');
  const property=d4aCopy(city.properties[index]);
  const plots=d4aRows(city.plots,p=>p.propertyId===propertyId);
  const buildings=d4aRows(city.buildings,b=>b.propertyId===propertyId);
  if(!d4aEqual(d4aIndex(plots),[...property.plotIds].sort())
     || !d4aEqual(d4aIndex(buildings),[...property.buildingIds].sort()))
    throw new Error('Property contents have inconsistent references.');
  const open=city.openSpaces.find(o=>o.blockId===property.blockId)??null;
  return {propertyId,propertyIndex:index,property,plots,buildings,
    openSpaceId:open?.id??null,openArea:open?.area??null};
}

function d4aOpenArea(city, snapshot) {
  if(snapshot.openSpaceId===null) return null;
  const record=city.openSpaces.find(o=>o.id===snapshot.openSpaceId&&o.blockId===snapshot.property.blockId);
  if(!record) throw new Error('The block open-ground record has changed.');
  return record.area;
}

function d4aDeleteCandidate(project,snapshot) {
  const candidate=d4aCopy(project), city=candidate.city, propertyId=snapshot.propertyId;
  const current=d4aSnapshot(project,propertyId);
  if(!d4aEqual(current,snapshot)) throw new Error('Property changed before deletion.');
  city.properties=city.properties.filter(p=>p.id!==propertyId);
  city.plots=city.plots.filter(p=>p.propertyId!==propertyId);
  city.buildings=city.buildings.filter(b=>b.propertyId!==propertyId);
  if(snapshot.openSpaceId!==null){
    const open=city.openSpaces.find(o=>o.id===snapshot.openSpaceId);
    const block=city.blocks.find(b=>b.id===snapshot.property.blockId);
    if(!open||!block) throw new Error('Block open-ground accounting is unavailable.');
    open.area=Math.max(0,block.area-city.properties
      .filter(p=>p.blockId===block.id).reduce((sum,p)=>sum+p.area,0));
  }
  return candidate;
}

function d4aInsert(records,rows) {
  for(const row of [...rows].sort((a,b)=>a.index-b.index))
    records.splice(Math.min(row.index,records.length),0,d4aCopy(row.record));
}

function d4aRestoreCandidate(project,snapshot) {
  const candidate=d4aCopy(project),city=candidate.city;
  if(city.properties.some(p=>p.id===snapshot.propertyId)
      ||snapshot.plots.some(row=>city.plots.some(p=>p.id===row.record.id))
      ||snapshot.buildings.some(row=>city.buildings.some(b=>b.id===row.record.id)))
    throw new Error('Property or child IDs have been reused.');
  city.properties.splice(Math.min(snapshot.propertyIndex,city.properties.length),0,d4aCopy(snapshot.property));
  d4aInsert(city.plots,snapshot.plots);
  d4aInsert(city.buildings,snapshot.buildings);
  if(snapshot.openSpaceId!==null){
    const open=city.openSpaces.find(o=>o.id===snapshot.openSpaceId);
    if(!open) throw new Error('The block open-ground record no longer exists.');
    open.area=snapshot.openArea;
  }
  return candidate;
}

function d4aPortable(candidate,workspace) {
  validateStoredProject(candidate);
  const roundTrip=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,workspace)));
  if(!d4aEqual(roundTrip.project.city,candidate.city))
    throw new Error('Portable project round-trip changed city records.');
  return roundTrip.project;
}

export function preparePropertyDeletion4A(project,workspace,propertyId) {
  try {
    const snapshot=d4aSnapshot(project,propertyId);
    const candidate=d4aPortable(d4aDeleteCandidate(project,snapshot),workspace);
    return {ok:true,candidate,snapshot,removed:{
      propertyId,propertyName:snapshot.property.customName??propertyId,
      plotCount:snapshot.plots.length,buildingCount:snapshot.buildings.length
    }};
  } catch(error) {return d4aFail('Property deletion rejected: '+error.message);}
}

export class PropertyDeletionHistory4A {
  constructor(limit=20) {
    if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Invalid deletion history limit.');
    this.limit=limit;this.past=[];this.future=[];
  }
  clear(){this.past=[];this.future=[];}
  get lastDeleted(){return this.past.at(-1)?.snapshot.propertyId??null;}
  record(before,after,propertyId) {
    const snapshot=d4aSnapshot(before,propertyId);
    if(after.city.properties.some(p=>p.id===propertyId))throw new Error('Property was not deleted.');
    const afterOpenArea=d4aOpenArea(after.city,snapshot);
    this.past.push({snapshot,afterOpenArea});
    this.future=[];
    if(this.past.length>this.limit)this.past.shift();
  }
  entry(direction){return (direction==='undo'?this.past:this.future).at(-1)??null;}
  can(direction,project) {
    if(!project||!['undo','redo'].includes(direction))return false;
    const entry=this.entry(direction);
    if(!entry)return false;
    const snap=entry.snapshot,city=project.city;
    try {
      const actualOpen=d4aOpenArea(city,snap);
      if(actualOpen!==(direction==='undo'?entry.afterOpenArea:snap.openArea))return false;
      if(direction==='undo') {
        return !city.properties.some(p=>p.id===snap.propertyId)
          && !snap.plots.some(row=>city.plots.some(p=>p.id===row.record.id))
          && !snap.buildings.some(row=>city.buildings.some(b=>b.id===row.record.id));
      }
      return d4aEqual(d4aSnapshot(project,snap.propertyId),snap);
    }catch{return false;}
  }
  prepare(project,workspace,direction) {
    if(!this.can(direction,project))return d4aFail('No compatible property deletion to '+direction+'.');
    const entry=this.entry(direction);
    try {
      const candidate=direction==='undo'
        ? d4aRestoreCandidate(project,entry.snapshot)
        : d4aDeleteCandidate(project,entry.snapshot);
      return {ok:true,entry,candidate:d4aPortable(candidate,workspace)};
    }catch(error){return d4aFail('Cannot '+direction+' property deletion: '+error.message);}
  }
  accept(entry,direction) {
    const from=direction==='undo'?this.past:this.future,to=direction==='undo'?this.future:this.past;
    if(from.at(-1)!==entry)throw new Error('Property deletion history changed.');
    from.pop();to.push(entry);
    if(to.length>this.limit)to.shift();
  }
}
