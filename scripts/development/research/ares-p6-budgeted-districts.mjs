import {
  polygonSignedArea,
  pointInPolygon
} from '../../../src/core/geometry.js';

export function districtEdgeKey(a, b) {
  return JSON.stringify([a, b].sort());
}
function districtInteriorPoint(points,spend) {
  charge(spend,3*points.length);
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
      charge(spend,points.length);
      if (pointInPolygon(p, points)) return p;
    }
  }
  throw new Error('A city block has no usable interior point.');
}

function buildDistrictTopology(city,spend) {
  charge(spend,city.nodes.length+2*city.blocks.length+city.roads.length);
  const nodes = new Map(city.nodes.map(n => [n.id, n])),
    blocks = new Map(city.blocks.map(b => [b.id, b]));
  const neighbors = new Map(city.blocks.map(b => [b.id, new Set()])),
    edges = new Map(),
    centers = new Map();
  const roads = new Map(city.roads.map(r => [districtEdgeKey(r.a, r.b), r]));
  for (const block of city.blocks) {
    charge(spend,2*block.vertices.length+1);
    centers.set(block.id, districtInteriorPoint(block.vertices.map(id => nodes.get(id)),spend));
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
  charge(spend,edges.size);
  for (const edge of edges.values())
    if (edge.blockIds.length === 2) {
      const [a, b] = edge.blockIds;
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    }
  const components = [],
    visited = new Set();
  charge(spend,blocks.size);
  for (const id of blocks.keys())
    if (!visited.has(id)) {
      const component = [id];
      visited.add(id);
      for (let i = 0; i < component.length; i++) {
        charge(spend,1+neighbors.get(component[i]).size);
        for (const next of neighbors.get(component[i]))
          if (!visited.has(next)) {
            visited.add(next);
            component.push(next);
          }
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

function districtIsConnected(blockIds, topology,spend) {
  charge(spend,blockIds.length);
  if (!blockIds.length) return false;
  const allowed = new Set(blockIds),
    reached = new Set([blockIds[0]]),
    queue = [blockIds[0]];
  for (let i = 0; i < queue.length; i++) {
    charge(spend,1+(topology.neighbors.get(queue[i])?.size??0));
    for (const next of topology.neighbors.get(queue[i]) || [])
      if (allowed.has(next) && !reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
  }
  return reached.size === allowed.size;
}


const charge=(spend,n)=>spend(Math.max(1,n));
function spendFor(budget){if(!budget?.spend||!budget?.snapshot)throw Error('Shared P6 budget required.');return (n=1)=>budget.spend(n);}
export function validateP6BudgetedDistricts(city,budget) {
  const spend=spendFor(budget);
  const topology=buildDistrictTopology(city,spend);
  charge(spend,1+city.blocks.length+city.properties.length+city.buildings.length+city.districts.length);
  const state = city.districtState;
  if (!state || typeof state !== 'object') throw new Error('Invalid district state.');
  if (state.version !== 1 || !['unassigned', 'assigned'].includes(state.status)) throw new Error('Unsupported district state version. Use a compatible Mappo build.');
  if (state.status === 'unassigned') {
    const ids = new Set(city.districts.map(d => d.id));
    for (const record of [...city.blocks, ...city.properties, ...city.buildings])
      if (record.districtId != null && !ids.has(record.districtId)) throw new Error('Legacy district membership references a missing district.');
    return city;
  }
  if (state.count !== undefined && state.count !== city.districts.length) throw new Error('District count metadata is inconsistent.');
  if (state.requestedCount !== undefined && state.requestedCount !== 'auto') {
    const requested = typeof state.requestedCount === 'number' ? state.requestedCount : typeof state.requestedCount === 'string' && /^\d+$/.test(state.requestedCount) ? Number(state.requestedCount) : NaN;
    if (!Number.isInteger(requested) || requested < 1 || requested > Math.max(12, city.districts.length)) throw new Error('Invalid requested district count.');
  }
  if (state.seed !== undefined && (typeof state.seed !== 'string' || state.seed.length > 64)) throw new Error('Invalid district seed.');
  if (!city.districts.length) throw new Error('Assigned districts cannot be empty.');
  const districtIds = new Set(),
    owners = new Map();
  for (const district of city.districts) {
    if (typeof district.id !== 'string' || !district.id || district.id.length > 128 || districtIds.has(district.id)) throw new Error('Invalid or duplicate district ID.');
    districtIds.add(district.id);
    if (district.dataVersion !== 1 || district.kind !== 'neighborhood') throw new Error('Unsupported district data version or kind.');
    if (typeof district.name !== 'string' || !district.name.trim() || district.name.length > 64) throw new Error('District names must contain 1–64 characters.');
    if (typeof district.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(district.color)) throw new Error('District colors must use a six-digit hex color.');
    if (!Array.isArray(district.blockIds) || !district.blockIds.length || new Set(district.blockIds).size !== district.blockIds.length) throw new Error('A district must contain unique blocks.');
    charge(spend,2*district.blockIds.length);
    for (const id of district.blockIds) {
      if (!topology.blocks.has(id) || owners.has(id)) throw new Error('Districts contain missing or shared blocks.');
      owners.set(id, district.id);
    }
    if (!districtIsConnected(district.blockIds, topology,spend)) throw new Error(`District ${district.name} is disconnected.`);
  }
  if (owners.size !== city.blocks.length) throw new Error('Some city blocks have no district.');
  for (const record of [...city.blocks, ...city.properties, ...city.buildings])
    if (record.districtId !== owners.get(record.blockId ?? record.id)) throw new Error('District membership disagrees with its city block.');
  return city;
}

