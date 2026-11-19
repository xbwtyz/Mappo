import { segmentCuts } from './boundary.js';
import { buildRoadGraph } from './road-graph.js';
import { hashSeed } from './prng.js';

const C3_MAX_CROSSINGS = 24;

export function roadTopologyId(prefix, key, used) {
  const base = prefix + '-' + hashSeed(JSON.stringify(key)).toString(36);
  let id = base, suffix = 1;
  while (used.has(id)) id = base + '-' + ++suffix;
  used.add(id);
  return id;
}

export function normalizeRoadCrossingsC3(city) {
  const draft = buildRoadGraph(city);
  if (draft.valid) return { city, graph: draft, splitRoadIds: [], junctionIds: [] };
  const crossings = draft.issues.filter(issue => issue.code === 'unnormalized-crossing');
  if (crossings.length !== draft.issues.length || crossings.length > C3_MAX_CROSSINGS)
    throw new Error(draft.issues[0].message);
  const cuts = new Map();
  const usedNodes = new Set(draft.nodesById.keys());
  const usedRoads = new Set(draft.roadsById.keys());
  const junctions = [];
  const endpoint = (road, t) => t <= 1e-8 ? road.a : t >= 1 - 1e-8 ? road.b : null;
  for (const { roadIds: [first, second] } of crossings) {
    if ([first, second].some(id => draft.roadClasses.get(id).protected))
      throw new Error('This crossing touches protected infrastructure.');
    const r = draft.roadsById.get(first), s = draft.roadsById.get(second);
    const a = draft.nodesById.get(r.a), b = draft.nodesById.get(r.b);
    const c = draft.nodesById.get(s.a), d = draft.nodesById.get(s.b);
    const [t, extra] = segmentCuts(a, b, c, d);
    const [u, extraReverse] = segmentCuts(c, d, a, b);
    const cross = (b.x-a.x)*(d.y-c.y) - (b.y-a.y)*(d.x-c.x);
    if (Math.abs(cross) <= 1e-8 || t === undefined || u === undefined ||
        extra !== undefined || extraReverse !== undefined)
      throw new Error('Overlapping streets need a different placement.');
    const endR = endpoint(r, t), endS = endpoint(s, u);
    if (endR && endS) throw new Error('Two existing corners coincide. Offset the street to create a distinct junction.');
    const x = a.x + t*(b.x-a.x), y = a.y + t*(b.y-a.y);
    const existing = junctions.find(node => Math.hypot(node.x-x, node.y-y) <= 1e-7);
    if (existing && (endR || endS)) throw new Error('Multiple contacts share an existing junction.');
    const id = endR ?? endS ?? existing?.id ?? roadTopologyId('N-X', [first, second], usedNodes);
    if (!endR && !endS && !existing) junctions.push({ id, x, y });
    for (const [road, at, end] of [[r, t, endR], [s, u, endS]]) {
      if (end) continue;
      if (!cuts.has(road.id)) cuts.set(road.id, new Map());
      cuts.get(road.id).set(id, at);
    }
  }
  const roads = city.roads.flatMap(road => {
    if (!cuts.has(road.id)) return [road];
    const ids = [road.a, ...[...cuts.get(road.id)].sort((a,b)=>a[1]-b[1]).map(([id])=>id), road.b];
    return ids.slice(1).map((b, index) => ({
      ...road, a: ids[index], b,
      id: index === 0 ? road.id : roadTopologyId('RD-X', [road.id, ids[index], b], usedRoads),
    }));
  });
  const normalized = { ...city, roads, nodes: [...city.nodes, ...junctions] };
  const graph = buildRoadGraph(normalized);
  if (!graph.valid) throw new Error(graph.issues[0].message);
  return { city: normalized, graph, splitRoadIds: [...cuts.keys()].sort(), junctionIds: junctions.map(node => node.id) };
}

export function draftRoadConnectionC3(city, roadId, edit) {
  const graph = buildRoadGraph(city);
  const road = graph.roadsById.get(roadId);
  const kind = edit?.kind;
  if (!graph.valid || !road || !['remove', 'reconnect', 'add'].includes(kind))
    throw new Error('Choose an ordinary street and a supported connection edit.');
  const editable = id => graph.incidentRoads.get(id)?.every(edge => !graph.roadClasses.get(edge).protected);
  if (![road.a, road.b].every(editable))
    throw new Error('This street touches protected infrastructure.');
  let roads = city.roads.filter(record => record.id !== roadId);
  if (kind !== 'remove') {
    const { endpoint, target } = edit;
    if (!['a', 'b'].includes(endpoint) || !editable(target) || [road.a, road.b].includes(target))
      throw new Error('Choose a different ordinary junction as the target.');
    const rerouted = { ...road, [kind === 'add' ? (endpoint === 'a' ? 'b' : 'a') : endpoint]: target };
    if (kind === 'add') {
      rerouted.id = roadTopologyId('RD-NEW', [rerouted.a, rerouted.b], new Set(graph.roadsById.keys()));
      roads = [...city.roads, rerouted];
    } else {
      roads = city.roads.map(record => record.id === roadId ? rerouted : record);
    }
  }
  return { proposedCity: { ...city, roads }, proposedNodes: [] };
}
