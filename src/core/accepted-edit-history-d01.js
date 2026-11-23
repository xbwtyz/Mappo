// D01: one bounded, session-only history of accepted city transactions.
// Exact snapshots deliberately protect cross-editor metadata and identities.
// Visual-only workspace changes are not transactions.
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { reconcileRoadWorkspace } from '../editor/road-workspace.js';

const d01Same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const d01Bytes=project=>JSON.stringify(project).length*2; // conservative UTF-16 estimate

function d01RecordChanges(before,after,collection) {
  const a=before?.city?.[collection]??[],b=after?.city?.[collection]??[];
  if(d01Same(a,b))return [];
  const initial=new Map(a.map(x=>[x.id,x]));
  return b.filter(x=>!d01Same(initial.get(x.id),x)).map(x=>x.id)
    .concat(a.filter(x=>!b.some(y=>y.id===x.id)).map(x=>x.id));
}
function d01ChangedKeys(a,b) {
  const keys=new Set([...Object.keys(a??{}),...Object.keys(b??{})]);
  return [...keys].filter(key=>!d01Same(a?.[key],b?.[key]));
}
function d01OnlyIdentity(before,after) {
  const cols=['buildings','properties'];
  if(d01ChangedKeys(before.city,after.city).some(x=>!cols.includes(x)))return null;
  let changed=[];
  for(const col of cols) {
    const a=before.city[col],b=after.city[col];
    if(a.length!==b.length)return null;
    for(let i=0;i<a.length;i++) {
      const original=a[i],next=b[i];
      if(original.id!==next.id)return null;
      if(d01Same(original,next))continue;
      const keys=d01ChangedKeys(original,next);
      if(keys.some(k=>!['customName','customUse',...(col==='buildings'?['type']:[])].includes(k)))
        return null;
      changed.push({id:original.id,kind:col==='buildings'?'building':'property',keys});
    }
  }
  return changed.length?changed:null;
}
export function describeAcceptedEditD01(before,after) {
  if(!before?.city||!after?.city||d01Same(before.city,after.city))return null;
  // Rebuilding/importing or an unsupported feature must not be mistaken for
  // an accepted road/property edit merely because city arrays have changed.
  if(before.seed!==after.seed||!d01Same(before.options,after.options)||
      before.schemaVersion!==after.schemaVersion||before.generatorVersion!==after.generatorVersion||
      before.city.id!==after.city.id)
    return {barrier:true,label:'City replacement cleared session history.'};
  const modified=d01ChangedKeys(before.city,after.city);
  const outOfScope=['districtState','districts','fortifications','walls','waterFeatures',
    'terrainFeatures','terrainFaces','waterFaces','survey'];
  // A validated road reflow owns all dependent neighborhood records, including
  // district assignments and face records. Detect the road graph first; a
  // district-only change remains an explicit unsupported history boundary.
  const structuralRoad=modified.some(k=>['nodes','roads','blocks','plaza'].includes(k));
  if(structuralRoad)return {family:'road',operation:'road-reflow',targetIds:d01RecordChanges(before,after,'roads'),
    label:'Edit road and neighborhood'};
  if(modified.some(k=>outOfScope.includes(k)))return {
    barrier:true,label:'An edit outside unified city history cleared session Undo/Redo.'
  };
  const identity=d01OnlyIdentity(before,after);
  if(identity){
    const row=identity[0];
    const label=identity.length>1?'Edit identities':
      row.keys.includes('type')?'Change building use':
      row.keys.includes('customName')?'Rename '+row.kind:'Edit '+row.kind+' identity';
    return {family:'identity',operation:'identity-change',targetIds:identity.map(x=>x.id),label};
  }
  if(modified.some(k=>!['properties','plots','buildings','openSpaces'].includes(k)))return {
    barrier:true,label:'An unsupported accepted change cleared session history.'
  };
  const oldSites=before.city.properties,newSites=after.city.properties;
  const oldBuildings=before.city.buildings,newBuildings=after.city.buildings;
  const plotChanged=!d01Same(before.city.plots,after.city.plots);
  const siteIds=d01RecordChanges(before,after,'properties');
  const buildingIds=d01RecordChanges(before,after,'buildings');
  const propertyDelta=newSites.length-oldSites.length;
  const buildingDelta=newBuildings.length-oldBuildings.length;
  if(propertyDelta!==0)return {family:'property',operation:'property-structure',targetIds:siteIds,
    label:propertyDelta>0?'Create/split property':'Merge/delete property'};
  if(plotChanged||modified.includes('openSpaces'))return {
    family:'property',operation:'property-and-plot',targetIds:siteIds,
    label:'Edit property and plots'
  };
  const compoundsChanged=newSites.some(site=>{
    const original=oldSites.find(x=>x.id===site.id);
    return original&&!d01Same(original.buildingCompounds,site.buildingCompounds);
  });
  if(compoundsChanged) return {family:'compound',operation:'compound-membership',targetIds:siteIds,
    label:'Edit building compound'};
  if(buildingDelta!==0) return {family:'building',operation:'building-structure',targetIds:buildingIds,
    label:buildingDelta>0?'Add buildings':'Remove buildings'};
  const previousAccess = new Map(oldBuildings.filter(b => b.geometry?.version === 2)
    .map(b => [b.id, b.geometry.courtyardAccess]));
  const courtyardAccessChanged = newBuildings.some(building =>
    (building.geometry?.version === 2 || previousAccess.has(building.id)) &&
    !d01Same(previousAccess.get(building.id), building.geometry?.courtyardAccess));
  if(courtyardAccessChanged) return {family:'building',operation:'building-structure',targetIds:buildingIds,
    label:'Edit courtyard access'};
  if(buildingIds.length>1)return {family:'compound',operation:'compound-transform',targetIds:buildingIds,
    label:'Transform building compound'};
  if(buildingIds.length)return {family:'building',operation:'building-geometry',targetIds:buildingIds,
    label:'Edit building footprint'};
  if(siteIds.length)return {family:'property',operation:'property-geometry',targetIds:siteIds,
    label:'Edit property geometry'};
  return {barrier:true,label:'An unrecognized city edit cleared session history.'};
}
export class AcceptedEditHistoryD01 {
  constructor({maxEntries=20,maxBytes=64*1024*1024}={}) {
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>200||
      !Number.isSafeInteger(maxBytes)||maxBytes<1024)
      throw Error('Invalid bounded accepted-history limits.');
    this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.past=[];this.future=[];
    this.serial=0;this.baseline=null;this.notice='Session-only history: no accepted edits yet.';
  }
  get bytes(){return [...this.past,...this.future].reduce((n,x)=>n+x.bytes,0);}
  get length(){return this.past.length+this.future.length;}
  entry(direction){return direction==='undo'?this.past.at(-1):
    direction==='redo'?this.future.at(-1):null;}
  clear(project=null,notice='Accepted history cleared for this city.') {
    this.past=[];this.future=[];this.baseline=project?copyJson(project):null;
    this.notice=notice;
  }
  observe(project,describe=describeAcceptedEditD01) {
    if(!project?.city)return {status:'no-city'};
    if(!this.baseline){this.baseline=copyJson(project);return {status:'baseline'};}
    const before=this.baseline;
    if(d01Same(before.city,project.city)){
      // Mutable non-city settings and visual-only updates do not start a transaction.
      this.baseline=copyJson(project);
      return {status:'unchanged'};
    }
    const receipt=describe(before,project);
    if(!receipt||receipt.barrier){
      this.clear(project,receipt?.label??'Unclassified city change cleared session history.');
      return {status:'barrier',reason:this.notice};
    }
    return this.record(before,project,receipt);
  }
  record(before,after,{family,operation,label,targetIds=[]}={}) {
    if(!before?.city||!after?.city||!family||!label)
      throw Error('A complete accepted-history receipt is required.');
    if(d01Same(before,after)){this.baseline=copyJson(after);return {status:'no-op'};}
    if(this.baseline&&!d01Same(this.baseline,before))
      return {status:'stale',reason:'The accepted city changed before history recording.'};
    const from=copyJson(before),to=copyJson(after);
    const bytes=d01Bytes(from)+d01Bytes(to);
    // The accepted edit itself remains valid even if its history does not fit.
    if(bytes>this.maxBytes) {
      this.clear(after,'Last accepted edit exceeded the session history budget. Undo is unavailable.');
      return {status:'oversize',bytes};
    }
    this.future=[]; // A new accepted edit cuts the redo branch.
    const item={serial:++this.serial,family,operation:operation??family,label,
      targetIds:targetIds.slice(),from,to,bytes};
    this.past.push(item);
    let pruned=0;
    while(this.length>this.maxEntries||this.bytes>this.maxBytes){
      if(this.past.length){this.past.shift();pruned++;}
      else if(this.future.length){this.future.shift();pruned++;}
      else break;
    }
    this.baseline=copyJson(after);
    this.notice=pruned?`History capacity reached: ${pruned} oldest transaction(s) expired.`
      :`Accepted: ${label} · session only.`;
    return {status:'recorded',entry:item,pruned};
  }
  can(direction,project){
    const item=this.entry(direction);
    const expected=direction==='undo'?item?.to:item?.from;
    return Boolean(item&&d01Same(project,expected));
  }
  prepare(direction,project,workspace){
    const item=this.entry(direction);
    if(!item)return {ok:false,reason:'No accepted '+direction+' transaction is available.'};
    if(!this.can(direction,project))
      return {ok:false,reason:'Session history is stale. Undo/Redo cannot overwrite newer city edits.'};
    try{
      const candidate=copyJson(direction==='undo'?item.from:item.to);
      validateStoredProject(candidate);
      let nextWorkspace=copyJson(workspace);
      // Full road transactions may change face, selection and district IDs.
      if(item.family==='road')
        nextWorkspace=reconcileRoadWorkspace(nextWorkspace,project.city,candidate.city);
      const ref=nextWorkspace?.ui?.selection;
      if(ref?.kind==='property'&&!candidate.city.properties.some(p=>p.id===ref.id))
        nextWorkspace.ui.selection=null;
      if(ref?.kind==='building'&&!candidate.city.buildings.some(b=>b.id===ref.id))
        nextWorkspace.ui.selection=null;
      const decoded=decodeProjectDocument(encodeProjectDocument(createProjectDocument(candidate,nextWorkspace)));
      if(!d01Same(decoded.project.city,candidate.city)||
         !d01Same(decoded.workspace,nextWorkspace))
        throw Error('Portable project verification changed the history restore.');
      return {ok:true,candidate:decoded.project,workspace:nextWorkspace,entry:item};
    }catch(error){return {ok:false,reason:'History '+direction+' rejected: '+error.message};}
  }
  accept(direction,item,candidate){
    const from=direction==='undo'?this.past:this.future;
    const into=direction==='undo'?this.future:this.past;
    if(from.at(-1)!==item||!d01Same(candidate,direction==='undo'?item.from:item.to))
      throw Error('History cursor or candidate changed during replay.');
    from.pop();into.push(item);
    this.baseline=copyJson(candidate);
    this.notice=(direction==='undo'?'Undid: ':'Redid: ')+item.label+'.';
  }
  summaries(){
    const rows=[...this.past.map(x=>({...x,direction:'undo'})),
      ...this.future.map(x=>({...x,direction:'redo'}))];
    return rows.sort((a,b)=>a.serial-b.serial).map(x=>({
      serial:x.serial,family:x.family,operation:x.operation,
      label:x.label,targetIds:x.targetIds.slice(),direction:x.direction,bytes:x.bytes
    }));
  }
}
