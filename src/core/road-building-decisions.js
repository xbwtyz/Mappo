import { distanceToSegment, insideOrOn, segmentCuts } from './boundary.js';
import { buildingFrame, previewBuildingGeometry } from './building-transform.js';
import { shapeContained, shapesOverlapInterior } from './building-validation.js';
import { clipToConvexPolygon } from './placement.js';
import { polygonSignedArea } from './geometry.js';
import { riIndex } from './road-impact-model.js';
import { classifyRoadProvenance, stampRoadGenerated } from './road-provenance.js';
import { writeSimpleBuildingS10 } from './building-project-s10.js';

const ROAD_REHOUSING_LIMIT = 128;

export function roadBuildingOccupiedPlots(building, plots) {
  return plots.filter(plot => Math.abs(polygonSignedArea(clipToConvexPolygon(building.footprint,plot.boundary))) -
    (building.holes ?? []).reduce((sum,hole)=>sum+Math.abs(polygonSignedArea(clipToConvexPolygon(hole,plot.boundary))),0) > 1e-5
  ).map(plot=>plot.id);
}

function roadBuildingPathHits(start,end,footprint) {
  return footprint.some((a,i)=>segmentCuts(start,end,a,footprint[(i+1)%footprint.length]).some(t=>t>1e-6));
}

function roadBuildingAccess(building, a, b, polygon) {
  const entrance = building.entrance;
  if (!entrance) return null;
  const dx=b.x-a.x, dy=b.y-a.y;
  const t=((entrance.x-a.x)*dx+(entrance.y-a.y)*dy)/(dx*dx+dy*dy);
  if (t<=1e-6 || t>=1-1e-6) return null;
  const end={x:a.x+t*dx,y:a.y+t*dy};
  if (distanceToSegment(entrance,a,b)<1e-6 || roadBuildingPathHits(entrance,end,building.footprint)) return null;
  if (polygon.some((point,i)=>segmentCuts(entrance,end,point,polygon[(i+1)%polygon.length])
    .some(cut=>cut>1e-6 && cut<1-1e-6))) return null;
  return [entrance,end];
}

// Decisions are applied only to the detached replacement neighborhood. An
// authored footprint can displace generated infill, never another accepted
// building that the reconciliation retained.
export function placeRoadConflictBuilding(building, choice, development, permittedBlocks, graph, retainedIds) {
  if (!choice || !['fixed','auto','position'].includes(choice.kind)) return null;
  if (choice.kind==='position' && (![choice.x,choice.y,choice.angle].every(Number.isFinite) ||
      Math.abs(choice.x)>10000 || Math.abs(choice.y)>10000 || Math.abs(choice.angle)>Math.PI*2)) return null;
  if (!building.entrance || !Array.isArray(building.footprint)) return null;
  const allowed = new Set(permittedBlocks.map(block=>block.id));
  const plotIndex=riIndex(development.plots), neighbors=riIndex(development.buildings);
  const frame=buildingFrame(building);
  const center=choice.kind==='position' ? {x:choice.x,y:choice.y} : frame;
  const propertyCenter = property => ({
    x:property.boundary.reduce((sum,p)=>sum+p.x,0)/property.boundary.length,
    y:property.boundary.reduce((sum,p)=>sum+p.y,0)/property.boundary.length,
  });
  const blocks=riIndex(permittedBlocks);
  const properties=development.properties.filter(property=>allowed.has(property.blockId) &&
    classifyRoadProvenance(property,property.plotIds.map(id=>plotIndex.get(id)))==='generated')
    .map(property=>({property,center:propertyCenter(property)}))
    .sort((a,b)=>Math.hypot(a.center.x-center.x,a.center.y-center.y)-
      Math.hypot(b.center.x-center.x,b.center.y-center.y) || (a.property.id < b.property.id ? -1 : 1));
  const originals=new Map();
  for (const neighbor of development.buildings) {
    if (!originals.has(neighbor.blockId)) originals.set(neighbor.blockId,[]);
    originals.get(neighbor.blockId).push(neighbor);
  }
  for (const {property,center:parcelCenter} of properties.slice(0,ROAD_REHOUSING_LIMIT)) {
    const frontage=graph.roadsById.get(property.frontageRoadId);
    const a=graph.nodesById.get(frontage?.a), b=graph.nodesById.get(frontage?.b);
    if (!a || !b) continue;
    const align=Math.atan2(property.frame.tangent.y,property.frame.tangent.x)-building.orientation;
    const transforms=choice.kind==='fixed' ? [null] : choice.kind==='position' ?
      [{dx:center.x-frame.x,dy:center.y-frame.y,angle:choice.angle}] :
      [0,align,align+Math.PI].map(angle=>({dx:parcelCenter.x-frame.x,dy:parcelCenter.y-frame.y,angle}));
    const plots=property.plotIds.map(id=>plotIndex.get(id));
    for (const transform of transforms) {
      const moved=transform ? previewBuildingGeometry(building,transform) : {...building};
      if (!shapeContained(moved.footprint,property.boundary)) continue;
      const plotIds=roadBuildingOccupiedPlots(moved,plots);
      if (!plotIds.length) continue;
      const polygon=blocks.get(property.blockId).vertices.map(id=>graph.nodesById.get(id));
      const accessPath=roadBuildingAccess(moved,a,b,polygon);
      if (!accessPath || accessPath.some(p=>!insideOrOn(p,polygon))) continue;

      const owned=property.buildingIds.map(id=>neighbors.get(id));
      const conflicts=owned.filter(other=>shapesOverlapInterior(moved.footprint,other.footprint) ||
        roadBuildingPathHits(...accessPath,other.footprint));
      if (conflicts.some(other=>retainedIds.has(other.id))) continue;
      const displaced=new Set(conflicts.map(other=>other.id));
      if (originals.get(property.blockId)?.some(other=>!displaced.has(other.id) &&
          (roadBuildingPathHits(...accessPath,other.footprint) ||
            (other.accessPath?.length===2 && roadBuildingPathHits(...other.accessPath,moved.footprint))))) continue;

      const proposed={...moved,blockId:property.blockId,districtId:property.districtId,
        propertyId:property.id,frontageRoadId:property.frontageRoadId,plotIds,accessPath};
      const next=building.geometry?writeSimpleBuildingS10(building,proposed):proposed;
      property.buildingIds=property.buildingIds.filter(id=>!displaced.has(id)).concat(next.id);
      stampRoadGenerated(property,plots);
      development.buildings=development.buildings.filter(other=>!displaced.has(other.id));
      development.buildings.push(next);
      retainedIds.add(next.id);
      return next;
    }
  }
  return null;
}
