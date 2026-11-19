import { polygonSignedArea } from './geometry.js';

// Shared with the generator. Preserve its insertion order and microunit
// snapping exactly: generation order remains part of the 0.1 identity contract.
// This builder owns its output nodes; never pass accepted city.nodes here.
export function createRoadNodeNormalizer(nodes, mergeNearby = false) {
  const byCoordinate = new Map();
  return function normalizeNode(p) {
    // Microunit snapping coalesces independently computed multi-way junctions.
    const key = `${Math.round(p.x*1e6)},${Math.round(p.y*1e6)}`;
    if (byCoordinate.has(key)) return byCoordinate.get(key);
    if (mergeNearby) {
      const ix = Math.round(p.x * 1e6),
        iy = Math.round(p.y * 1e6);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const q = byCoordinate.get(`${ix+dx},${iy+dy}`);
          if (q && Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) return q;
        }
    }
    const n = {
      id: `N-${String(nodes.length+1).padStart(4,'0')}`,
      x: p.x,
      y: p.y
    };
    nodes.push(n);
    byCoordinate.set(key, n);
    return n;
  };
}

// Low-level bounded-face traversal for a valid planar graph. Input order is
// intentional for generation parity. Editing callers supply canonical ID order
// after graph validation; this function does not repair or persist a graph.
export function traceRoadFaces(nodes, roads) {
  const byId = new Map(nodes.map(n => [n.id, n])),
    adjacency = new Map(nodes.map(n => [n.id, []]));
  for (const r of roads) {
    adjacency.get(r.a).push(r.b);
    adjacency.get(r.b).push(r.a);
  }
  for (const [id, neighbors] of adjacency) {
    const a = byId.get(id);
    neighbors.sort((b, c) => Math.atan2(byId.get(b).y - a.y, byId.get(b).x - a.x) - Math.atan2(byId.get(c).y - a.y, byId.get(c).x - a.x));
  }
  const visited = new Set(),
    faces = [];
  for (const road of roads)
    for (const pair of [
        [road.a, road.b],
        [road.b, road.a]
      ]) {
      if (visited.has(pair.join(':'))) continue;
      let [a, b] = pair;
      const vertices = [];
      for (let steps = 0; steps <= roads.length * 2; steps++) {
        const key = `${a}:${b}`;
        if (visited.has(key)) break;
        visited.add(key);
        vertices.push(a);
        const neighbors = adjacency.get(b),
          next = neighbors[(neighbors.indexOf(a) + neighbors.length - 1) % neighbors.length];
        a = b;
        b = next;
      }
      const polygon = vertices.map(id => byId.get(id)),
        area = polygonSignedArea(polygon);
      if (area > 1e-6) faces.push({
        vertices,
        area
      });
    }
  return faces;
}
