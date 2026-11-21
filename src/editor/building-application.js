import { polygonSignedArea, pointInPolygon } from '../core/geometry.js';
import { distanceToSegment, clearance, segmentCuts } from '../core/boundary.js';
import { clipToConvexPolygon } from '../core/placement.js';
import { inspectBuildingGeometry } from '../core/building-validation.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';

const B3GC_ACCESS_EPS = 1e-6;
const b3gcPlotArea=polygon=>Math.abs(polygonSignedArea(polygon));
const b3gcPathPoint=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const b3gcNearestRoadPoint=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return b3gcPathPoint(a,b,t);
};
const b3gcAccessInside=(p,polygon)=>pointInPolygon(p,polygon)&&clearance(p,polygon)>B3GC_ACCESS_EPS;

function b3gcRouteCrossesInterior(a,b,polygon) {
  // Endpoint touches and a route starting on its own wall are allowed;
  // crossing the interior of an occupied footprint is not.
  for(const t of [.01,.08,.2,.35,.5,.65,.8,.92,.99])
    if(b3gcAccessInside(b3gcPathPoint(a,b,t),polygon)) return true;
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length];
    const intersections=segmentCuts(a,b,p,q);
    if(intersections.some(t=>t>B3GC_ACCESS_EPS&&t<1-B3GC_ACCESS_EPS)){
      const before=b3gcPathPoint(a,b,Math.max(0,Math.min(...intersections)-.001));
      const after=b3gcPathPoint(a,b,Math.min(1,Math.max(...intersections)+.001));
      if(b3gcAccessInside(before,polygon)||b3gcAccessInside(after,polygon)) return true;
    }
  }
  return false;
}

export function deriveOccupiedPlots(city, property, geometry) {
  const own=new Map(city.plots.map(plot=>[plot.id,plot]));
  return property.plotIds.filter(id=>{
    const plot=own.get(id);
    if(!plot) return false;
    const outer=b3gcPlotArea(clipToConvexPolygon(geometry.footprint,plot.boundary));
    const cutouts=(geometry.holes??[]).reduce((sum,h)=>sum+b3gcPlotArea(clipToConvexPolygon(h,plot.boundary)),0);
    return outer-cutouts>1e-5;
  });
}

function b3gcRouteClear(city, building, door, roadPoint) {
  if(Math.hypot(roadPoint.x-door.x,roadPoint.y-door.y)<B3GC_ACCESS_EPS)return false;
  if(b3gcRouteCrossesInterior(door,roadPoint,building.footprint))return false;
  for(const other of city.buildings){
    if(other.id===building.id)continue;
    if(b3gcRouteCrossesInterior(door,roadPoint,other.footprint))return false;
  }
  for(const property of city.properties) {
    if(property.id===building.propertyId)continue;
    if(b3gcRouteCrossesInterior(door,roadPoint,property.boundary))return false;
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
      const door=b3gcPathPoint(p,q,t),destination=b3gcNearestRoadPoint(door,a,b);
      if(!b3gcRouteClear(city,building,door,destination))continue;
      candidates.push({entrance:door,accessPath:[door,destination],distance:Math.hypot(destination.x-door.x,destination.y-door.y)});
    }
  }
  candidates.sort((x,y)=>x.distance-y.distance);
  return candidates[0]??null;
}

function retainedBuildingFrontage(city, original, candidate) {
  const door = original.entrance;
  const path = original.accessPath;
  if (!door || !path || path.length < 2) return null;
  const onWall = candidate.footprint.some((point, index, ring) =>
    distanceToSegment(door, point, ring[(index + 1) % ring.length]) <= B3GC_ACCESS_EPS);
  const road = city.roads.find(item => item.id === original.frontageRoadId);
  const a = city.nodes.find(node => node.id === road?.a);
  const b = city.nodes.find(node => node.id === road?.b);
  if (!onWall || !a || !b ||
      Math.hypot(path[0].x - door.x, path[0].y - door.y) > B3GC_ACCESS_EPS ||
      distanceToSegment(path.at(-1), a, b) > B3GC_ACCESS_EPS) return null;
  if (!path.slice(1).every((point, i) => b3gcRouteClear(city, candidate, path[i], point))) return null;
  return { entrance: door, accessPath: path };
}

// Fast, pure preview check on every pointer frame; no whole-city cloning.
export function inspectBuildingPreview(project, buildingId, transform, quick = false, draft = null) {
  if (!quick) return prepareBuildingCandidate(project, buildingId, transform, draft);
  const preliminary = inspectBuildingGeometry(project?.city, buildingId, transform, draft);
  return { ...preliminary, status: preliminary.ok ? 'checking' : 'invalid' };
}

// Full validation happens after gesture completion, numerical changes and
// again immediately before applying (never just from cached preview state).
export function prepareBuildingCandidate(project, buildingId, transform, draft = null) {
  const base=inspectBuildingGeometry(project?.city,buildingId,transform,draft);
  if(!base.ok)return {...base,status:'invalid',candidate:null};
  const city=project.city,original=city.buildings.find(b=>b.id===buildingId);
  const issues=[];
  const plotIds=deriveOccupiedPlots(city,base.property,base.preview);
  if(!plotIds.length)issues.push({code:'plots',targetId:base.property?.id,message:'Building no longer occupies a valid plot on its property.'});
  const candidateBuilding={...base.preview,plotIds};
  // Check clearance against transformed building, not the accepted original.
  const accessCity={...city,buildings:city.buildings.map(b=>b.id===buildingId?candidateBuilding:b)};
  const existingRoute = draft && retainedBuildingFrontage(accessCity, original, candidateBuilding);
  const route = existingRoute || reattachFrontage(accessCity,candidateBuilding);
  if(!route)issues.push({code:'access',targetId:original.frontageRoadId,message:'No unobstructed entrance can connect to the existing frontage road.'});
  else Object.assign(candidateBuilding,{entrance:route.entrance,accessPath:route.accessPath,frontageRoadId:original.frontageRoadId});
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
  return {ok:true,status:'valid',issues:[],preview:base.preview,property:base.property,candidate,
    accessChanged: Boolean(draft && !existingRoute)};
}

export function prepareBuildingApply(project,workspace,buildingId,transform,draft = null) {
  const result=prepareBuildingCandidate(project,buildingId,transform,draft);
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
