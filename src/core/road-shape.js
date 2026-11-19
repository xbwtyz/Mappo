import { insideOrOn } from './boundary.js';
import { roadTopologyId } from './road-crossings.js';

const BEND_PREFIX = 'N-BEND-';
export const ROAD_BEND_LIMIT = 24;
const roadShapeEdge = (a, b) => [a,b].sort().join(':');

export function editableRoadPath(graph, roadId) {
  const road = graph?.roadsById.get(roadId);
  if (!graph?.valid || !road || graph.roadClasses.get(road.id).protected) return null;
  const nodes = [road.a, road.b], segments = [road.id], seen = new Set(nodes);
  for (const fromStart of [true, false]) {
    for (;;) {
      const end = fromStart ? 0 : nodes.length - 1;
      const id = nodes[end], incident = graph.incidentRoads.get(id);
      if (!id.startsWith(BEND_PREFIX) || incident.length !== 2) break;
      const next = graph.roadsById.get(incident.find(edge => !segments.includes(edge)));
      if (!next || next.kind !== road.kind || graph.roadClasses.get(next.id).protected) break;
      const other = next.a === id ? next.b : next.a;
      if (seen.has(other) || nodes.length > ROAD_BEND_LIMIT + 1) return null;
      seen.add(other);
      if (fromStart) { nodes.unshift(other); segments.unshift(next.id); }
      else { nodes.push(other); segments.push(next.id); }
    }
  }
  if ([nodes[0],nodes.at(-1)].some(id => graph.incidentRoads.get(id)
    .some(edge => graph.roadClasses.get(edge).protected))) return null;
  if (nodes[0] > nodes.at(-1)) { nodes.reverse(); segments.reverse(); }
  return { points: nodes.map(id=>graph.nodesById.get(id)), segments, kind: road.kind };
}

export function draftRoadShape(city, graph, roadId, points) {
  const path = editableRoadPath(graph, roadId);
  if (!path) throw new Error('Choose a street path with ordinary connections.');
  if (!Array.isArray(points) || points.length > ROAD_BEND_LIMIT)
    throw new Error('A street can have up to ' + ROAD_BEND_LIMIT + ' editable bends.');
  const first = path.points[0], last = path.points.at(-1);
  const existing = new Map(path.points.slice(1,-1).map(point=>[point.id,point]));
  const used = new Set(graph.nodesById.keys()), retained = new Set();
  const next = [first];
  for (const [index,point] of points.entries()) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) ||
        !insideOrOn(point,city.survey.boundary))
      throw new Error('Place every bend at finite coordinates inside the city outline.');
    if (point.id !== null && (!existing.has(point.id) || retained.has(point.id)))
      throw new Error('A bend no longer belongs to the selected path.');
    const id = point.id ?? roadTopologyId('N-BEND',[first.id,last.id,index,point.x,point.y],used);
    retained.add(id);
    next.push({...existing.get(id), id, x:point.x, y:point.y});
  }
  next.push(last);
  for (let i=1;i<next.length;i++)
    if (Math.hypot(next[i].x-next[i-1].x,next[i].y-next[i-1].y) < .05)
      throw new Error('Two neighboring handles are too close together.');

  const oldSegments = path.segments.map(id=>graph.roadsById.get(id));
  const oldByEdge = new Map(oldSegments.map(road=>[roadShapeEdge(road.a,road.b),road]));
  const edges = next.slice(1).map((b,i)=>[next[i].id,b.id]);
  const keepIds = new Set(edges.map(([a,b])=>oldByEdge.get(roadShapeEdge(a,b))?.id));
  const spare = oldSegments.filter(road=>!keepIds.has(road.id));
  const usedEdges = new Set(graph.roadsById.keys());
  const segments = edges.map(([a,b])=>{
    const kept = oldByEdge.get(roadShapeEdge(a,b));
    if (kept) return kept;
    const source = spare.shift();
    return { ...source, id:source?.id ?? roadTopologyId('RD-BEND',[a,b],usedEdges), a,b,kind:path.kind };
  });
  const oldIds = new Set(path.segments), updated = new Map(next.map(point=>[point.id,point]));
  const nodes = city.nodes.filter(point=>!existing.has(point.id) || retained.has(point.id))
    .map(point=>existing.has(point.id) ? updated.get(point.id) : point);
  nodes.push(...next.slice(1,-1).filter(point=>!existing.has(point.id)));
  // Keep accepted ordering for records that survive. This also makes a
  // move + inverse movement stable without reordering unrelated records.
  const remaining = new Map(segments.map(segment=>[segment.id,segment]));
  const roads = city.roads.flatMap(road=>{
    if (!oldIds.has(road.id)) return [road];
    if (!remaining.has(road.id)) return [];
    const replacement = remaining.get(road.id);
    remaining.delete(road.id);
    return [replacement];
  });
  roads.push(...remaining.values());
  return { proposedCity:{...city,nodes,roads}, proposedNodes:next.slice(1,-1) };
}
