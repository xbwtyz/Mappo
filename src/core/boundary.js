import {
  boundsOf,
  polygonSignedArea,
  pointInPolygon
} from './geometry.js';

export function cross2(a, b) {
  return a.x * b.y - a.y * b.x;
}
export function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function insideOrOn(p, polygon) {
  return pointInPolygon(p, polygon) || polygon.some((a, i) => distanceToSegment(p, a, polygon[(i + 1) % polygon.length]) < 1e-6);
}

// Includes endpoint contacts and collinear overlaps. Both generators and
// validation use the same segment predicates, with dimensionless parameters.
export function segmentCuts(a, b, c, d) {
  const r = {
      x: b.x - a.x,
      y: b.y - a.y
    },
    s = {
      x: d.x - c.x,
      y: d.y - c.y
    };
  const q = {
      x: c.x - a.x,
      y: c.y - a.y
    },
    denominator = cross2(r, s);
  if (Math.abs(denominator) > 1e-9) {
    const t = cross2(q, s) / denominator,
      u = cross2(q, r) / denominator;
    return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [Math.max(0, Math.min(1, t))] : [];
  }
  if (Math.abs(cross2(q, r)) > 1e-7) return [];
  const length2 = r.x * r.x + r.y * r.y;
  if (length2 < 1e-12) return [];
  return [c, d].map(p => ((p.x - a.x) * r.x + (p.y - a.y) * r.y) / length2).filter(t => t >= -1e-9 && t <= 1 + 1e-9).map(t => Math.max(0, Math.min(1, t)));
}

export function validateBoundary(points) {
  if (!Array.isArray(points) || points.length < 3) throw new Error('Place at least three outline points.');
  if (points.length > 1200) throw new Error('The outline has too many points. Try a shorter stroke.');
  if (!points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 10000 && Math.abs(p.y) < 10000)) throw new Error('The outline contains invalid coordinates.');
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-5) throw new Error('Remove duplicate outline points.');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentCuts(a, b, points[j], points[(j + 1) % points.length]).length) throw new Error('The outline crosses or touches itself. Move the highlighted shape points apart.');
    }
  }
  const b = boundsOf(points);
  if (Math.min(b.maxX - b.minX, b.maxY - b.minY) < 100 || Math.abs(polygonSignedArea(points)) < 8000) throw new Error('Draw a larger city outline: at least 100 units across with room for streets.');
  return points;
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  let distance = tolerance,
    index = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], points[0], points.at(-1));
    if (d > distance) {
      distance = d;
      index = i;
    }
  }
  if (index < 0) return [points[0], points.at(-1)];
  return [...simplifyLine(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyLine(points.slice(index), tolerance)];
}
export function cleanOutline(raw, tolerance = 3) {
  let points = raw.filter((p, i) => !i || Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y) > 1e-4).map(p => ({
    x: p.x,
    y: p.y
  }));
  if (points.length > 2 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 1e-4) points.pop();
  validateBoundary(points);
  let far = 1;
  for (let i = 2; i < points.length; i++)
    if (Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y) > Math.hypot(points[far].x - points[0].x, points[far].y - points[0].y)) far = i;
  const simple = [...simplifyLine(points.slice(0, far + 1), tolerance).slice(0, -1), ...simplifyLine([...points.slice(far), points[0]], tolerance).slice(0, -1)];
  validateBoundary(simple);
  if (simple.length > 160) throw new Error('Simplify this outline to fewer than 160 corners.');
  if (polygonSignedArea(simple) < 0) simple.reverse();
  return simple;
}

export function clearance(p, boundary) {
  let nearest = Infinity;
  for (let i = 0; i < boundary.length; i++) {
    const next = boundary[(i + 1) % boundary.length];
    nearest = Math.min(nearest, distanceToSegment(p, boundary[i], next));
  }
  return nearest;
}
export function findCityCenter(boundary) {
  const b = boundsOf(boundary);
  let best = null,
    bestDistance = -1;
  for (let y = 0; y <= 24; y++)
    for (let x = 0; x <= 24; x++) {
      const p = {
        x: b.minX + (b.maxX - b.minX) * (x + .5) / 25,
        y: b.minY + (b.maxY - b.minY) * (y + .5) / 25
      };
      if (pointInPolygon(p, boundary)) {
        const d = clearance(p, boundary);
        if (d > bestDistance) {
          best = p;
          bestDistance = d;
        }
      }
    }
  if (!best || bestDistance < 18) throw new Error('This outline is too narrow for a town center. Widen part of it.');
  return best;
}

export function checkNarrowSections(boundary) {
  const cumulative = [0];
  for (let i = 0; i < boundary.length; i++) cumulative.push(cumulative.at(-1) + Math.hypot(boundary[i].x - boundary[(i + 1) % boundary.length].x, boundary[i].y - boundary[(i + 1) % boundary.length].y));
  const total = cumulative.at(-1);
  for (let i = 0; i < boundary.length; i++)
    for (let j = i + 2; j < boundary.length; j++) {
      if (i === 0 && j === boundary.length - 1) continue;
      const first = [boundary[i], boundary[(i + 1) % boundary.length]],
        second = [boundary[j], boundary[(j + 1) % boundary.length]];
      for (const fraction of [0, .5, 1]) {
        const a = lerpPoint(first[0], first[1], fraction),
          dx = second[1].x - second[0].x,
          dy = second[1].y - second[0].y;
        const t = Math.max(0, Math.min(1, ((a.x - second[0].x) * dx + (a.y - second[0].y) * dy) / (dx * dx + dy * dy)));
        const b = lerpPoint(second[0], second[1], t),
          gap = Math.hypot(a.x - b.x, a.y - b.y);
        const positionA = cumulative[i] + fraction * (cumulative[i + 1] - cumulative[i]),
          positionB = cumulative[j] + t * (cumulative[j + 1] - cumulative[j]);
        const path = Math.abs(positionA - positionB);
        if (gap < 18 && Math.min(path, total - path) > 90 && pointInPolygon(lerpPoint(a, b, .5), boundary)) throw new Error('A section is too narrow for streets. Widen the neck to at least 18 units.');
      }
    }
}
