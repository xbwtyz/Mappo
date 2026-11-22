import { insideOrOn } from './boundary.js';
import { segmentDistance, STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK } from './placement.js';

// A dead-end corridor is a leaf chain of ordinary road edges outside the
// cycle-bearing road network. This is structural analysis only: it neither
// changes project records nor grants frontage to adjoining development.
export function terminalRoadIds(roads) {
  const incident = new Map(), records = new Map();
  for (const road of roads) {
    records.set(road.id, road);
    for (const id of [road.a, road.b]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(road.id);
    }
  }
  const degree = new Map([...incident].map(([id, edges]) => [id, edges.length]));
  const active = new Set(records.keys()), removed = new Set();
  const queue = [...degree].filter(([, count]) => count === 1).map(([id]) => id);
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    if (degree.get(node) !== 1) continue;
    for (const id of incident.get(node) ?? []) {
      if (!active.delete(id)) continue;
      removed.add(id);
      const edge = records.get(id), neighbor = edge.a === node ? edge.b : edge.a;
      degree.set(node, 0);
      const count = degree.get(neighbor) - 1;
      degree.set(neighbor, count);
      if (count === 1) queue.push(neighbor);
    }
  }
  return removed;
}

// Terminal roads are physical corridors even though they do not divide faces.
// Return a bounded, schema-free view; never persist this derived information.
export function terminalCorridors(city) {
  const ids = terminalRoadIds(city.roads);
  if (!ids.size) return [];
  const nodes = new Map(city.nodes.map(node => [node.id, node]));
  return city.roads.filter(road => ids.has(road.id)).map(road => ({
    id: road.id, road, a: nodes.get(road.a), b: nodes.get(road.b),
    margin: (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK,
  }));
}

// A polygon may completely contain the street without any edge intersection;
// check both endpoint containment and buffered boundary/segment distance.
export function polygonIntrudesTerminalCorridor(polygon, corridors) {
  for (const corridor of corridors) {
    const { a, b, margin } = corridor;
    if (!a || !b || !Number.isFinite(margin)) return corridor.id;
    if (insideOrOn(a, polygon) || insideOrOn(b, polygon)) return corridor.id;
    for (let i = 0; i < polygon.length; i++) {
      if (segmentDistance(polygon[i], polygon[(i + 1) % polygon.length], a, b) < margin - 1e-5)
        return corridor.id;
    }
  }
  return null;
}
