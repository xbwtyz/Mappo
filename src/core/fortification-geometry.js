import {
  boundsOf,
  polygonSignedArea,
  pointInPolygon
} from './geometry.js';
import {
  distanceToSegment,
  segmentCuts,
  lerpPoint,
  insideOrOn
} from './boundary.js';
import {
  segmentDistance
} from './placement.js';

export const WALL_WIDTH = 6;
export const WALL_EDGE_WIDTH = 2;
export const WALL_CLEARANCE = 16;
export const TOWER_RADIUS = 6.5;
export const GATE_OPENING = 26;
export const GATE_POST_RADIUS = 4.5;

export function measureWall(path) {
  const distances = [0];
  for (let i = 0; i < path.length; i++) distances.push(distances.at(-1) + Math.hypot(path[(i + 1) % path.length].x - path[i].x, path[(i + 1) % path.length].y - path[i].y));
  return {
    path,
    distances,
    length: distances.at(-1)
  };
}
export function wallPoint(measure, arc) {
  const at = ((arc % measure.length) + measure.length) % measure.length;
  let index = measure.distances.findIndex((d, i) => i < measure.path.length && measure.distances[i + 1] >= at - 1e-8);
  if (index < 0) index = measure.path.length - 1;
  const t = (at - measure.distances[index]) / (measure.distances[index + 1] - measure.distances[index]);
  return lerpPoint(measure.path[index], measure.path[(index + 1) % measure.path.length], Math.max(0, Math.min(1, t)));
}
export function wallArcGap(a, b, length) {
  const gap = Math.abs(a - b) % length;
  return Math.min(gap, length - gap);
}
export function solidWallSegments(wall, gates) {
  const measure = measureWall(wall.path),
    cuts = (wall.waterOpenings ?? []).map(o => [o.start, o.end]);
  for (const gate of gates.filter(g => g.wallId === wall.id)) {
    const a = gate.arc - gate.opening / 2,
      b = gate.arc + gate.opening / 2;
    if (a < 0) {
      cuts.push([0, b], [a + measure.length, measure.length]);
    } else if (b > measure.length) {
      cuts.push([a, measure.length], [0, b - measure.length]);
    } else cuts.push([a, b]);
  }
  cuts.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const cut of cuts) {
    if (merged.length && cut[0] <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], cut[1]);
    else merged.push([...cut]);
  }
  const sections = [];
  for (let i = 0; i < wall.path.length; i++) {
    const a = measure.distances[i],
      b = measure.distances[i + 1];
    let spans = [
      [a, b]
    ];
    for (const [lo, hi] of merged) spans = spans.flatMap(([start, end]) => hi <= start || lo >= end ? [
      [start, end]
    ] : [
      [start, Math.min(end, lo)],
      [Math.max(start, hi), end]
    ].filter(([p, q]) => q - p > 1e-7));
    for (const [start, end] of spans) sections.push({
      a: wallPoint(measure, start),
      b: wallPoint(measure, end),
      start,
      end
    });
  }
  return sections;
}
export function simpleWallPath(path) {
  if (path.length < 3 || path.length > 1024 || polygonSignedArea(path) <= 0) return false;
  for (let i = 0; i < path.length; i++)
    if (Math.hypot(path[i].x - path[(i + 1) % path.length].x, path[i].y - path[(i + 1) % path.length].y) < 1e-7) return false;
  for (let i = 0; i < path.length; i++)
    for (let j = i + 2; j < path.length; j++) {
      if (i === 0 && j === path.length - 1) continue;
      if (segmentCuts(path[i], path[(i + 1) % path.length], path[j], path[(j + 1) % path.length]).length) return false;
    }
  return true;
}
export function wallEnclosesCity(path, boundary, minimum = WALL_CLEARANCE) {
  if (!boundary.every(p => pointInPolygon(p, path))) return false;
  for (let i = 0; i < path.length; i++)
    for (let j = 0; j < boundary.length; j++)
      if (segmentDistance(path[i], path[(i + 1) % path.length], boundary[j], boundary[(j + 1) % boundary.length]) < minimum - 1e-6) return false;
  return true;
}

function simplifyWallLine(points, tolerance) {
  if (points.length < 3) return points;
  let far = -1,
    distance = tolerance;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], points[0], points.at(-1));
    if (d > distance) {
      distance = d;
      far = i;
    }
  }
  return far < 0 ? [points[0], points.at(-1)] : [...simplifyWallLine(points.slice(0, far + 1), tolerance).slice(0, -1), ...simplifyWallLine(points.slice(far), tolerance)];
}

