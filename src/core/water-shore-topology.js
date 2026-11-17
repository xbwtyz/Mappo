import {
  lakeAccessSegments
} from './lake-geometry.js';
import {
  segmentCuts,
  lerpPoint,
  insideOrOn
} from './boundary.js';
import {
  waterUnionSegments,
  waterSetContains,
  waterSetBoundary,
  waterBridgeGeometry
} from './water-geometry.js';

// Connectivity of dry perimeter/quays plus proposed crossings, before a street
// pattern is generated. Virtual edges across water are deliberately excluded.
export function waterShoreComponents(boundary, features, bridges) {
  const segments = [...lakeAccessSegments(features, boundary), ...boundary.map((a, i) => ({
    a,
    b: boundary[(i + 1) % boundary.length],
    kind: 'boundary'
  })), ...waterUnionSegments(features).map(s => ({
    ...s,
    kind: 'bank'
  })), ...bridges.map(b => {
    const g = waterBridgeGeometry(features.find(f => f.id === b.waterId), b, boundary);
    return {
      a: g.ends[0],
      b: g.ends[1],
      kind: 'bridge'
    };
  })];
  const cuts = segments.map(() => [0, 1]);
  let work = 400000;
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      if (--work < 0) throw new Error('Waterfront geometry is too complex. Simplify its points.');
      const a = segments[i],
        b = segments[j];
      cuts[i].push(...segmentCuts(a.a, a.b, b.a, b.b));
      cuts[j].push(...segmentCuts(b.a, b.b, a.a, a.b));
    }
  const bins = new Map(),
    graph = new Map();
  let sequence = 0;
  const node = p => {
    const x = Math.round(p.x * 1e6),
      y = Math.round(p.y * 1e6);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const n = bins.get(`${x+dx},${y+dy}`);
        if (n && Math.hypot(n.x - p.x, n.y - p.y) < 1e-6) return n;
      }
    if (sequence > 4096) throw new Error('Too many waterfront intersections.');
    const n = {
      ...p,
      id: sequence++
    };
    bins.set(`${x},${y}`, n);
    graph.set(n.id, new Set());
    return n;
  };
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i],
      ts = cuts[i].sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      if (ts[j] - ts[j - 1] < 1e-9) continue;
      const mid = lerpPoint(s.a, s.b, (ts[j] + ts[j - 1]) / 2);
      if (s.kind !== 'bridge' && (!insideOrOn(mid, boundary) || (s.kind === 'bank' ? !waterSetBoundary(mid, features) : waterSetContains(mid, features)))) continue;
      const a = node(lerpPoint(s.a, s.b, ts[j - 1])),
        b = node(lerpPoint(s.a, s.b, ts[j]));
      if (a === b) continue;
      graph.get(a.id).add(b.id);
      graph.get(b.id).add(a.id);
    }
  }
  let count = 0;
  const seen = new Set();
  for (const [id, neighbors] of graph)
    if (neighbors.size && !seen.has(id)) {
      count++;
      const q = [id];
      seen.add(id);
      for (let i = 0; i < q.length; i++)
        for (const n of graph.get(q[i]))
          if (!seen.has(n)) {
            seen.add(n);
            q.push(n);
          }
    }
  return count;
}
