import { segmentCuts, insideOrOn } from './boundary.js';
import { terminalRoadIds } from './road-terminal-corridors.js';

// Transient graph API. No accepted city records, persistence or editor history
// are shared with these snapshots. Graph validity alone is NOT city safety:
// faces and dependencies are the separately gated A2/A3 checkpoints.
export const ROAD_GRAPH_LIMITS = Object.freeze({ nodes: 20000, roads: 40000, work: 6000000 });

function roadGraphCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function roadGraphFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) roadGraphFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function roadGraphCopy(value) {
  if (Array.isArray(value)) return value.map(roadGraphCopy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(roadGraphCompare).map(key => [key, roadGraphCopy(value[key])]));
  return value;
}

// Object.freeze(new Map()) still allows .set(). Expose only read operations;
// forEach must also pass the facade rather than leak its backing Map.
function roadGraphReadonlyIndex(map) {
  const index = Object.freeze({
    size: map.size,
    get: key => map.get(key),
    has: key => map.has(key),
    keys: () => map.keys(),
    values: () => map.values(),
    entries: () => map.entries(),
    [Symbol.iterator]: () => map.entries(),
    forEach: fn => map.forEach((value, key) => fn(value, key, index))
  });
  return index;
}

function roadGraphPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) <= 100000 && Math.abs(point.y) <= 100000;
}

export function classifyRoad(road) {
  const reasons = [];
  for (const flag of ['boundary', 'plaza', 'bank', 'waterBoundary', 'foothill', 'terrainBoundary'])
    if (road[flag]) reasons.push(flag);
  if (road.bridgeId) reasons.push('bridge');
  if (road.passId) reasons.push('mountain-pass');
  return roadGraphFreeze({ protected: reasons.length > 0, reasons, kind: road.kind });
}

function roadGraphIssue(code, message, nodeIds = [], roadIds = []) {
  return { code, message, nodeIds: [...nodeIds].sort(roadGraphCompare), roadIds: [...roadIds].sort(roadGraphCompare) };
}

function roadGraphSortIssues(issues) {
  return issues.sort((a, b) => roadGraphCompare(a.code, b.code) || roadGraphCompare(JSON.stringify(a.nodeIds), JSON.stringify(b.nodeIds)) || roadGraphCompare(JSON.stringify(a.roadIds), JSON.stringify(b.roadIds)));
}

