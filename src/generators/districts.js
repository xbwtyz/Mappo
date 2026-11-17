import {
  createRng
} from '../core/prng.js';
import {
  buildDistrictTopology
} from '../core/district-topology.js';
import {
  applyDistrictMembership,
  validateDistricts
} from '../core/district-model.js';

const DISTRICT_FIRST = ['Copper', 'Alder', 'Willow', 'Fox', 'Rook', 'Stone', 'Lantern', 'Briar', 'Amber', 'Silver', 'Moss', 'Cedar'];
const DISTRICT_LAST = ['Ward', 'Quarter', 'End', 'Commons', 'Reach', 'Borough'];
export const DISTRICT_PALETTE = Object.freeze(['#cba480', '#93b9a0', '#a7afcb', '#c8b575', '#b7a1be', '#8eb6bd', '#c99b9b', '#b5bd8d', '#b0a38f', '#8fa7ba', '#b7a36f', '#a4bcae']);

class DistrictQueue {
  constructor() {
    this.items = [];
    this.order = 0;
  }
  push(item) {
    item.order = this.order++;
    this.items.push(item);
    let i = this.items.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (this.less(this.items[p], item)) break;
      this.items[i] = this.items[p];
      i = p;
    }
    this.items[i] = item;
  }
  less(a, b) {
    return a.cost < b.cost || a.cost === b.cost && a.order < b.order;
  }
  pop() {
    const top = this.items[0],
      last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.items.length && this.less(this.items[c + 1], this.items[c])) c++;
        if (this.less(last, this.items[c])) break;
        this.items[i] = this.items[c];
        i = c;
      }
      this.items[i] = last;
    }
    return top;
  }
  get length() {
    return this.items.length;
  }
}
export function suggestedDistrictCount(city) {
  return Math.min(city.blocks.length, Math.max(3, Math.min(8, Math.round(Math.sqrt(city.blocks.length) / 2))));
}

function districtGraphDistances(topology, seeds, weights) {
  const distance = new Map([...topology.blocks.keys()].map(id => [id, Infinity])),
    queue = new DistrictQueue();
  for (const id of seeds) {
    distance.set(id, 0);
    queue.push({
      id,
      cost: 0
    });
  }
  while (queue.length) {
    const item = queue.pop();
    if (item.cost !== distance.get(item.id)) continue;
    for (const next of topology.neighbors.get(item.id)) {
      const cost = item.cost + weights.get(JSON.stringify([item.id, next].sort()));
      if (cost < distance.get(next)) {
        distance.set(next, cost);
        queue.push({
          id: next,
          cost
        });
      }
    }
  }
  return distance;
}

function generateNeighborhoods(city, {
  seed,
  count
}) {
  const topology = buildDistrictTopology(city),
    rng = createRng(`${seed}:districts:v1`);
  if (!city.blocks.length) throw new Error('Districts require city blocks.');
  const requested = count === 'auto' || count == null ? suggestedDistrictCount(city) : Number(count);
  if (!Number.isInteger(requested) || requested < 1 || requested > Math.max(12, topology.components.length)) throw new Error('Choose an automatic district count or a whole number from 1 to 12.');
  const total = Math.min(city.blocks.length, Math.max(requested, topology.components.length));
  const weights = new Map();
  for (const edge of topology.edges.values())
    if (edge.blockIds.length === 2) {
      const [a, b] = edge.blockIds, key = JSON.stringify([a, b].sort()), roadFactor = edge.road.kind === 'primary' ? 1.8 : edge.road.kind === 'lane' ? .85 : 1.15;
      if (!weights.has(key)) weights.set(key, roadFactor * (.82 + rng() * .36));
    }
  // Farthest graph-distance seeds, followed by connected multi-source growth.
  // Every accepted block has an already-owned predecessor in its district.
  const seeds = topology.components.map(component => component[Math.floor(rng() * component.length)]);
  let nearest = districtGraphDistances(topology, seeds, weights);
  while (seeds.length < total) {
    let best = null,
      bestDistance = -1;
    for (const [id, distance] of nearest)
      if (!seeds.includes(id) && distance > bestDistance) {
        best = id;
        bestDistance = distance;
      } seeds.push(best);
    const next = districtGraphDistances(topology, [best], weights);
    for (const [id, distance] of next) nearest.set(id, Math.min(nearest.get(id), distance));
  }
  const districts = seeds.map((blockId, index) => ({
    id: `DIST-${String(index+1).padStart(3,'0')}`,
    dataVersion: 1,
    kind: 'neighborhood',
    name: '',
    color: DISTRICT_PALETTE[index % DISTRICT_PALETTE.length],
    blockIds: [],
    extensions: {}
  }));
  const names = new Set();
  for (const district of districts) {
    let name;
    let attempts = 0;
    do {
      name = `${DISTRICT_FIRST[Math.floor(rng()*DISTRICT_FIRST.length)]} ${DISTRICT_LAST[Math.floor(rng()*DISTRICT_LAST.length)]}`;
      if (++attempts > 30) name += ` ${names.size+1}`;
    } while (names.has(name));
    names.add(name);
    district.name = name;
  }
  const owners = new Map(),
    distance = new Map(),
    queue = new DistrictQueue();
  seeds.forEach((id, index) => {
    owners.set(id, index);
    distance.set(id, 0);
    queue.push({
      id,
      district: index,
      cost: 0
    });
  });
  while (queue.length) {
    const item = queue.pop();
    if (item.cost !== distance.get(item.id) || owners.get(item.id) !== item.district) continue;
    for (const next of topology.neighbors.get(item.id)) {
      const cost = item.cost + weights.get(JSON.stringify([item.id, next].sort()));
      if (!distance.has(next) || cost < distance.get(next)) {
        owners.set(next, item.district);
        distance.set(next, cost);
        queue.push({
          id: next,
          district: item.district,
          cost
        });
      }
    }
  }
  for (const block of city.blocks) districts[owners.get(block.id)].blockIds.push(block.id);
  const next = applyDistrictMembership(city, districts, {
    version: 1,
    status: 'assigned',
    algorithm: 'adjacency-growth-v1',
    seed,
    requestedCount: count ?? 'auto',
    count: districts.length
  });
  validateDistricts(next, topology);
  return next;
}
export const DISTRICT_ALGORITHMS = Object.freeze({
  'adjacency-growth-v1': generateNeighborhoods
});
export function generateDistricts(city, options = {}) {
  const algorithm = options.algorithm ?? 'adjacency-growth-v1',
    generator = DISTRICT_ALGORITHMS[algorithm];
  if (!generator) throw new Error('This district generation algorithm is unavailable.');
  const seed = String(options.seed ?? city.id).slice(0, 64) || 'districts';
  return generator(city, {
    ...options,
    seed
  });
}
