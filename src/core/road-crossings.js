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

// Remove only *exactly* coincident ordinary endpoint identities from a detached
// candidate. A protected road, opaque metadata, or protected face reference is
// an explicit conflict: never guess which accepted identity should survive.
function consolidateCoincidentEndpointsC3(city, draft) {
  if (draft.valid || draft.issues.some(issue => issue.code !== 'unnormalized-crossing'))
    return { city, replaced: [] };
  const byPosition = new Map();
  for (const node of city.nodes) {
    // Exact coordinates: this must not become proximity snapping or movement.
    const key = JSON.stringify([node.x, node.y]);
    if (!byPosition.has(key)) byPosition.set(key, []);
    byPosition.get(key).push(node);
  }
  const replacement = new Map();
  const protectedFaceIds = new Set([
    ...(city.plaza?.vertices ?? []),
    ...(city.waterFaces ?? []).flatMap(face => face.vertices),
    ...(city.terrainFaces ?? []).flatMap(face => face.vertices),
  ]);
  const groups = [...byPosition.values()].filter(nodes => nodes.length > 1);
  for (const group of groups) {
    const ids = group.map(node => node.id).sort();
    if (group.some(node => !draft.incidentRoads.get(node.id)?.length))
      throw new Error('A coincident junction has no connected road.');
    if (group.some(node => draft.incidentRoads.get(node.id).some(id => draft.roadClasses.get(id)?.protected)))
      throw new Error('Coincident junctions touch protected infrastructure.');
    if (group.some(node => Object.keys(node).some(key => !['id','x','y'].includes(key))))
      throw new Error('Coincident junction metadata requires an explicit identity decision.');
    if (ids.some(id => protectedFaceIds.has(id)))
      throw new Error('Coincident junctions would rewrite protected face ownership.');
    for (const id of ids.slice(1)) replacement.set(id, ids[0]);
  }
  if (!replacement.size) return { city, replaced: [] };
  const roads = city.roads.map(road => ({
    ...road, a: replacement.get(road.a) ?? road.a, b: replacement.get(road.b) ?? road.b,
  }));
  // Do not turn a road into a self-loop or merge separately authored roads.
  if (roads.some(road => road.a === road.b))
    throw new Error('Coincident junction consolidation would collapse a street.');
  const usedEdges = new Set();
  for (const road of roads) {
    const key = JSON.stringify([road.a,road.b].sort());
    if (usedEdges.has(key)) throw new Error('Coincident junction consolidation would duplicate a street.');
    usedEdges.add(key);
  }
  return {
    city: { ...city, nodes: city.nodes.filter(node => !replacement.has(node.id)), roads },
    replaced: [...replacement].sort((a,b)=>a[0].localeCompare(b[0])),
  };
}

export function normalizeRoadCrossingsC3(city) {
  const before = buildRoadGraph(city);
  if (before.valid) return { city, graph: before, splitRoadIds: [], junctionIds: [], consolidatedNodeIds: [] };
  // Never rescue disconnected/invalid networks by merging unrelated endpoints.
  const consolidated = consolidateCoincidentEndpointsC3(city, before);
  const candidate = consolidated.city;
  const draft = buildRoadGraph(candidate);
  const consolidatedNodeIds = consolidated.replaced.map(([id]) => id);
  if (draft.valid) return {
    city: candidate, graph: draft, splitRoadIds: [], junctionIds: [], consolidatedNodeIds,
  };
  const crossings = draft.issues.filter(issue => issue.code === 'unnormalized-crossing');
  if (crossings.length !== draft.issues.length || crossings.length > C3_MAX_CROSSINGS)
    throw new Error(draft.issues[0].message);
  const cuts = new Map();
  const usedNodes = new Set(draft.nodesById.keys());
  const usedRoads = new Set(draft.roadsById.keys());
  const junctions = [];
  const anchoredContacts = [];
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
    if (endR && endS && endR !== endS)
      throw new Error('Two existing corners coincide but cannot safely be consolidated.');
    const x = a.x + t*(b.x-a.x), y = a.y + t*(b.y-a.y);
    const existingIndex = junctions.findIndex(node => Math.hypot(node.x-x, node.y-y) <= 1e-7);
    const existing = existingIndex < 0 ? null : junctions[existingIndex];
    const prior = anchoredContacts.find(contact => Math.hypot(contact.x-x,contact.y-y)<=1e-7);
    if (prior && (endR || endS) && prior.id !== (endR ?? endS))
      throw new Error('Conflicting accepted junction IDs share an intersection.');
    const acceptedId = endR ?? endS ?? prior?.id;
    if ((endR || endS) && !prior) anchoredContacts.push({x,y,id:acceptedId});
    if (existing && acceptedId && existing.id !== acceptedId) {
      // A multi-contact crossing may first be discovered through two road
      // interiors, then through an existing endpoint. Rebind all earlier
      // draft-only cuts to that accepted endpoint and drop the temporary ID.
      for (const byNode of cuts.values()) {
        if (!byNode.has(existing.id)) continue;
        const at = byNode.get(existing.id);
        byNode.delete(existing.id);
        if (byNode.has(acceptedId) && Math.abs(byNode.get(acceptedId)-at) > 1e-8)
          throw new Error('Multiple street contacts have inconsistent junction positions.');
        byNode.set(acceptedId, at);
      }
      junctions.splice(existingIndex,1);
      usedNodes.delete(existing.id);
    }
    const id = acceptedId ?? existing?.id ?? roadTopologyId('N-X', [first, second], usedNodes);
    if (!acceptedId && !existing) junctions.push({ id, x, y });
    for (const [road, at, end] of [[r, t, endR], [s, u, endS]]) {
      if (end) continue;
      if (!cuts.has(road.id)) cuts.set(road.id, new Map());
      if (cuts.get(road.id).has(id) && Math.abs(cuts.get(road.id).get(id)-at)>1e-8)
        throw new Error('A street has multiple incompatible cuts at one junction.');
      cuts.get(road.id).set(id, at);
    }
  }
  const roads = candidate.roads.flatMap(road => {
    if (!cuts.has(road.id)) return [road];
    const ids = [road.a, ...[...cuts.get(road.id)].sort((a,b)=>a[1]-b[1]).map(([id])=>id), road.b];
    return ids.slice(1).map((b, index) => ({
      ...road, a: ids[index], b,
      id: index === 0 ? road.id : roadTopologyId('RD-X', [road.id, ids[index], b], usedRoads),
    }));
  });
  const normalized = { ...candidate, roads, nodes: [...candidate.nodes, ...junctions] };
  const graph = buildRoadGraph(normalized);
  if (!graph.valid) throw new Error(graph.issues[0].message);
  return { city: normalized, graph, splitRoadIds: [...cuts.keys()].sort(),
    junctionIds: junctions.map(node => node.id), consolidatedNodeIds };
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