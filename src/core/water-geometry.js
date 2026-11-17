import {
  lakePolygon
} from './lake-geometry.js';
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
export const WATER_MAX_SLOPE = .8;
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
  if (length < 80) throw new Error('Extend the water feature endpoints farther apart.');
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
// Shape adapters keep the layout, defense and editing pipelines independent of
// a particular water kind. Additional kinds need a matching strict validator.
export function waterCoastPolygon(feature, margin = 0) {
  const {
    v
  } = waterFrame(feature), sign = feature.waterSide === 'left' ? 1 : -1;
  const shore = feature.path.map(p => ({
    x: p.x - v.x * sign * margin,
    y: p.y - v.y * sign * margin
  }));
  const far = p => ({
    x: p.x + v.x * sign * feature.seaDepth,
    y: p.y + v.y * sign * feature.seaDepth
  });
  const polygon = [...shore, far(feature.path.at(-1)), far(feature.path[0])];
  if (polygonSignedArea(polygon) < 0) polygon.reverse();
  return polygon;
}
export const WATER_GEOMETRY = Object.freeze({
  river: waterRibbon,
  coast: waterCoastPolygon,
  lake: lakePolygon
});
export function waterFeaturePolygon(feature, margin = 0) {
  const build = Object.hasOwn(WATER_GEOMETRY, feature.kind) ? WATER_GEOMETRY[feature.kind] : null;
  if (!build) throw new Error('Unsupported water feature kind.');
  return build(feature, margin);
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
  if (feature.kind !== 'river') throw new Error('Bridges require a river with two banks.');
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

export function waterStatus(features) {
  return features.length > 1 ? 'mixed' : features[0]?.kind ?? 'dry';
}
export function waterCompositionState(features, previous = {}) {
  const status = waterStatus(features);
  return {
    ...waterDryState(),
    ...previous,
    status,
    algorithm: status === 'mixed' ? 'union-v1' : status === 'coast' ? 'shore-v1' : status === 'lake' ? 'lake-v1' : 'ribbon-v1'
  };
}
export function waterStrictInside(p, polygon) {
  return pointInPolygon(p, polygon) && polygon.every((a, i) => distanceToSegment(p, a, polygon[(i + 1) % polygon.length]) > 1e-6);
}
export function waterSetContains(p, features, field = 'corridor') {
  return features.some(f => pointInPolygon(p, f[field]));
}
export function waterSetBoundary(p, features, field = 'corridor') {
  for (const f of features)
    for (let i = 0; i < f[field].length; i++) {
      const a = f[field][i],
        b = f[field][(i + 1) % f[field].length];
      if (distanceToSegment(p, a, b) >= 1e-5) continue;
      if (features.length === 1) return true;
      const d = Math.hypot(b.x - a.x, b.y - a.y),
        nx = -(b.y - a.y) * 1e-4 / d,
        ny = (b.x - a.x) * 1e-4 / d;
      if (waterSetContains({
          x: p.x + nx,
          y: p.y + ny
        }, features, field) !== waterSetContains({
          x: p.x - nx,
          y: p.y - ny
        }, features, field)) return true;
    }
  return false;
}
export function waterSetIntervals(a, b, features, field = 'corridor') {
  const ts = [0, 1];
  for (const f of features)
    for (let i = 0; i < f[field].length; i++) ts.push(...segmentCuts(a, b, f[field][i], f[field][(i + 1) % f[field].length]));
  ts.sort((x, y) => x - y);
  const result = [];
  for (let i = 1; i < ts.length; i++)
    if (ts[i] - ts[i - 1] > 1e-9) {
      const lo = ts[i - 1],
        hi = ts[i];
      result.push({
        a: lerpPoint(a, b, lo),
        b: lerpPoint(a, b, hi),
        inside: waterSetContains(lerpPoint(a, b, (lo + hi) / 2), features, field)
      });
    }
  return result;
}
export function waterUnionSegments(features, field = 'corridor') {
  const result = [];
  for (const feature of features) {
    const others = features.filter(f => f !== feature);
    for (let i = 0; i < feature[field].length; i++)
      for (const s of waterSetIntervals(feature[field][i], feature[field][(i + 1) % feature[field].length], others, field)) {
        const mid = lerpPoint(s.a, s.b, .5);
        if (!others.some(f => waterStrictInside(mid, f[field])) && waterSetBoundary(mid, features, field)) result.push({
          ...s,
          featureId: feature.id
        });
      }
  }
  return result;
}
export function waterBridgeClearOfFeatures(feature, bridge, boundary, others) {
  const g = waterBridgeGeometry(feature, bridge, boundary),
    half = bridge.width / 2 + 2;
  for (const other of others) {
    if (waterSetIntervals(...g.ends, [other]).some(s => s.inside)) return false;
    for (let i = 0; i < other.corridor.length; i++) {
      const a = other.corridor[i],
        b = other.corridor[(i + 1) % other.corridor.length];
      if (Math.min(distanceToSegment(a, ...g.ends), distanceToSegment(b, ...g.ends), ...g.ends.map(p => distanceToSegment(p, a, b))) < half) return false;
    }
  }
  return true;
}
export function waterPolygonsOverlap(a, b) {
  for (const [own, other] of [
      [a, b],
      [b, a]
    ])
    for (let i = 0; i < own.length; i++) {
      const p = own[i],
        q = own[(i + 1) % own.length],
        d = Math.hypot(q.x - p.x, q.y - p.y),
        mid = lerpPoint(p, q, .5);
      if (waterStrictInside(p, other) || waterStrictInside(mid, other) || (waterStrictInside({
          x: mid.x - (q.y - p.y) * 1e-4 / d,
          y: mid.y + (q.x - p.x) * 1e-4 / d
        }, own) && waterStrictInside({
          x: mid.x - (q.y - p.y) * 1e-4 / d,
          y: mid.y + (q.x - p.x) * 1e-4 / d
        }, other))) return true;
      for (let j = 0; j < other.length; j++) {
        const cuts = segmentCuts(p, q, other[j], other[(j + 1) % other.length]);
        if (cuts.some(t => t > 1e-7 && t < 1 - 1e-7) && segmentCuts(other[j], other[(j + 1) % other.length], p, q).some(t => t > 1e-7 && t < 1 - 1e-7) && Math.abs((q.x - p.x) * (other[(j + 1) % other.length].y - other[j].y) - (q.y - p.y) * (other[(j + 1) % other.length].x - other[j].x)) > 1e-7) return true;
      }
    }
  return false;
}
export function waterFaceFeatureIds(vertices, nodes, features) {
  const polygon = vertices.map(id => nodes.get(id));
  return features.filter(f => waterPolygonsOverlap(polygon, f.corridor)).map(f => f.id).sort();
}
