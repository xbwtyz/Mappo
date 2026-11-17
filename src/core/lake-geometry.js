import {
  boundsOf,
  polygonSignedArea,
  pointInPolygon
} from './geometry.js';
import {
  insideOrOn,
  distanceToSegment,
  segmentCuts
} from './boundary.js';
import {
  segmentDistance
} from './placement.js';

export const LAKE_LIMIT = 8;
// A closed shoreline and its parallel bank ring. Positive winding keeps the
// outward normals independent of screen coordinates or rendering conventions.
export function lakePolygon(feature, margin = 0) {
  const path = feature.path;
  if (!margin) return path.map(p => ({
    x: p.x,
    y: p.y
  }));
  return path.map((p, i) => {
    const a = path[(i + path.length - 1) % path.length],
      b = path[(i + 1) % path.length];
    const da = Math.hypot(p.x - a.x, p.y - a.y),
      db = Math.hypot(b.x - p.x, b.y - p.y);
    const na = {
        x: (p.y - a.y) / da,
        y: -(p.x - a.x) / da
      },
      nb = {
        x: (b.y - p.y) / db,
        y: -(b.x - p.x) / db
      };
    const divisor = 1 + na.x * nb.x + na.y * nb.y;
    return {
      x: p.x + margin * (na.x + nb.x) / divisor,
      y: p.y + margin * (na.y + nb.y) / divisor
    };
  });
}
export function lakeSimpleRing(path) {
  if (polygonSignedArea(path) <= 1) return false;
  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1) return false;
    for (let j = i + 1; j < path.length; j++) {
      if (j === i + 1 || (i === 0 && j === path.length - 1)) continue;
      if (segmentCuts(a, b, path[j], path[(j + 1) % path.length]).length) return false;
    }
  }
  return true;
}
export function lakeShapeSafe(feature) {
  const {
    path,
    center
  } = feature;
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y) || !Array.isArray(path) || path.length < 3 || path.length > 32 || path.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000)) return false;
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i],
      q = path[(i + 1) % path.length],
      radius = Math.hypot(p.x - center.x, p.y - center.y);
    const angle = (Math.atan2(q.y - center.y, q.x - center.x) - Math.atan2(p.y - center.y, p.x - center.x) + Math.PI * 2) % (Math.PI * 2);
    if (radius < 12 || radius > 200 || angle < .025 || angle > Math.PI * .85) return false;
    total += angle;
  }
  if (Math.abs(total - Math.PI * 2) > 1e-5 || !lakeSimpleRing(path) || !pointInPolygon(center, path)) return false;
  const bank = lakePolygon(feature, 9);
  if (bank.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)) || !lakeSimpleRing(bank) || path.some(p => !insideOrOn(p, bank))) return false;
  for (let i = 0; i < path.length; i++)
    for (let j = 0; j < bank.length; j++)
      if (segmentDistance(path[i], path[(i + 1) % path.length], bank[j], bank[(j + 1) % bank.length]) < 6) return false;
  return true;
}
export function lakeFitsBoundary(feature, boundary) {
  if (!boundary.length) return true;
  const bank = lakePolygon(feature, 9);
  return bank.every(p => insideOrOn(p, boundary)) && bank.every((p, i) => boundary.every((q, j) => segmentDistance(p, bank[(i + 1) % bank.length], q, boundary[(j + 1) % boundary.length]) >= 12));
}
export function validateLakeFeature(feature, boundary, squareCenter) {
  if (!lakeShapeSafe(feature)) throw new Error('Invalid lake shoreline or bank geometry. Regenerate the selected lake to repair its shoreline.');
  if (!lakeFitsBoundary(feature, boundary)) throw new Error('Keep the lake and its banks inside the city outline. Move it inward or reduce its size.');
  const bank = lakePolygon(feature, 9);
  if (insideOrOn(squareCenter, bank) || bank.some((p, i) => distanceToSegment(squareCenter, p, bank[(i + 1) % bank.length]) < 28)) throw new Error('Move the lake away from the main square.');
  for (const [key, margin] of [
      ['polygon', 0],
      ['corridor', 9]
    ]) {
    const expected = lakePolygon(feature, margin);
    if (!Array.isArray(feature[key]) || feature[key].length !== expected.length || expected.some((p, i) => Math.hypot(p.x - feature[key][i]?.x, p.y - feature[key][i]?.y) > 1e-5 || !Number.isFinite(feature[key][i]?.x) || !Number.isFinite(feature[key][i]?.y))) throw new Error('Saved lake banks disagree with the shoreline.');
  }
}
// Dry access streets join an enclosed bank ring to its surrounding neighborhood
// and split annular land into ordinary simple faces, even inside a single block.
export function lakeAccessSegments(features, boundary) {
  const b = boundsOf(boundary),
    reach = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 2;
  return features.filter(f => f.kind === 'lake').flatMap(f => [{
    a: {
      x: f.center.x - reach,
      y: f.center.y
    },
    b: {
      x: f.center.x + reach,
      y: f.center.y
    },
    kind: 'access'
  }, {
    a: {
      x: f.center.x,
      y: f.center.y - reach
    },
    b: {
      x: f.center.x,
      y: f.center.y + reach
    },
    kind: 'access'
  }]);
}
