import {
  waterFeaturePolygon,
  waterLineIntervals,
  waterDistance,
  WATER_BANK
} from './water-geometry.js';
import {
  measureWall,
  wallPoint
} from './fortification-geometry.js';
import {
  segmentDistance
} from './placement.js';

export function waterWallOpenings(wall, features, polygonBuilder = waterFeaturePolygon) {
  const measure = measureWall(wall.path),
    cuts = [];
  for (const f of features ?? []) {
    const corridor = polygonBuilder(f, WATER_BANK + 10);
    for (let i = 0; i < wall.path.length; i++)
      for (const s of waterLineIntervals(wall.path[i], wall.path[(i + 1) % wall.path.length], corridor)) {
        if (!s.inside) continue;
        const start = measure.distances[i] + Math.hypot(s.a.x - wall.path[i].x, s.a.y - wall.path[i].y),
          end = start + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
        cuts.push({
          start,
          end,
          waterId: f.id
        });
      }
  }
  cuts.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const c of cuts) {
    if (merged.length && c.start - merged.at(-1).end < 1e-5 && c.waterId === merged.at(-1).waterId) merged.at(-1).end = c.end;
    else merged.push({
      ...c
    });
  }
  if ((features ?? []).length <= 1) return merged;
  const union = [];
  for (const c of cuts) {
    const last = union.at(-1);
    if (last && c.start <= last.end + 1e-5) {
      last.end = Math.max(last.end, c.end);
      last.waterIds = [...new Set([...last.waterIds, c.waterId])].sort();
    } else union.push({
      start: c.start,
      end: c.end,
      waterIds: [c.waterId]
    });
  }
  return union;
}
export function waterGateIsDry(gate, features, measure, polygonBuilder = waterFeaturePolygon) {
  for (const f of features ?? []) {
    const polygon = polygonBuilder(f, WATER_BANK + 12),
      points = gate.connection.points;
    if (points.some(p => waterDistance(p, polygon) < 8)) return false;
    for (let i = 1; i < points.length; i++)
      for (let j = 0; j < polygon.length; j++)
        if (segmentDistance(points[i - 1], points[i], polygon[j], polygon[(j + 1) % polygon.length]) < 8) return false;
    for (const arc of [gate.arc - gate.opening / 2 - gate.postRadius, gate.arc + gate.opening / 2 + gate.postRadius])
      if (waterDistance(wallPoint(measure, arc), polygon) < gate.postRadius + 1) return false;
  }
  return true;
}
