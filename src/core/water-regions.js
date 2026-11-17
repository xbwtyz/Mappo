import {
  segmentCuts,
  lerpPoint
} from './boundary.js';
import {
  pointInPolygon,
  polygonSignedArea
} from './geometry.js';
import {
  waterFaceInterior
} from './water-geometry.js';

// A shoreline-only arrangement checks land connectivity before streets exist.
// Each positive dry face is one land region; tangent spurs do not add regions.
export function waterLandRegions(boundary, corridor) {
  const segments = [...boundary.map((a, i) => ({
    a,
    b: boundary[(i + 1) % boundary.length]
  })), ...corridor.map((a, i) => ({
    a,
    b: corridor[(i + 1) % corridor.length]
  }))];
  const cuts = segments.map(() => [0, 1]);
  let work = 400000;
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      if (--work < 0) throw new Error('The shoreline is too complex for this build. Simplify the outline.');
      const a = segments[i],
        b = segments[j];
      cuts[i].push(...segmentCuts(a.a, a.b, b.a, b.b));
      cuts[j].push(...segmentCuts(b.a, b.b, a.a, a.b));
    }
  const nodes = [],
    bins = new Map(),
    edges = new Map();
  const node = p => {
    const x = Math.round(p.x * 1e6),
      y = Math.round(p.y * 1e6);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const q = bins.get(`${x+dx},${y+dy}`);
        if (q && Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) return q;
      }
    if (nodes.length >= 4096) throw new Error('Too many shoreline intersections. Simplify the coast.');
    const q = {
      id: String(nodes.length),
      x: p.x,
      y: p.y
    };
    nodes.push(q);
    bins.set(`${x},${y}`, q);
    return q;
  };
  for (let i = 0; i < segments.length; i++) {
    const ts = cuts[i].sort((a, b) => a - b),
      s = segments[i];
    for (let j = 1; j < ts.length; j++) {
      if (ts[j] - ts[j - 1] < 1e-9) continue;
      const a = node(lerpPoint(s.a, s.b, ts[j - 1])),
        b = node(lerpPoint(s.a, s.b, ts[j]));
      if (a !== b) edges.set([a.id, b.id].sort().join(':'), [a.id, b.id]);
    }
  }
  const byId = new Map(nodes.map(n => [n.id, n])),
    graph = new Map(nodes.map(n => [n.id, []]));
  for (const [a, b] of edges.values()) {
    graph.get(a).push(b);
    graph.get(b).push(a);
  }
  for (const [id, neighbors] of graph) {
    const p = byId.get(id);
    neighbors.sort((a, b) => Math.atan2(byId.get(a).y - p.y, byId.get(a).x - p.x) - Math.atan2(byId.get(b).y - p.y, byId.get(b).x - p.x));
  }
  const seen = new Set();
  let landCount = 0,
    wetCount = 0;
  for (const edge of edges.values())
    for (const pair of [edge, [edge[1], edge[0]]]) {
      if (seen.has(pair.join(':'))) continue;
      let [a, b] = pair;
      const vertices = [];
      for (let step = 0; step <= edges.size * 2; step++) {
        const key = `${a}:${b}`;
        if (seen.has(key)) break;
        seen.add(key);
        vertices.push(a);
        const neighbors = graph.get(b),
          next = neighbors[(neighbors.indexOf(a) + neighbors.length - 1) % neighbors.length];
        a = b;
        b = next;
      }
      if (polygonSignedArea(vertices.map(id => byId.get(id))) < 1e-5) continue;
      const p = waterFaceInterior(vertices, byId);
      if (!pointInPolygon(p, boundary)) continue;
      if (pointInPolygon(p, corridor)) wetCount++;
      else landCount++;
    }
  return {
    landCount,
    wetCount
  };
}
