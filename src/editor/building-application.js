import { buildingExteriorRingsS10 } from '../core/building-geometry-adapter-s10.js';
import { buildingFrame, transformBuildingPoint } from '../core/building-transform.js';
import { findCourtyardAccess, resolveCourtyardAccess, rerouteCourtyardOccupants } from '../core/courtyard-access.js';
import { polygonSignedArea, pointInPolygon, roadFrameLength } from '../core/geometry.js';
import { distanceToSegment, clearance, segmentCuts } from '../core/boundary.js';
import { clipToConvexPolygon, PROPERTY_SETBACK, STREET_WIDTHS, STREET_EDGE_WIDTH } from '../core/placement.js';
import { classifyRoad } from '../core/road-graph.js';
import { inspectBuildingGeometry } from '../core/building-validation.js';
import { copyJson, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../data/project-format.js';
import { validateStoredProject } from '../data/project-validation.js';
import { occupiedPlotAreaS10 } from '../core/building-occupancy-s10.js';
import { writeSimpleBuildingS10 } from '../core/building-project-s10.js';

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
    if(geometry.geometry) return occupiedPlotAreaS10(geometry.geometry,plot.boundary)>1e-5;
    const outer=b3gcPlotArea(clipToConvexPolygon(geometry.footprint,plot.boundary));
    const cutouts=(geometry.holes??[]).reduce((sum,h)=>sum+b3gcPlotArea(clipToConvexPolygon(h,plot.boundary)),0);
    return outer-cutouts>1e-5;
  });
}

function b3gcRoutingRoofs(building) {
  const roots = building.geometry?.regions?.filter(r => r.parentId === null);
  return roots?.length > 1 ? roots.map(r => r.ring) : buildingExteriorRingsS10(building);
}

function b3gcRouteBlocker(city, building, door, roadPoint, spend = null) {
  const crosses = ring => {
    if(spend){
      spend(Math.max(1,ring.length));
      const minX=Math.min(door.x,roadPoint.x),maxX=Math.max(door.x,roadPoint.x),
        minY=Math.min(door.y,roadPoint.y),maxY=Math.max(door.y,roadPoint.y);
      if(ring.every(p=>p.x<minX)||ring.every(p=>p.x>maxX)||
         ring.every(p=>p.y<minY)||ring.every(p=>p.y>maxY))return false;
      spend(Math.max(1,4*ring.length*ring.length));
    }
    return b3gcRouteCrossesInterior(door, roadPoint, ring);
  };
  if (Math.hypot(roadPoint.x-door.x,roadPoint.y-door.y) < B3GC_ACCESS_EPS ||
      b3gcRoutingRoofs(building).some(crosses)) return building;
  for (const other of city.buildings) {
    if (other.id !== building.id && b3gcRoutingRoofs(other).some(crosses)) return other;
  }
  for(const property of city.properties) {
    if(property.id===building.propertyId)continue;
    if(b3gcRouteCrossesInterior(door,roadPoint,property.boundary))return property;
  }
  return null;
}

