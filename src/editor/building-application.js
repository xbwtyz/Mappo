import { polygonSignedArea, pointInPolygon } from '../core/geometry.js';
import { distanceToSegment, clearance, segmentCuts } from '../core/boundary.js';
import { clipToConvexPolygon, PROPERTY_SETBACK, STREET_WIDTHS, STREET_EDGE_WIDTH } from '../core/placement.js';
import { classifyRoad } from '../core/road-graph.js';
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
  const cuts=[0,1];
  for(let i=0;i<polygon.length;i++)
    cuts.push(...segmentCuts(a,b,polygon[i],polygon[(i+1)%polygon.length]));
  cuts.sort((x,y)=>x-y);
  for(let i=1;i<cuts.length;i++)
    if(cuts[i]>cuts[i-1]&&b3gcAccessInside(b3gcPathPoint(a,b,(cuts[i]+cuts[i-1])/2),polygon))return true;
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

function b3gcRouteBlocker(city, building, door, roadPoint) {
  if(Math.hypot(roadPoint.x-door.x,roadPoint.y-door.y)<B3GC_ACCESS_EPS ||
      b3gcRouteCrossesInterior(door,roadPoint,building.footprint))return building;
  for(const other of city.buildings){
    if(other.id===building.id)continue;
    if(b3gcRouteCrossesInterior(door,roadPoint,other.footprint))return other;
  }
  for(const property of city.properties) {
    if(property.id===building.propertyId)continue;
    if(b3gcRouteCrossesInterior(door,roadPoint,property.boundary))return property;
  }
  return null;
}

function searchBuildingFrontage(city, building, a, b, allowDiagonal = false, frontage = null, blocked = null) {
  if(!a||!b||!building.footprint?.length)return null;
  let best=null;
  for(let i=0;i<building.footprint.length;i++){
    const p=building.footprint[i],q=building.footprint[(i+1)%building.footprint.length];
    for(const t of [.5,.25,.75,.1,.9]){
      const door=b3gcPathPoint(p,q,t);
      const start=frontage?.start??a,end=frontage?.end??b;
      const destinations=allowDiagonal
        ? [.125,.25,.375,.5,.625,.75,.875].map(fraction=>b3gcPathPoint(start,end,fraction))
        : [b3gcNearestRoadPoint(door,start,end)];
      for(const destination of destinations){
        const distance=Math.hypot(destination.x-door.x,destination.y-door.y);
        if(best&&distance>=best.distance)continue;
        if(frontage && !segmentCuts(door,destination,frontage.edgeA,frontage.edgeB)
          .some(cut=>cut>B3GC_ACCESS_EPS&&cut<1-B3GC_ACCESS_EPS))continue;
        const obstacle=b3gcRouteBlocker(city,building,door,destination);
        if(obstacle){
          if(blocked&&obstacle!==building)blocked.set(obstacle.id,(blocked.get(obstacle.id)??0)+1);
          continue;
        }
        best={entrance:door,accessPath:[door,destination],distance};
      }
    }
  }
  return best;
}

// Existing callers use a direct connection to the specified frontage road.
export function reattachFrontage(city, building) {
  const road=city.roads.find(item=>item.id===building.frontageRoadId);
  const nodes=new Map(city.nodes.map(item=>[item.id,item]));
  return searchBuildingFrontage(city,building,nodes.get(road?.a),nodes.get(road?.b));
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
  if (!path.slice(1).every((point, i) => !b3gcRouteBlocker(city, candidate, path[i], point))) return null;
  return { entrance: door, accessPath: path, frontageRoadId: original.frontageRoadId };
}

