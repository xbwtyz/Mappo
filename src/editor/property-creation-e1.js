import { pointInPolygon, polygonSignedArea } from '../core/geometry.js';
import { shapeWellFormed, shapeContained, shapesOverlapInterior } from '../core/building-validation.js';
import { rectangleInFrame, PROPERTY_SETBACK, STREET_EDGE_WIDTH, STREET_WIDTHS, propertyFits } from '../core/placement.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

// E1's saved openSpaces are *area totals*, never polygons. Eligible land is
// derived on demand from accepted block boundaries, streets and neighboring
// parcels. No land availability or ownership is inferred from a scalar area.
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const issue = (code,message,id=null) => ({code,message,targetId:id});
const key = (a,b) => [a,b].sort().join(':');
const local = (point,frame) => ({
  u:(point.x-frame.origin.x)*frame.tangent.x+(point.y-frame.origin.y)*frame.tangent.y,
  v:(point.x-frame.origin.x)*frame.inward.x+(point.y-frame.origin.y)*frame.inward.y
});

export function propertyFrontagesE1(city,blockId) {
  const block=city?.blocks?.find(row=>row.id===blockId);
  if(!block)return [];
  const nodes=new Map(city.nodes.map(row=>[row.id,row]));
  const roads=new Map(city.roads.map(row=>[key(row.a,row.b),row]));
  return block.vertices.map((id,i)=>{
    const start=nodes.get(id),end=nodes.get(block.vertices[(i+1)%block.vertices.length]);
    const road=roads.get(key(id,block.vertices[(i+1)%block.vertices.length]));
    if(!start||!end||!road||!Object.hasOwn(STREET_WIDTHS,road.kind))return null;
    const length=Math.hypot(end.x-start.x,end.y-start.y);
    if(length<.001)return null;
    const tangent={x:(end.x-start.x)/length,y:(end.y-start.y)/length};
    return {blockId,roadId:road.id,length,
      frame:{origin:{x:start.x,y:start.y},tangent,
        inward:{x:-tangent.y,y:tangent.x}},
      margin:(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK+.1};
  }).filter(Boolean);
}

function geometry(city,draft){
  const frontage=propertyFrontagesE1(city,draft.blockId).find(row=>row.roadId===draft.roadId);
  if(!frontage)throw Error('The selected block frontage is no longer available.');
  if(![draft.u,draft.width,draft.depth].every(finite)
      || Math.abs(draft.u)>100000 || draft.width<7 || draft.depth<9
      || draft.width>200 || draft.depth>200)
    throw Error('Use finite coordinates, width 7–200 and depth 9–200 map units.');
  const boundary=rectangleInFrame(frontage.frame,draft.u,frontage.margin,draft.width,draft.depth);
  return {frontage,boundary,area:polygonSignedArea(boundary)};
}

export class PropertyCreationSessionE1 {
  constructor(changed=()=>{}) {this.changed=changed;this.active=false;this.draft=null;this.validation=null;}
  enter(){this.active=true;this.draft=null;this.validation=null;this.changed();}
  stop(){this.active=false;this.draft=null;this.validation=null;this.changed();}
  reset(){this.draft=null;this.validation=null;this.changed();}
  update(values){
    if(!this.active||!this.draft)return false;
    const next={...this.draft,...values};
    if(![next.u,next.width,next.depth].every(finite))return false;
    if(next.roadId!==this.draft.roadId){
      const frontage=propertyFrontagesE1(this.city,next.blockId).find(r=>r.roadId===next.roadId);
      if(!frontage)return false;
      next.u=Math.max(0,Math.min(frontage.length-next.width,next.u));
    }
    this.draft=next;this.validation=null;this.changed();return true;
  }
  choose(city,point){
    if(!this.active||!city||!finite(point?.x)||!finite(point?.y))return false;
    const nodes=new Map(city.nodes.map(row=>[row.id,row]));
    const block=city.blocks.find(row=>pointInPolygon(point,row.vertices.map(id=>nodes.get(id))));
    if(!block){this.draft=null;this.validation=null;this.changed();return false;}
    const candidates=propertyFrontagesE1(city,block.id).map(frontage=>{
      const position=local(point,frontage.frame);
      return {frontage,position};
    }).filter(row=>row.position.v>=-1e-6).sort((a,b)=>a.position.v-b.position.v);
    if(!candidates.length){this.draft=null;this.validation=null;this.changed();return false;}
    // Prefer a valid parcel next to the nearest suitable street. If none fits,
    // keep the nearest intent and show *why* Apply is blocked.
    const proposals=candidates.map(({frontage,position})=>({
      blockId:block.id,roadId:frontage.roadId,
      u:Math.max(.5,Math.min(frontage.length-10.5,position.u-5)),
      width:10,depth:12
    }));
    this.city=city;
    this.draft=proposals.find(p=>inspectPropertyCreationE1({city},p).ok)??proposals[0];
    this.validation=null;this.changed();return true;
  }
  preview(city){
    if(!this.active||!this.draft)return null;
    try{return geometry(city,this.draft).boundary;}
    catch{return null;}
  }
}

export function inspectPropertyCreationE1(project,draft){
  const city=project?.city,issues=[];
  if(!city||!draft)return {ok:false,status:'choose',issues:[issue('location','Click open land inside a street block to choose a proposed site.')],preview:null};
  let footprint;
  try{footprint=geometry(city,draft);}
  catch(error){return {ok:false,status:'invalid',issues:[issue('geometry',error.message)],preview:null};}
  const {boundary,frontage,area}=footprint;
  const block=city.blocks.find(row=>row.id===draft.blockId);
  const nodes=new Map(city.nodes.map(row=>[row.id,row]));
  const blockPolygon=block?.vertices.map(id=>nodes.get(id));
  const frontages=propertyFrontagesE1(city,draft.blockId);
  const edgeRoads=frontages.map(row=>({
    a:row.frame.origin,
    b:{x:row.frame.origin.x+row.frame.tangent.x*row.length,y:row.frame.origin.y+row.frame.tangent.y*row.length},
    road:city.roads.find(r=>r.id===row.roadId)
  }));
  if(!block||!blockPolygon?.every(Boolean)||!shapeWellFormed(boundary)
      ||!shapeContained(boundary,blockPolygon)
      ||!propertyFits(boundary,blockPolygon,edgeRoads))
    issues.push(issue('site','This footprint leaves its street block or crosses a required road setback.',draft.blockId));
  if(draft.u<0||draft.u+draft.width>frontage.length+1e-5)
    issues.push(issue('frontage','The frontage extends beyond its selected street edge.',draft.roadId));
  for(const other of city.properties.filter(row=>row.blockId===draft.blockId)){
    if(shapesOverlapInterior(boundary,other.boundary)){
      issues.push(issue('overlap','The proposed property overlaps '+(other.customName||other.id)+'.',other.id));
      break;
    }
  }
  const open=city.openSpaces.find(row=>row.blockId===draft.blockId);
  if(!open||!finite(open.area)||area>open.area+.02)
    issues.push(issue('open-ground','The block does not have enough accounted undeveloped land for this property.',draft.blockId));
  if(!finite(area)||area<60)
    issues.push(issue('area','The new property must have at least 60 square survey units.'));
  return {ok:!issues.length,status:issues.length?'invalid':'valid',issues,
    preview:{...footprint,blockId:draft.blockId,roadId:draft.roadId,u:draft.u,width:draft.width,depth:draft.depth}};
}

function nextId(rows,prefix){
  const existing=new Set(rows.map(r=>r.id));
  let n=1;
  for(const id of existing)if(id.startsWith(prefix)){
    const suffix=id.slice(prefix.length);
    if(/^\d+$/.test(suffix))n=Math.max(n,Number(suffix)+1);
  }
  while(existing.has(prefix+String(n).padStart(5,'0')))n++;
  if(!Number.isSafeInteger(n))throw Error('No safe new record ID remains.');
  return prefix+String(n).padStart(5,'0');
}
function portable(project,workspace){
  validateStoredProject(project);
  const candidate=decodeProjectDocument(encodeProjectDocument(createProjectDocument(project,workspace))).project;
  if(!same(project.city,candidate.city))throw Error('Save/reopen changed accepted city records.');
  return candidate;
}

export function preparePropertyCreationE1(project,workspace,draft){
  const inspection=inspectPropertyCreationE1(project,draft);
  if(!inspection.ok)return {...inspection,candidate:null};
  try {
    const candidate=copyJson(project),city=candidate.city,{preview}=inspection;
    const propertyId=nextId(city.properties,'PROP-'),plotId=nextId(city.plots,'PLOT-');
    const boundary=copyJson(preview.boundary);
    const plot={id:plotId,blockId:draft.blockId,propertyId,frontageRoadId:draft.roadId,
      boundary:copyJson(boundary)};
    const property={id:propertyId,blockId:draft.blockId,plotIds:[plotId],buildingIds:[],
      boundary,frontageRoadId:draft.roadId,frontage:copyJson(boundary.slice(0,2)),
      area:preview.area,usage:'undeveloped',
      frame:copyJson(preview.frontage.frame),
      local:{x:draft.u,y:preview.frontage.margin,width:draft.width,depth:draft.depth},
      roadProvenance:{source:'user-created-e1'}};
    city.plots.push(plot);city.properties.push(property);
    const open=city.openSpaces.find(row=>row.blockId===draft.blockId);
    if(!open)throw Error('The block has no verified open-ground record.');
    const block=city.blocks.find(row=>row.id===draft.blockId);
    open.area=Math.max(0,block.area-city.properties.filter(row=>row.blockId===block.id)
      .reduce((sum,row)=>sum+row.area,0));
    const persisted=portable(candidate,workspace);
    return {ok:true,status:'valid',issues:[],preview,candidate:persisted,propertyId,plotId};
  } catch(error){
    return {...inspection,ok:false,status:'invalid',issues:[issue('project','Property creation rejected: '+error.message)],candidate:null};
  }
}

// One accepted creation is one history step. No history is serialized.
// Another edit invalidates a stale snapshot rather than replaying it blindly.
export class PropertyCreationHistoryE1 {
  constructor(limit=20){this.limit=limit;this.past=[];this.future=[];}
  clear(){this.past=[];this.future=[];}
  record(before,after,id){
    if(same(before.city,after.city))return false;
    this.past.push({before:copyJson(before),after:copyJson(after),id});
    if(this.past.length>this.limit)this.past.shift();
    this.future=[];return true;
  }
  can(direction,project){
    const row=(direction==='undo'?this.past:this.future).at(-1);
    return Boolean(row&&same(project?.city,direction==='undo'?row.after.city:row.before.city));
  }
  prepare(direction,project,workspace){
    const entry=(direction==='undo'?this.past:this.future).at(-1);
    if(!this.can(direction,project))return {ok:false,reason:'Creation history is stale or empty.'};
    try{
      const target=copyJson(direction==='undo'?entry.before:entry.after);
      const safeWorkspace=copyJson(workspace);
      if(safeWorkspace.ui?.selection?.kind==='property' &&
        !target.city.properties.some(p=>p.id===safeWorkspace.ui.selection.id))safeWorkspace.ui.selection=null;
      return {ok:true,candidate:portable(target,safeWorkspace),entry};
    } catch(error){return {ok:false,reason:'Creation history rejected: '+error.message};}
  }
  accept(direction,entry){
    const source=direction==='undo'?this.past:this.future;
    const target=direction==='undo'?this.future:this.past;
    if(source.at(-1)!==entry)return false;
    source.pop();target.push(entry);return true;
  }
}
