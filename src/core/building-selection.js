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
    const building = buildings[order], polygon = building.footprint;
    if (!polygon || polygon.length < 3) continue;
    const bounds = boundsOf(polygon);
    if (point.x < bounds.minX - tolerance || point.x > bounds.maxX + tolerance
      || point.y < bounds.minY - tolerance || point.y > bounds.maxY + tolerance) continue;
    if ((building.holes ?? []).some(hole => pointInPolygon(point, hole)
      && buildingEdgeDistance(point, hole) > 1e-7)) continue;
    const distance = buildingEdgeDistance(point, polygon);
    const interior = pointInPolygon(point, polygon) || distance <= 1e-7;
    if (!interior && distance > tolerance) continue;
    const rank = interior ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank
      && (interior || distance <= best.distance))) best = { building, rank, distance };
  }
  return best ? { kind: 'building', id: best.building.id } : null;
}
