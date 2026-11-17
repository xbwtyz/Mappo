import {
  polygonSignedArea,
  pointInPolygon
} from './geometry.js';

export function districtEdgeKey(a, b) {
  return JSON.stringify([a, b].sort());
}
export function districtInteriorPoint(points) {
  let x = 0,
    y = 0;
  const area = polygonSignedArea(points);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      cross = a.x * b.y - b.x * a.y;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  const centroid = {
    x: x / (6 * area),
    y: y / (6 * area)
  };
  if (pointInPolygon(centroid, points)) return centroid;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let scale = .01; scale > 1e-10; scale /= 10) {
      const p = {
        x: (a.x + b.x) / 2 - (b.y - a.y) * scale,
        y: (a.y + b.y) / 2 + (b.x - a.x) * scale
      };
      if (pointInPolygon(p, points)) return p;
    }
  }
  throw new Error('A city block has no usable interior point.');
}

export function buildDistrictTopology(city) {
  const nodes = new Map(city.nodes.map(n => [n.id, n])),
    blocks = new Map(city.blocks.map(b => [b.id, b]));
  const neighbors = new Map(city.blocks.map(b => [b.id, new Set()])),
    edges = new Map(),
    centers = new Map();
  const roads = new Map(city.roads.map(r => [districtEdgeKey(r.a, r.b), r]));
  for (const block of city.blocks) {
    centers.set(block.id, districtInteriorPoint(block.vertices.map(id => nodes.get(id))));
    for (let i = 0; i < block.vertices.length; i++) {
      const a = block.vertices[i],
        b = block.vertices[(i + 1) % block.vertices.length],
        key = districtEdgeKey(a, b);
      const edge = edges.get(key) || {
        a,
        b,
        road: roads.get(key),
        blockIds: []
      };
      edge.blockIds.push(block.id);
      edges.set(key, edge);
    }
  }
  for (const edge of edges.values())
    if (edge.blockIds.length === 2) {
      const [a, b] = edge.blockIds;
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }
  const components = [],
    visited = new Set();
  for (const id of blocks.keys())
    if (!visited.has(id)) {
      const component = [id];
      visited.add(id);
      for (let i = 0; i < component.length; i++)
        for (const next of neighbors.get(component[i]))
          if (!visited.has(next)) {
            visited.add(next);
            component.push(next);
          }
      components.push(component);
    }
  return {
    nodes,
    blocks,
    neighbors,
    edges,
    centers,
    components
  };
}

export function districtIsConnected(blockIds, topology) {
  if (!blockIds.length) return false;
  const allowed = new Set(blockIds),
    reached = new Set([blockIds[0]]),
    queue = [blockIds[0]];
  for (let i = 0; i < queue.length; i++)
    for (const next of topology.neighbors.get(queue[i]) || [])
      if (allowed.has(next) && !reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
  return reached.size === allowed.size;
}

export function districtSummary(city, district, topology = buildDistrictTopology(city)) {
  const ids = new Set(district.blockIds),
    points = district.blockIds.map(id => topology.centers.get(id));
  let area = 0,
    x = 0,
    y = 0;
  for (const id of district.blockIds) {
    const weight = topology.blocks.get(id).area,
      p = topology.centers.get(id);
    area += weight;
    x += p.x * weight;
    y += p.y * weight;
  }
  const center = {
    x: x / area,
    y: y / area
  };
  const label = points.reduce((best, p) => Math.hypot(p.x - center.x, p.y - center.y) < Math.hypot(best.x - center.x, best.y - center.y) ? p : best, points[0]);
  return {
    blocks: ids.size,
    properties: city.properties.filter(p => ids.has(p.blockId)).length,
    buildings: city.buildings.filter(b => ids.has(b.blockId)).length,
    area,
    label
  };
}