export function buildRoadGraph(city) {
  const issues = [], nodes = new Map(), roads = new Map(), adjacency = new Map(), incident = new Map(), classes = new Map();
  const add = (...args) => issues.push(roadGraphIssue(...args));
  const recordsValid = city && Array.isArray(city.nodes) && Array.isArray(city.roads);
  const withinLimits = recordsValid && city.nodes.length <= ROAD_GRAPH_LIMITS.nodes && city.roads.length <= ROAD_GRAPH_LIMITS.roads;
  if (!recordsValid) add('graph-records', 'A road graph requires node and road arrays.');
  else if (!withinLimits) add('graph-limit', 'The road graph exceeds supported node or road limits.');
  // Only index unambiguous records. Never let array order decide which copy of
  // a duplicate ID wins. Accepted records are plain validated project data.
  function indexRecords(records, index, kind) {
    const grouped = new Map();
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || !record.id.length || record.id.length > 200) {
        add(`${kind}-id`, `Every ${kind} needs a nonempty ID of at most 200 characters.`);
        continue;
      }
      if (!grouped.has(record.id)) grouped.set(record.id, []);
      grouped.get(record.id).push(record);
    }
    for (const id of [...grouped.keys()].sort(roadGraphCompare)) {
      const group = grouped.get(id);
      if (group.length !== 1) {
        add(`duplicate-${kind}-id`, `ID ${id} is used by multiple ${kind} records.`, kind === 'node' ? [id] : [], kind === 'road' ? [id] : []);
      } else index.set(id, roadGraphFreeze(roadGraphCopy(group[0])));
    }
  }
  if (withinLimits) {
    indexRecords(city.nodes, nodes, 'node');
    indexRecords(city.roads, roads, 'road');
  }
  if (withinLimits && !nodes.size) add('empty-graph', 'The road network has no junctions.');
  for (const [id, node] of nodes) {
    adjacency.set(id, new Set());
    incident.set(id, []);
    if (!roadGraphPoint(node)) add('node-coordinate', `Junction ${id} has invalid or out-of-range coordinates.`, [id]);
  }
  const edges = new Map(), segments = [];
  for (const [id, road] of roads) {
    classes.set(id, classifyRoad(road));
    if (!['primary', 'secondary', 'lane'].includes(road.kind)) add('road-kind', `Road ${id} has an unsupported class.`, [], [id]);
    const endpointIds = [road.a, road.b].filter(id => typeof id === 'string');
    if (!nodes.has(road.a) || !nodes.has(road.b)) {
      add('missing-endpoint', `Road ${id} references a missing or ambiguous junction.`, endpointIds, [id]);
      continue;
    }
    incident.get(road.a).push(id);
    if (road.a !== road.b) incident.get(road.b).push(id);
    if (road.a === road.b) {
      add('self-loop', `Road ${id} connects a junction to itself.`, [road.a], [id]);
      continue;
    }
    adjacency.get(road.a).add(road.b);
    adjacency.get(road.b).add(road.a);
    const key = JSON.stringify([road.a, road.b].sort(roadGraphCompare));
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push(id);
    const a = nodes.get(road.a), b = nodes.get(road.b);
    if (!roadGraphPoint(a) || !roadGraphPoint(b)) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) {
      add('degenerate-road', `Road ${id} has no usable length.`, endpointIds, [id]);
      continue;
    }
    segments.push({ road, a, b, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
  }
  for (const ids of edges.values()) if (ids.length > 1) add('duplicate-edge', 'Multiple roads connect the same junction pair.', [], ids);
  // Sweep bounding boxes to avoid a full all-pairs scan on ordinary maps.
  // A hard work cap bounds pathological collections of overlapping segments.
  segments.sort((a, b) => a.minX - b.minX || roadGraphCompare(a.road.id, b.road.id));
  let work = 0, limited = false;
  outer: for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (let j = i + 1; j < segments.length && segments[j].minX <= a.maxX + 1e-6; j++) {
      if (++work > ROAD_GRAPH_LIMITS.work) { limited = true; break outer; }
      const b = segments[j];
      if (b.maxY < a.minY - 1e-6 || b.minY > a.maxY + 1e-6) continue;
      const shared = [a.road.a, a.road.b].filter(id => id === b.road.a || id === b.road.b);
      if (shared.length === 2) continue; // Already a duplicate-edge diagnostic.
      const ab = segmentCuts(a.a, a.b, b.a, b.b), ba = segmentCuts(b.a, b.b, a.a, a.b);
      if (!ab.length && !ba.length) continue;
      // A single shared endpoint is allowed, but a collinear interior contact
      // means two roads overlap even when they share that endpoint.
      const interior = [...ab, ...ba].some(t => t > 1e-9 && t < 1 - 1e-9);
      if (!shared.length || interior) add(shared.length ? 'overlapping-roads' : 'unnormalized-crossing',
        shared.length ? 'Roads overlap beyond their shared junction.' : 'Roads cross or touch without a shared junction.', [], [a.road.id, b.road.id]);
    }
  }
  if (limited) add('graph-work-limit', 'Graph analysis exceeded its work budget; the network has not been fully validated.');
  const components = [], reached = new Set();
  for (const id of nodes.keys()) {
    if (reached.has(id)) continue;
    const queue = [id];
    reached.add(id);
    for (let i = 0; i < queue.length; i++) {
      for (const neighbor of adjacency.get(queue[i])) if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
    }
    components.push(queue.sort(roadGraphCompare));
  }
  const terminal = terminalRoadIds(roads.values());
  for (const roadId of terminal)
    if (classes.get(roadId)?.protected)
      add('protected-terminal-corridor', 'A terminal corridor cannot contain protected infrastructure.', [], [roadId]);
  for (const [id, neighbors] of adjacency) {
    if (!neighbors.size) add('orphan-junction', `Junction ${id} is not connected to a road.`, [id]);
    else if (neighbors.size === 1 && (components.length !== 1 ||
      classes.get(incident.get(id)[0])?.protected))
      add('dangling-junction', `Junction ${id} ends without a closed city face.`, [id], incident.get(id));
    adjacency.set(id, Object.freeze([...neighbors].sort(roadGraphCompare)));
    incident.set(id, Object.freeze(incident.get(id).sort(roadGraphCompare)));
  }
  if (components.length > 1) add('disconnected-graph', 'The road network contains disconnected components.', components.map(c => c[0]));
  return Object.freeze({
    nodesById: roadGraphReadonlyIndex(nodes), roadsById: roadGraphReadonlyIndex(roads),
    adjacency: roadGraphReadonlyIndex(adjacency), incidentRoads: roadGraphReadonlyIndex(incident),
    roadClasses: roadGraphReadonlyIndex(classes), components: roadGraphFreeze(components),
    terminalRoadIds: Object.freeze([...terminal].sort(roadGraphCompare)),
    issues: roadGraphFreeze(roadGraphSortIssues(issues)), valid: issues.length === 0,
    work
  });
}

