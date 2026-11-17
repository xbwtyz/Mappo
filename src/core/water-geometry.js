import {
  boundsOf,
  polygonSignedArea,
  pointInPolygon
} from './geometry.js';
import {
  segmentCuts,
  lerpPoint,
  insideOrOn,
  distanceToSegment
} from './boundary.js';

export const WATER_BANK = 9;
export function waterDryState() {
  return {
    version: 1,
    status: 'dry',
    seed: 'river',
    algorithm: 'ribbon-v1'
  };
}
export function waterFrame(feature) {
  const a = feature.path[0],
    b = feature.path.at(-1),
    length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 80) throw new Error('Extend the river endpoints farther apart.');
  const u = {
    x: (b.x - a.x) / length,
    y: (b.y - a.y) / length
  };
  return {
    origin: a,
    u,
    v: {
      x: -u.y,
      y: u.x
    },
    length
  };
}
export function waterRibbon(feature, margin = 0) {
  const {
    v
  } = waterFrame(feature), half = feature.width / 2 + margin;
  const polygon = [...feature.path.map(p => ({
    x: p.x + v.x * half,
    y: p.y + v.y * half
  })), ...feature.path.toReversed().map(p => ({
    x: p.x - v.x * half,
    y: p.y - v.y * half
  }))];
  if (polygonSignedArea(polygon) < 0) polygon.reverse();
  return polygon;
}
export function waterAt(feature, t) {
  const f = waterFrame(feature),
    position = Math.max(0, Math.min(1, t)) * f.length;
  const projection = p => (p.x - f.origin.x) * f.u.x + (p.y - f.origin.y) * f.u.y;
  for (let i = 1; i < feature.path.length; i++) {
    const a = feature.path[i - 1],
      b = feature.path[i],
      lo = projection(a),
      hi = projection(b);
    if (position <= hi + 1e-7) {
      const p = lerpPoint(a, b, (position - lo) / (hi - lo)),
        d = Math.hypot(b.x - a.x, b.y - a.y);
      return {
        ...p,
        normal: {
          x: -(b.y - a.y) / d,
          y: (b.x - a.x) / d
        }
      };
    }
  }
  return {
    ...feature.path.at(-1),
    normal: f.v
  };
}
export function waterNearestT(feature, point) {
  const f = waterFrame(feature);
  return Math.max(.02, Math.min(.98, ((point.x - f.origin.x) * f.u.x + (point.y - f.origin.y) * f.u.y) / f.length));
}
export function waterLineIntervals(a, b, polygon) {
  const ts = [0, 1];
  for (let i = 0; i < polygon.length; i++) ts.push(...segmentCuts(a, b, polygon[i], polygon[(i + 1) % polygon.length]));
  ts.sort((x, y) => x - y);
  const sorted = ts.filter((t, i) => !i || t - ts[i - 1] > 1e-10),
    result = [];
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i] - sorted[i - 1] > 1e-8) result.push({
      a: lerpPoint(a, b, sorted[i - 1]),
      b: lerpPoint(a, b, sorted[i]),
      inside: pointInPolygon(lerpPoint(a, b, (sorted[i - 1] + sorted[i]) / 2), polygon)
    });
  return result;
}
export function waterBridgeGeometry(feature, bridge, boundary) {
  const p = waterAt(feature, bridge.t),
    bounds = boundsOf(boundary),
    reach = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 3;
  const a = {
      x: p.x - p.normal.x * reach,
      y: p.y - p.normal.y * reach
    },
    b = {
      x: p.x + p.normal.x * reach,
      y: p.y + p.normal.y * reach
    };
  const corridor = waterRibbon(feature, WATER_BANK);
  const span = waterLineIntervals(a, b, corridor).find(s => s.inside && distanceToSegment(p, s.a, s.b) < 1e-4);
  if (!span || !insideOrOn(span.a, boundary) || !insideOrOn(span.b, boundary)) throw new Error('Move the bridge to a crossing with both banks inside the city.');
  const citySpan = waterLineIntervals(a, b, boundary).find(s => s.inside && distanceToSegment(p, s.a, s.b) < 1e-4);
  if (!citySpan) throw new Error('Place the bridge inside the city.');
  return {
    center: {
      x: p.x,
      y: p.y
    },
    ends: [span.a, span.b],
    approach: [citySpan.a, citySpan.b]
  };
}
export function waterFaceInterior(vertices, nodes) {
  // Midpoint shifted just left of a directed CCW edge is inside a bounded face.
  for (let i = 0; i < vertices.length; i++) {
    const a = nodes.get(vertices[i]),
      b = nodes.get(vertices[(i + 1) % vertices.length]),
      d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > 1e-6) return {
      x: (a.x + b.x) / 2 - (b.y - a.y) * 1e-4 / d,
      y: (a.y + b.y) / 2 + (b.x - a.x) * 1e-4 / d
    };
  }
  throw new Error('Invalid water face.');
}
export function waterDistance(point, polygon) {
  return pointInPolygon(point, polygon) ? 0 : Math.min(...polygon.map((p, i) => distanceToSegment(point, p, polygon[(i + 1) % polygon.length])));
}