// A side street must bound the accepted block and overlap a parcel edge along
// the street setback. Prior merge records can narrow the proven span but cannot
// establish access if the edge no longer exists.
function cornerBuildingFrontages(city, property, roads, nodes) {
  const block=city.blocks?.find(item=>item.id===property?.blockId);
  if(!block||!property.boundary?.length)return [];
  const blockEdges=new Set(block.vertices.map((id,i)=>[id,block.vertices[(i+1)%block.vertices.length]].sort().join(':')));
  const retired=Array.isArray(property.propertyMergeHistoryE3)
    ? property.propertyMergeHistoryE3.map(row=>row?.retiredRecord).filter(Boolean) : [];
  const candidates=[];
  for(const [id,road] of roads){
    if(!blockEdges.has([road.a,road.b].sort().join(':')) ||
        !Object.hasOwn(STREET_WIDTHS,road.kind)||classifyRoad(road).protected)continue;
    const a=nodes.get(road.a),b=nodes.get(road.b);
    if(!a||!b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    if(length<B3GC_ACCESS_EPS)continue;
    const along=p=>((p.x-a.x)*dx+(p.y-a.y)*dy)/length;
    const offset=p=>((p.y-a.y)*dx-(p.x-a.x)*dy)/length;
    const margin=(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
    for(let i=0;i<property.boundary.length;i++){
      const edgeA=property.boundary[i],edgeB=property.boundary[(i+1)%property.boundary.length];
      const distance=offset(edgeA);
      if(Math.abs(distance-offset(edgeB))>1e-4 || Math.abs(distance)<margin-1e-4)continue;
      const first=Math.max(0,Math.min(along(edgeA),along(edgeB)));
      const last=Math.min(length,Math.max(along(edgeA),along(edgeB)));
      if(Math.abs(distance)>margin+.11){
        const recorded=retired.filter(row=>row.frontageRoadId===id&&Array.isArray(row.frontage)&&row.frontage.length===2
          &&row.frontage.every(p=>p&&Math.abs(offset(p)-distance)<1e-4));
        for(const record of recorded){
          const coords=record.frontage.map(along);
          const from=Math.max(first,Math.min(...coords)),to=Math.min(last,Math.max(...coords));
          if(to-from>=7)candidates.push({id,a,b,edgeA,edgeB,start:b3gcPathPoint(a,b,from/length),end:b3gcPathPoint(a,b,to/length)});
        }
      }else if(last-first>=7){
        candidates.push({id,a,b,edgeA,edgeB,start:b3gcPathPoint(a,b,first/length),end:b3gcPathPoint(a,b,last/length)});
      }
    }
  }
  return candidates.sort((a,b)=>a.id.localeCompare(b.id));
}

export function resolveBuildingAccess(city, original, candidate) {
  const existing=retainedBuildingFrontage(city,original,candidate);
  if(existing)return {route:existing,changed:false};
  const roads=new Map(city.roads.map(road=>[road.id,road]));
  const nodes=new Map(city.nodes.map(node=>[node.id,node]));
  const current=roads.get(original.frontageRoadId);
  const a=nodes.get(current?.a),b=nodes.get(current?.b),blocked=new Map();
  const direct=searchBuildingFrontage(city,candidate,a,b,false,null,blocked)
    ??searchBuildingFrontage(city,candidate,a,b,true,null,blocked);
  if(direct)return {route:{...direct,frontageRoadId:current.id},changed:true};

  const property=city.properties.find(row=>row.id===candidate.propertyId);
  for(const frontage of cornerBuildingFrontages(city,property,roads,nodes)){
    if(frontage.id===original.frontageRoadId)continue;
    const route=searchBuildingFrontage(city,candidate,frontage.a,frontage.b,false,frontage,blocked)
      ??searchBuildingFrontage(city,candidate,frontage.a,frontage.b,true,frontage,blocked);
    if(route)return {route:{...route,frontageRoadId:frontage.id},changed:true};
  }
  return {route:null,issue:{code:'access',targetId:original.frontageRoadId,
    blockerId:[...blocked].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0],
    message:'No clear route found to the current street or a verified side street.'}};
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
  const access=resolveBuildingAccess(accessCity,original,candidateBuilding);
  if(!access.route)issues.push(access.issue);
  else {
    const {entrance,accessPath,frontageRoadId}=access.route;
    Object.assign(candidateBuilding,{entrance,accessPath,frontageRoadId});
  }
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
    accessChanged: access.changed, frontageChanged: candidateBuilding.frontageRoadId!==original.frontageRoadId};
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
