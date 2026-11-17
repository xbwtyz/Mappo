import {
  pointInPolygon
} from './geometry.js';
import {
  distanceToSegment,
  segmentCuts
} from './boundary.js';

// Shared road dimensions keep the collision margin and rendering in agreement.
export const STREET_WIDTHS = Object.freeze({
  primary: 12,
  secondary: 8.2,
  lane: 4.5
});
export const STREET_EDGE_WIDTH = 2.2;
export const PROPERTY_SETBACK = 1.6;

export function rectangleInFrame(frame, x, y, width, depth) {
  const point = (u, v) => ({
    x: frame.origin.x + frame.tangent.x * u + frame.inward.x * v,
    y: frame.origin.y + frame.tangent.y * u + frame.inward.y * v
  });
  return [point(x, y), point(x + width, y), point(x + width, y + depth), point(x, y + depth)];
}

// Separating-axis test: all property envelopes are convex rectangles. Padding
// reserves gaps between properties, including frontages on different streets.
export function rectanglesOverlap(a, b, padding = 0) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const p = polygon[i],
        q = polygon[i + 1];
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      const axis = {
        x: -(q.y - p.y) / length,
        y: (q.x - p.x) / length
      };
      const pa = a.map(v => v.x * axis.x + v.y * axis.y);
      const pb = b.map(v => v.x * axis.x + v.y * axis.y);
      if (Math.max(...pa) + padding <= Math.min(...pb) + 1e-7 || Math.max(...pb) + padding <= Math.min(...pa) + 1e-7) return false;
    }
  }
  return true;
}

export function segmentDistance(a, b, c, d) {
  if (segmentCuts(a, b, c, d).length || segmentCuts(c, d, a, b).length) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

export function propertyFits(polygon, blockPolygon, streetEdges) {
  if (!polygon.every(p => pointInPolygon(p, blockPolygon))) return false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    for (const edge of streetEdges) {
      const margin = (STREET_WIDTHS[edge.road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK;
      if (segmentDistance(a, b, edge.a, edge.b) < margin - 1e-6) return false;
    }
  }
  return true;
}

// Polygon intersection against a convex plot. Also works for concave building
// footprints; signed area accounts for any traversed boundary bridges.
export function clipToConvexPolygon(subject, clip) {
  let output = subject.map(p => ({
    ...p
  }));
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      input = output;
    output = [];
    const side = p => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        sp = side(p),
        sq = side(q);
      if (sp >= -1e-8) output.push(p);
      if ((sp > 1e-8 && sq < -1e-8) || (sp < -1e-8 && sq > 1e-8)) {
        const t = sp / (sp - sq);
        output.push({
          x: p.x + (q.x - p.x) * t,
          y: p.y + (q.y - p.y) * t
        });
      }
    }
  }
  return output;
}