export function analyzeRoadGraph(city) {
  const graph = buildRoadGraph(city);
  return roadGraphFreeze({
    valid: graph.valid, issues: graph.issues,
    nodeCount: graph.nodesById.size, roadCount: graph.roadsById.size,
    components: graph.components,
    protectedRoadIds: [...graph.roadClasses].filter(([, value]) => value.protected).map(([id]) => id)
  });
}

export function proposeJunctionMove(city, junctionId, point) {
  const accepted = buildRoadGraph(city), node = accepted.nodesById.get(junctionId);
  const issues = [...accepted.issues];
  const incidentIds = accepted.incidentRoads.get(junctionId) ?? [];
  if (!node) issues.push(roadGraphIssue('junction-not-found', 'Choose an existing, unambiguous junction.', typeof junctionId === 'string' ? [junctionId] : []));
  if (!roadGraphPoint(point)) issues.push(roadGraphIssue('candidate-coordinate', 'Proposed X/Y must be finite and within supported coordinate bounds.'));
  const protectedIds = incidentIds.filter(id => accepted.roadClasses.get(id).protected);
  const changed = node && roadGraphPoint(point) && (node.x !== point.x || node.y !== point.y);
  if (changed && protectedIds.length) issues.push(roadGraphIssue('protected-junction', 'This junction touches a protected edge. Ordinary road movement cannot rewrite that connection.', [junctionId], protectedIds));
  if (roadGraphPoint(point) && Array.isArray(city?.survey?.boundary) && !insideOrOn(point, city.survey.boundary))
    issues.push(roadGraphIssue('boundary-escape', 'Place the proposed junction inside the accepted city boundary.', node ? [junctionId] : []));
  // Early rejection never offers even a partial candidate from an invalid base.
  if (issues.length) return roadGraphFreeze({ operation: 'move-junction', junctionId, graph: null, graphValid: false, issues: roadGraphSortIssues(issues), changedRoadIds: [], canApplyIn02A: false });
  const graph = buildRoadGraph({
    nodes: [...accepted.nodesById.values()].map(n => n.id === junctionId ? { ...n, x: point.x, y: point.y } : n),
    roads: [...accepted.roadsById.values()]
  });
  return Object.freeze({ operation: 'move-junction', junctionId,
    point: Object.freeze({ x: point.x, y: point.y }), graph, graphValid: graph.valid,
    issues: graph.issues, changedRoadIds: Object.freeze(changed ? [...incidentIds] : []), canApplyIn02A: false });
}