function simplifyWallLoop(points, tolerance) {
  let far = 1;
  for (let i = 2; i < points.length; i++)
    if (Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y) > Math.hypot(points[far].x - points[0].x, points[far].y - points[0].y)) far = i;
  const result = [...simplifyWallLine(points.slice(0, far + 1), tolerance).slice(0, -1), ...simplifyWallLine([...points.slice(far), points[0]], tolerance).slice(0, -1)];
  return polygonSignedArea(result) < 0 ? result.reverse() : result;
}

// A signed-distance contour avoids intersecting offset miters at narrow
// concavities. Resolution is bounded independently of map size; the resulting
// simple outer ring is then checked against the original city exactly.
export function distanceContourWall(boundary) {
  const bounds = boundsOf(boundary),
    step = Math.max(1.5, Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 180);
  const radius = WALL_CLEARANCE + step * 1.35,
    padding = radius + step * 3;
  const origin = {
    x: bounds.minX - padding,
    y: bounds.minY - padding
  };
  const columns = Math.ceil((bounds.maxX - bounds.minX + 2 * padding) / step),
    rows = Math.ceil((bounds.maxY - bounds.minY + 2 * padding) / step);
  const field = new Float64Array((columns + 1) * (rows + 1));
  const value = p => {
    let distance = Infinity;
    for (let i = 0; i < boundary.length; i++) distance = Math.min(distance, distanceToSegment(p, boundary[i], boundary[(i + 1) % boundary.length]));
    const result = radius - (pointInPolygon(p, boundary) ? -distance : distance);
    return Math.abs(result) < 1e-9 ? 1e-9 : result;
  };
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) field[y * (columns + 1) + x] = value({
      x: origin.x + x * step,
      y: origin.y + y * step
    });
  const vertices = new Map(),
    neighbors = new Map();

  function intersection(x, y, edge) {
    const ends = [
      [
        [x, y],
        [x + 1, y]
      ],
      [
        [x + 1, y],
        [x + 1, y + 1]
      ],
      [
        [x + 1, y + 1],
        [x, y + 1]
      ],
      [
        [x, y + 1],
        [x, y]
      ]
    ][edge];
    const [a, b] = ends, key = edge === 0 ? `h:${x}:${y}` : edge === 1 ? `v:${x+1}:${y}` : edge === 2 ? `h:${x}:${y+1}` : `v:${x}:${y}`;
    if (!vertices.has(key)) {
      const va = field[a[1] * (columns + 1) + a[0]],
        vb = field[b[1] * (columns + 1) + b[0]],
        t = Math.max(1e-8, Math.min(1 - 1e-8, va / (va - vb)));
      vertices.set(key, {
        x: origin.x + (a[0] + (b[0] - a[0]) * t) * step,
        y: origin.y + (a[1] + (b[1] - a[1]) * t) * step
      });
      neighbors.set(key, []);
    }
    return key;
  }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const values = [field[y * (columns + 1) + x], field[y * (columns + 1) + x + 1], field[(y + 1) * (columns + 1) + x + 1], field[(y + 1) * (columns + 1) + x]];
      const crossing = [];
      for (let e = 0; e < 4; e++)
        if ((values[e] > 0) !== (values[(e + 1) % 4] > 0)) crossing.push(e);
      let pairs = [];
      if (crossing.length === 2) pairs = [crossing];
      else if (crossing.length === 4) {
        const centerInside = value({
          x: origin.x + (x + .5) * step,
          y: origin.y + (y + .5) * step
        }) > 0;
        const caseFive = values[0] > 0;
        pairs = centerInside === caseFive ? [
          [0, 1],
          [2, 3]
        ] : [
          [0, 3],
          [1, 2]
        ];
      }
      for (const [a, b] of pairs) {
        const first = intersection(x, y, a),
          second = intersection(x, y, b);
        neighbors.get(first).push(second);
        neighbors.get(second).push(first);
      }
    }
  const visited = new Set(),
    loops = [];
  for (const start of vertices.keys())
    if (!visited.has(start)) {
      const loop = [];
      let previous = null,
        current = start;
      do {
        if (visited.has(current)) throw new Error('Wall contour did not form a simple closed loop.');
        visited.add(current);
        loop.push(vertices.get(current));
        const list = neighbors.get(current);
        if (list.length !== 2) throw new Error('Wall contour has an incomplete junction.');
        const next = list[0] === previous ? list[1] : list[0];
        previous = current;
        current = next;
      } while (current !== start);
      loops.push(loop);
    }
  if (!loops.length) throw new Error('Could not outline the city with a wall.');
  const outer = loops.sort((a, b) => Math.abs(polygonSignedArea(b)) - Math.abs(polygonSignedArea(a)))[0];
  for (const tolerance of [step * .4, step * .12, step * .025, 0]) {
    const candidate = simplifyWallLoop(outer, tolerance);
    if (simpleWallPath(candidate) && wallEnclosesCity(candidate, boundary)) return candidate;
  }
  throw new Error('This outline is too complex for a safe wall. Simplify its small indentations and try again.');
}
