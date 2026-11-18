import { boundsOf, pointInPolygon } from './geometry.js';
import { distanceToSegment } from './boundary.js';

// Roofs, property boundaries and plots all provide visible land-use context.
// Selection feedback reveals the property boundary even when its layer is off.
export function propertySelectionVisible(layers = {}) {
  return layers.buildings !== false || layers.properties === true || layers.plots === true;
}

export function hitProperty(point, properties = [], zoom = 1, layers = {}) {
  if (!point || !propertySelectionVisible(layers)) return null;
  const tolerance = 3 / Math.max(.18, zoom);
  let best = null;
  for (const property of properties) {
    const polygon = property.boundary;
    if (!polygon || polygon.length < 3) continue;
    const bounds = boundsOf(polygon);
    if (point.x < bounds.minX - tolerance || point.x > bounds.maxX + tolerance
      || point.y < bounds.minY - tolerance || point.y > bounds.maxY + tolerance) continue;
    let distance = Infinity;
    for (let i = 0; i < polygon.length; i++)
      distance = Math.min(distance, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
    const interior = pointInPolygon(point, polygon) || distance <= 1e-7;
    if (!interior && distance > tolerance) continue;
    const rank = interior ? 0 : 1;
    // Interiors outrank nearby edges; equal hits follow boundary paint order.
    if (!best || rank < best.rank || (rank === best.rank && (interior || distance <= best.distance)))
      best = { property, rank, distance };
  }
  return best ? { kind: 'property', id: best.property.id } : null;
}

export function buildingsOnProperty(city, property) {
  const ids = new Set(property.buildingIds ?? []);
  return (city?.buildings ?? []).filter(building => ids.has(building.id) && building.propertyId === property.id);
}
