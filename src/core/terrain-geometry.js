import {
  lakePolygon,
  lakeSimpleRing,
  lakeAccessSegments
} from './lake-geometry.js';
import {
  pointInPolygon,
  boundsOf
} from './geometry.js';
import {
  distanceToSegment,
  insideOrOn,
  lerpPoint
} from './boundary.js';
import {
  segmentDistance
} from './placement.js';
import {
  waterPolygonsOverlap,
  waterLineIntervals
} from './water-geometry.js';
export const TERRAIN_LIMIT = 6;
export const TERRAIN_HISTORY_LIMIT = 20;
export function terrainPolygon(feature, margin = 0) {
  return lakePolygon(feature, margin);
}
export function terrainCopy(value) {
  return JSON.parse(JSON.stringify(value));
}
export function terrainPrepare(definition = {}) {
  return {
    features: terrainCopy(definition.features ?? []).map(f => ({
      ...f,
      polygon: terrainPolygon(f),
      corridor: terrainPolygon(f, 9)
    })),
    passes: terrainCopy(definition.passes ?? [])
  };
}
export function terrainPoint(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 100000 && Math.abs(p.y) < 100000;
}
export function terrainShapeSafe(feature) {
  const {
    path,
    center
  } = feature;
  if (!terrainPoint(center) || !Array.isArray(path) || path.length < 4 || path.length > 32 || !path.every(terrainPoint)) return false;
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i],
      q = path[(i + 1) % path.length],
      radius = Math.hypot(p.x - center.x, p.y - center.y),
      angle = (Math.atan2(q.y - center.y, q.x - center.x) - Math.atan2(p.y - center.y, p.x - center.x) + Math.PI * 2) % (Math.PI * 2);
    if (radius < 14 || radius > 3000 || angle < .025 || angle > Math.PI * .85) return false;
    total += angle;
  }
  if (Math.abs(total - Math.PI * 2) > 1e-5 || !lakeSimpleRing(path) || !pointInPolygon(center, path)) return false;
  const bank = terrainPolygon(feature, 9);
  if (!bank.every(terrainPoint) || !lakeSimpleRing(bank) || path.some(p => !insideOrOn(p, bank))) return false;
  for (let i = 0; i < path.length; i++)
    for (let j = 0; j < bank.length; j++)
      if (segmentDistance(path[i], path[(i + 1) % path.length], bank[j], bank[(j + 1) % bank.length]) < 6) return false;
  return true;
}
export function terrainRidgeSafe(feature) {
  const path = feature.ridge;
  if (!Array.isArray(path) || path.length !== 3 || path.some(p => !terrainPoint(p) || !Number.isFinite(p.height) || p.height < 50 || p.height > 3000 || !pointInPolygon(p, feature.path))) return false;
  const a = path[0],
    b = path[2],
    length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 40) return false;
  const u = {
    x: (b.x - a.x) / length,
    y: (b.y - a.y) / length
  };
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1],
      q = path[i],
      du = (q.x - p.x) * u.x + (q.y - p.y) * u.y,
      dv = -(q.x - p.x) * u.y + (q.y - p.y) * u.x;
    if (du < 2 || Math.abs(dv) > du * .8 || waterLineIntervals(p, q, feature.path).some(s => !s.inside)) return false;
  }
  return true;
}
export function terrainAccessSegments(features, boundary) {
  return lakeAccessSegments(features.filter(f => waterPolygonsOverlap(f.corridor ?? terrainPolygon(f, 9), boundary)).map(f => ({
    ...f,
    kind: 'lake'
  })), boundary);
}
export function terrainPassAt(feature, t) {
  // The ridge frame is independent of its editable outer mountain footprint.
  const path = feature.ridge,
    a = path[0],
    b = path.at(-1),
    length = Math.hypot(b.x - a.x, b.y - a.y),
    u = {
      x: (b.x - a.x) / length,
      y: (b.y - a.y) / length
    },
    target = t * length;
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1],
      q = path[i],
      lo = (p.x - a.x) * u.x + (p.y - a.y) * u.y,
      hi = (q.x - a.x) * u.x + (q.y - a.y) * u.y;
    if (target <= hi + 1e-7) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      return {
        ...lerpPoint(p, q, Math.max(0, Math.min(1, (target - lo) / (hi - lo)))),
        normal: {
          x: -(q.y - p.y) / d,
          y: (q.x - p.x) / d
        }
      };
    }
  }
  throw new Error('Invalid mountain pass position.');
}
export function terrainNearestT(feature, p) {
  const a = feature.ridge[0],
    b = feature.ridge.at(-1),
    dx = b.x - a.x,
    dy = b.y - a.y;
  return Math.max(.02, Math.min(.98, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
}
export function terrainPassGeometry(feature, pass, boundary) {
  const p = terrainPassAt(feature, pass.t),
    b = boundsOf([...boundary, ...feature.path]),
    reach = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 3;
  const a = {
      x: p.x - p.normal.x * reach,
      y: p.y - p.normal.y * reach
    },
    end = {
      x: p.x + p.normal.x * reach,
      y: p.y + p.normal.y * reach
    };
  const span = waterLineIntervals(a, end, terrainPolygon(feature, 9)).find(s => s.inside && distanceToSegment(p, s.a, s.b) < 1e-5);
  if (!span || !insideOrOn(span.a, boundary) || !insideOrOn(span.b, boundary)) throw new Error('Move this pass along the ridge until both foothills lie inside the city.');
  return {
    center: {
      x: p.x,
      y: p.y
    },
    ends: [span.a, span.b],
    approach: [a, end]
  };
}
