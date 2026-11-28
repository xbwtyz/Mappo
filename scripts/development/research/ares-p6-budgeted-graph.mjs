import { segmentCuts } from '../../../src/core/boundary.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
// Detached graph accounting pilot. Graph validity is not land or Apply authority.
const charge=(spend,n)=>spend(Math.max(1,n));
const sortCharge=(spend,n)=>charge(spend,n*Math.ceil(Math.log2(n+1)));
function recordCharge(value,spend){
 spend();
 if(typeof value==='string')charge(spend,value.length);
 if(value&&typeof value==='object'){
  const keys=Object.keys(value);sortCharge(spend,keys.length);
  for(const k of keys){charge(spend,k.length);recordCharge(value[k],spend);}
 }
}
function terminalRoadIds(roads,spend) {
  const incident = new Map(), records = new Map();
  for (const road of roads) {
    spend(8);
    records.set(road.id, road);
    for (const id of [road.a, road.b]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(road.id);
    }
  }
  charge(spend,4*incident.size+records.size);
  const degree = new Map([...incident].map(([id, edges]) => [id, edges.length]));
  const active = new Set(records.keys()), removed = new Set();
  const queue = [...degree].filter(([, count]) => count === 1).map(([id]) => id);
  for (let index = 0; index < queue.length; index++) {
    spend();
    const node = queue[index];
    if (degree.get(node) !== 1) continue;
    for (const id of incident.get(node) ?? []) {
      spend();
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

export function* iterateP6BudgetedRoadGraph(city,budget) {
  if(!budget?.spend||!budget?.snapshot)throw Error('Shared P6 budget required.');
  const spend=(n=1)=>budget.spend(n);
  spend();
  const issues = [], nodes = new Map(), roads = new Map(), adjacency = new Map(), incident = new Map(), classes = new Map();
  const add = (...args) => {recordCharge(args,spend); issues.push(roadGraphIssue(...args));};
  const recordsValid = city && Array.isArray(city.nodes) && Array.isArray(city.roads);
  const withinLimits = recordsValid && city.nodes.length <= ROAD_GRAPH_LIMITS.nodes && city.roads.length <= ROAD_GRAPH_LIMITS.roads;
  if (!recordsValid) add('graph-records', 'A road graph requires node and road arrays.');
  else if (!withinLimits) add('graph-limit', 'The road graph exceeds supported node or road limits.');
  // Only index unambiguous records. Never let array order decide which copy of
  // a duplicate ID wins. Accepted records are plain validated project data.
  function* indexRecords(records, index, kind) {
    const grouped = new Map();
    for (let i = 0; i < records.length; i++) {
      if (i % 64 === 0) yield { stage: 'road-graph-index' };
      spend();
      const record = records[i];
      if (!record || typeof record.id !== 'string' || !record.id.length || record.id.length > 200) {
        add(`${kind}-id`, `Every ${kind} needs a nonempty ID of at most 200 characters.`);
        continue;
      }
      if (!grouped.has(record.id)) grouped.set(record.id, []);
      grouped.get(record.id).push(record);
    }
    sortCharge(spend,grouped.size);
    let copied = 0;
    for (const id of [...grouped.keys()].sort(roadGraphCompare)) {
      if (copied++ % 64 === 0) yield { stage: 'road-graph-copy' };
      const group = grouped.get(id);
      if (group.length !== 1) {
        add(`duplicate-${kind}-id`, `ID ${id} is used by multiple ${kind} records.`, kind === 'node' ? [id] : [], kind === 'road' ? [id] : []);
      } else {recordCharge(group[0],spend);index.set(id, roadGraphFreeze(roadGraphCopy(group[0])));}
    }
  }
  if (withinLimits) {
    yield* indexRecords(city.nodes, nodes, 'node');
    yield* indexRecords(city.roads, roads, 'road');
  }
  if (withinLimits && !nodes.size) add('empty-graph', 'The road network has no junctions.');
  for (const [id, node] of nodes) {
    spend(4);
    adjacency.set(id, new Set());
    incident.set(id, []);
    if (!roadGraphPoint(node)) add('node-coordinate', `Junction ${id} has invalid or out-of-range coordinates.`, [id]);
  }
  const edges = new Map(), segments = [];
  for (const [id, road] of roads) {
    spend(16);
    yield { stage: 'road-graph-edge', id };
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
  charge(spend,edges.size);
  for (const ids of edges.values()) if (ids.length > 1) add('duplicate-edge', 'Multiple roads connect the same junction pair.', [], ids);
  // Sweep bounding boxes to avoid a full all-pairs scan on ordinary maps.
  // A hard work cap bounds pathological collections of overlapping segments.
  sortCharge(spend,segments.length);
  segments.sort((a, b) => a.minX - b.minX || roadGraphCompare(a.road.id, b.road.id));
  let work = 0, limited = false;
  outer: for (let i = 0; i < segments.length; i++) {
    spend();
    const a = segments[i];
    for (let j = i + 1; j < segments.length && segments[j].minX <= a.maxX + 1e-6; j++) {
      spend();
      if (++work > ROAD_GRAPH_LIMITS.work) { limited = true; break outer; }
      if (work % 64 === 0) yield { stage: 'road-graph-intersections' };
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
    spend();
    if (reached.has(id)) continue;
    const queue = [id];
    reached.add(id);
    for (let i = 0; i < queue.length; i++) {
      charge(spend,1+adjacency.get(queue[i]).size);
      for (const neighbor of adjacency.get(queue[i])) if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
    }
    sortCharge(spend,queue.length);
    components.push(queue.sort(roadGraphCompare));
  }
  const terminal = terminalRoadIds(roads.values(),spend);
  charge(spend,terminal.size);
  for (const roadId of terminal)
    if (classes.get(roadId)?.protected)
      add('protected-terminal-corridor', 'A terminal corridor cannot contain protected infrastructure.', [], [roadId]);
  for (const [id, neighbors] of adjacency) {
    charge(spend,1+neighbors.size+incident.get(id).length);
    sortCharge(spend,neighbors.size);sortCharge(spend,incident.get(id).length);
    if (!neighbors.size) add('orphan-junction', `Junction ${id} is not connected to a road.`, [id]);
    else if (neighbors.size === 1 && (components.length !== 1 ||
      classes.get(incident.get(id)[0])?.protected))
      add('dangling-junction', `Junction ${id} ends without a closed city face.`, [id], incident.get(id));
    adjacency.set(id, Object.freeze([...neighbors].sort(roadGraphCompare)));
    incident.set(id, Object.freeze(incident.get(id).sort(roadGraphCompare)));
  }
  if (components.length > 1) add('disconnected-graph', 'The road network contains disconnected components.', components.map(c => c[0]));
  charge(spend,nodes.size+roads.size+components.length);
  sortCharge(spend,terminal.size);sortCharge(spend,issues.length);
  for(const issue of issues)recordCharge(issue,spend);
  return Object.freeze({
    nodesById: roadGraphReadonlyIndex(nodes), roadsById: roadGraphReadonlyIndex(roads),
    adjacency: roadGraphReadonlyIndex(adjacency), incidentRoads: roadGraphReadonlyIndex(incident),
    roadClasses: roadGraphReadonlyIndex(classes), components: roadGraphFreeze(components),
    terminalRoadIds: Object.freeze([...terminal].sort(roadGraphCompare)),
    issues: roadGraphFreeze(roadGraphSortIssues(issues)), valid: issues.length === 0,
    work
  });
}

export function buildP6BudgetedRoadGraph(city,budget) {
  const iterator = iterateP6BudgetedRoadGraph(city,budget);
  for (let step = iterator.next(); ; step = iterator.next()) {
    if (step.done) return step.value;
  }
}

