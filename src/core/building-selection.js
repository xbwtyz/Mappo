import { pointInPolygon, boundsOf } from './geometry.js';
import { distanceToSegment } from './boundary.js';

function buildingEdgeDistance(point, polygon) {
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i++)
    distance = Math.min(distance, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
  return distance;
}

// Roof interiors beat tolerant outer edges. Equal hits follow the renderer's
// paint order (last roof wins), so overlap selection is repeatable and visible.
// Courtyard interiors never become hits, even near a courtyard wall.
export function hitBuilding(point, buildings = [], zoom = 1, layers = {}) {
  if (!point || layers.buildings === false) return null;
  const tolerance = 3 / Math.max(.18, zoom);
  let best = null;
  for (let order = 0; order < buildings.length; order++) {
    const building = buildings[order];
    const regions=building.geometry?.regions;
    // Disconnected roots and nested solid islands both have selectable roof
    // occupancy; independent courtyard occupants remain separate buildings.
    const solids=regions?.length
      ?regions.filter(region=>region.kind==='solid').map(region=>region.ring)
      :[building.footprint];
    if (!solids.length || solids.some(ring=>!Array.isArray(ring)||ring.length<3)) continue;
    const boxes=solids.map(boundsOf);
    const bounds={minX:Math.min(...boxes.map(b=>b.minX)),maxX:Math.max(...boxes.map(b=>b.maxX)),
      minY:Math.min(...boxes.map(b=>b.minY)),maxY:Math.max(...boxes.map(b=>b.maxY))};
    if (point.x < bounds.minX - tolerance || point.x > bounds.maxX + tolerance
      || point.y < bounds.minY - tolerance || point.y > bounds.maxY + tolerance) continue;
    if(regions?.length){
      // Deepest containing region decides whether this point is roof or void.
      // A distinct independent courtyard occupant remains a separate building.
      const byId=new Map(regions.map(region=>[region.id,region]));
      const depth=region=>{
        let n=0,cur=region;
        while(cur.parentId!==null){n++;cur=byId.get(cur.parentId);if(!cur)break;}
        return n;
      };
      const contained=regions.filter(region=>pointInPolygon(point,region.ring))
        .sort((a,b)=>depth(b)-depth(a));
      if(contained[0]?.kind==='void' && buildingEdgeDistance(point,contained[0].ring)>1e-7)
        continue;
    } else if ((building.holes ?? []).some(hole => pointInPolygon(point, hole)
      && buildingEdgeDistance(point, hole) > 1e-7)) continue;
    const distance=Math.min(...solids.map(ring=>buildingEdgeDistance(point,ring)));
    // Earlier void containment has already excluded points in the open
    // courtyard unless they belong to a deeper solid island.
    const interior=(regions?.length
      ?regions.filter(region=>pointInPolygon(point,region.ring)).some(region=>region.kind==='solid')
      :solids.some(ring=>pointInPolygon(point,ring))) || distance <= 1e-7;
    if (!interior && distance > tolerance) continue;
    const rank = interior ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank
      && (interior || distance <= best.distance))) best = { building, rank, distance };
  }
  return best ? { kind: 'building', id: best.building.id } : null;
}