function searchBuildingFrontage(city, building, a, b, allowDiagonal = false, frontage = null, blocked = null, spend = null) {
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
        const distance=(spend?roadFrameLength:Math.hypot)(destination.x-door.x,destination.y-door.y);
        if(best&&distance>=best.distance)continue;
        if(frontage && !segmentCuts(door,destination,frontage.edgeA,frontage.edgeB)
          .some(cut=>cut>B3GC_ACCESS_EPS&&cut<1-B3GC_ACCESS_EPS))continue;
        if(spend)spend();
        const obstacle=b3gcRouteBlocker(city,building,door,destination,spend);
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

function retainedBuildingFrontage(city, original, candidate, spend = null) {
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
  if (!path.slice(1).every((point, i) => !b3gcRouteBlocker(city, candidate, path[i], point, spend))) return null;
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
  const passage = findCourtyardAccess(city, candidate.id);
  if (passage) return resolveCourtyardAccess(city, candidate, passage);
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

// Strict B1R adapter: share the existing collision/entrance search, but
// never explore a side road, never change ownership, and charge shared work.
// Courtyard-linked occupants are deliberately handled by their own validator.
export function resolveSameFrontageAccessB1R(city, candidate, {allowRepair=false,allowEntranceMove=false,spend}={}) {
  if(typeof spend!=='function')throw Error('Shared route budget required.');
  spend(Math.max(1,city.buildings.length+city.properties.length+city.roads.length+city.nodes.length));
  if(findCourtyardAccess(city,candidate.id)||candidate.geometry?.courtyardAccess)
    return {route:null,code:'courtyard-dependency'};
  if(!candidate.footprint?.length)return {route:null,code:'unsupported-primary-route'};
  const retained=retainedBuildingFrontage(city,candidate,candidate,spend);
  if(retained)return {route:retained,changed:false};
  if(!allowRepair)return {route:null,code:'access-decision-required'};
  const road=city.roads.find(r=>r.id===candidate.frontageRoadId);
  const a=city.nodes.find(n=>n.id===road?.a),b=city.nodes.find(n=>n.id===road?.b);
  if(!a||!b||Math.hypot(b.x-a.x,b.y-a.y)<B3GC_ACCESS_EPS)
    return {route:null,code:'access-frontage-missing'};
  const door=candidate.entrance;
  if(door&&candidate.footprint.some((p,i,ring)=>distanceToSegment(door,p,ring[(i+1)%ring.length])<=B3GC_ACCESS_EPS)){
    const ends=[b3gcNearestRoadPoint(door,a,b),...[.125,.25,.375,.5,.625,.75,.875].map(t=>b3gcPathPoint(a,b,t))];
    // Fixed length arithmetic prevents engine-specific last-bit distances
    // from reversing a tie between the projection and a sampled street point.
    const sorted=ends.map((p,i)=>({p,i,d:roadFrameLength(p.x-door.x,p.y-door.y)})).sort((x,y)=>x.d-y.d||x.i-y.i);
    for(const {p} of sorted){spend();
      if(!b3gcRouteBlocker(city,candidate,door,p,spend))
        return {route:{entrance:{...door},accessPath:[{...door},p],frontageRoadId:road.id},changed:true};
    }
  }
  if(allowEntranceMove){
    const route=searchBuildingFrontage(city,candidate,a,b,false,null,null,spend)
      ??searchBuildingFrontage(city,candidate,a,b,true,null,null,spend);
    if(route)return {route:{...route,frontageRoadId:road.id},changed:true};
  }
  return {route:null,code:'access-reflow-blocked'};
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
  const city = project.city;
  const original = city.buildings.find(b => b.id === buildingId);
  const rejected = issue => ({...base, ok: false, status: 'invalid', issues: [issue], candidate: null});
  try {
    const frame = original.geometry?.version === 2 && !draft ? buildingFrame(original) : null;
    const map = frame ? point => transformBuildingPoint(point, frame, transform) : undefined;
    const updated = original.geometry
      ? writeSimpleBuildingS10(original, base.preview, map) : copyJson(base.preview);
    // The preview carries the original canonical rings alongside its moved
    // outline. Derive plot references only after writing the candidate rings.
    updated.plotIds = deriveOccupiedPlots(city, base.property, updated);
    if (!updated.plotIds.length) return rejected({code: 'plots', targetId: base.property.id,
      message: 'Building no longer occupies a valid plot on its property.'});

    const candidate = copyJson(project);
    const index = candidate.city.buildings.findIndex(b => b.id === buildingId);
    candidate.city.buildings[index] = updated;
    const access = resolveBuildingAccess(candidate.city, original, updated);
    if (!access.route) return rejected(access.issue);
    const {entrance, accessPath, frontageRoadId} = access.route;
    Object.assign(updated, {entrance, accessPath, frontageRoadId});
    const courtyardRoutesChanged = updated.geometry?.version === 2
      ? rerouteCourtyardOccupants(candidate.city, updated) : [];
    validateStoredProject(candidate);
    return {...base, status: 'valid', candidate, courtyardRoutesChanged,
      accessChanged: access.changed, frontageChanged: updated.frontageRoadId !== original.frontageRoadId};
  } catch (error) {
    return rejected({code: 'schema', message: `Project validation: ${error.message}`});
  }
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
