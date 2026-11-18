import {
  pointInPolygon,
  polygonSignedArea
} from './geometry.js';
import {
  distanceToSegment
} from './boundary.js';
import {
  waterFeaturePolygon
} from './water-geometry.js';

export function landscapeRecords(water = [], terrain = []) {
  return [...water.map(feature => ({
      kind: 'water',
      id: feature.id,
      feature
    })),
    ...terrain.map(feature => ({
      kind: 'terrain',
      id: feature.id,
      feature
    }))
  ];
}
export function landscapeLabel(record) {
  const type = record.kind === 'terrain' ? 'Mountain range' : record.feature.kind === 'coast' ? 'Coastline' : record.feature.kind === 'lake' ? 'Lake' : 'River';
  return {
    type,
    name: record.feature.name || (['river', 'coast'].includes(record.feature.kind) ? type : `${type} · ${record.id}`)
  };
}
export function landscapePolygon(record) {
  return record.kind === 'water' ? waterFeaturePolygon(record.feature) : record.feature.path;
}
// Screen-sized edge tolerance makes small features usable at every zoom. Edges
// beat interiors; then distance, smaller footprint, and stable ID break ties.
export function hitLandscape(point, records, zoom = 1) {
  if (!point) return null;
  const tolerance = 8 / Math.max(.18, zoom),
    candidates = [];
  for (const record of records) {
    try {
      const polygon = landscapePolygon(record),
        path = record.feature.kind === 'coast' ? record.feature.path : polygon;
      const closed = record.feature.kind !== 'coast';
      let distance = Infinity;
      for (let i = 1; i < path.length; i++) distance = Math.min(distance, distanceToSegment(point, path[i - 1], path[i]));
      if (closed && path.length > 2) distance = Math.min(distance, distanceToSegment(point, path.at(-1), path[0]));
      if (distance <= tolerance || pointInPolygon(point, polygon)) candidates.push({
        record,
        edge: distance <= tolerance ? 0 : 1,
        distance,
        area: Math.abs(polygonSignedArea(polygon))
      });
    } catch {
      /* An invalid legacy draft is still selectable from the list. */
    }
  }
  candidates.sort((a, b) => a.edge - b.edge || (a.edge === 0 ? a.distance - b.distance : 0) || a.area - b.area || `${a.record.kind}:${a.record.id}`.localeCompare(`${b.record.kind}:${b.record.id}`));
  const hit = candidates[0]?.record;
  return hit ? {
    kind: hit.kind,
    id: hit.id
  } : null;
}
