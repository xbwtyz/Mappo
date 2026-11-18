import { polygonSignedArea, pointInPolygon } from '../core/geometry.js';
import { distanceToSegment, clearance, segmentCuts } from '../core/boundary.js';
import { clipToConvexPolygon } from '../core/placement.js';
import { inspectBuildingGeometry } from '../core/building-validation.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

const EPS = 1e-6;
const area=polygon=>Math.abs(polygonSignedArea(polygon));
const pointAt=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const closest=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return pointAt(a,b,t);
};
const properInside=(p,polygon)=>pointInPolygon(p,polygon)&&clearance(p,polygon)>EPS;

function crossesOccupiedInterior(a,b,polygon) {
  // Endpoint touches and a route starting on its own wall are allowed;
  // crossing the interior of an occupied footprint is not.
  for(const t of [.01,.08,.2,.35,.5,.65,.8,.92,.99])
    if(properInside(pointAt(a,b,t),polygon)) return true;
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length];
    const intersections=segmentCuts(a,b,p,q);
    if(intersections.some(t=>t>EPS&&t<1-EPS)){
      const before=pointAt(a,b,Math.max(0,Math.min(...intersections)-.001));
      const after=pointAt(a,b,Math.min(1,Math.max(...intersections)+.001));
      if(properInside(before,polygon)||properInside(after,polygon)) return true;
    }
  }
  return false;
}

export function deriveOccupiedPlots(city, property, geometry) {
  const own=new Map(city.plots.map(plot=>[plot.id,plot]));
  return property.plotIds.filter(id=>{
    const plot=own.get(id);
    if(!plot) return false;
    const outer=area(clipToConvexPolygon(geometry.footprint,plot.boundary));
    const cutouts=(geometry.holes??[]).reduce((sum,h)=>sum+area(clipToConvexPolygon(h,plot.boundary)),0);
    return outer-cutouts>1e-5;
  });
}

function pathClear(city, building, door, roadPoint) {
  if(Math.hypot(roadPoint.x-door.x,roadPoint.y-door.y)<EPS)return false;
  if(crossesOccupiedInterior(door,roadPoint,building.footprint))return false;
  for(const other of city.buildings){
    if(other.id===building.id)continue;
    if(crossesOccupiedInterior(door,roadPoint,other.footprint))return false;
  }
  for(const property of city.properties) {
    if(property.id===building.propertyId)continue;
    if(crossesOccupiedInterior(door,roadPoint,property.boundary))return false;
  }
  return true;
}

// The old 3G-B preview access line cannot be accepted: its road endpoint moves
// with the building. Rebuild a fresh route to the unchanged frontage road.
export function reattachFrontage(city, building) {
  const road=city.roads.find(item=>item.id===building.frontageRoadId);
  const nodes=new Map(city.nodes.map(item=>[item.id,item]));
  const a=nodes.get(road?.a),b=nodes.get(road?.b);
  if(!road||!a||!b||!building.footprint?.length)return null;
  const candidates=[];
  for(let i=0;i<building.footprint.length;i++){
    const p=building.footprint[i],q=building.footprint[(i+1)%building.footprint.length];
    for(const t of [.5,.25,.75,.1,.9]){
      const door=pointAt(p,q,t),destination=closest(door,a,b);
      if(!pathClear(city,building,door,destination))continue;
      candidates.push({entrance:door,accessPath:[door,destination],distance:Math.hypot(destination.x-door.x,destination.y-door.y)});
    }
  }
  candidates.sort((x,y)=>x.distance-y.distance);
  return candidates[0]??null;
}

// Fast, pure preview check on every pointer frame; no whole-city cloning.
export function inspectBuildingPreview(project, buildingId, transform, quick = false) {
  const preliminary=inspectBuildingGeometry(project?.city,buildingId,transform);
  if(!preliminary.ok)return {...preliminary,status:'invalid'};
  if(quick)return {...preliminary,status:'checking'};
  return prepareBuildingCandidate(project,buildingId,transform);
}

// Full validation happens after gesture completion, numerical changes and
// again immediately before applying (never just from cached preview state).
export function prepareBuildingCandidate(project, buildingId, transform) {
  const base=inspectBuildingGeometry(project?.city,buildingId,transform);
  if(!base.ok)return {...base,status:'invalid',candidate:null};
  const city=project.city,original=city.buildings.find(b=>b.id===buildingId);
  const issues=[];
  const plotIds=deriveOccupiedPlots(city,base.property,base.preview);
  if(!plotIds.length)issues.push({code:'plots',message:'Building no longer occupies a valid plot on its property.'});
  const candidateBuilding={...base.preview,plotIds};
  // Check clearance against transformed building, not the accepted original.
  const accessCity={...city,buildings:city.buildings.map(b=>b.id===buildingId?candidateBuilding:b)};
  const route=reattachFrontage(accessCity,candidateBuilding);
  if(!route)issues.push({code:'access',message:'No unobstructed entrance can connect to the existing frontage road.'});
  else Object.assign(candidateBuilding,route,{frontageRoadId:original.frontageRoadId});
  if(issues.length)return {ok:false,status:'invalid',issues,preview:base.preview,property:base.property,candidate:null};
  // The candidate is a full independent project. Any error below discards it.
  const candidate=copyJson(project);
  const index=candidate.city.buildings.findIndex(b=>b.id===buildingId);
  candidate.city.buildings[index]=copyJson(candidateBuilding);
  try { validateStoredProject(candidate); }
  catch(error) {
    issues.push({code:'schema',message:`Project validation: ${error.message}`});
    return {ok:false,status:'invalid',issues,preview:base.preview,property:base.property,candidate:null};
  }
  return {ok:true,status:'valid',issues:[],preview:base.preview,property:base.property,candidate};
}

export function prepareBuildingApply(project,workspace,buildingId,transform) {
  const result=prepareBuildingCandidate(project,buildingId,transform);
  if(!result.ok)return result;
  try{
    const document=createProjectDocument(result.candidate,workspace);
    const decoded=decodeProjectDocument(encodeProjectDocument(document));
    if(JSON.stringify(decoded.project.city)!==JSON.stringify(result.candidate.city))
      throw new Error('Portable save/load changed the proposed city geometry.');
    return {...result,candidate:decoded.project,document:decoded};
  }catch(error){
    return {...result,ok:false,status:'invalid',candidate:null,issues:[{code:'roundtrip',message:`Project save/load check failed: ${error.message}`}]};
  }
}
