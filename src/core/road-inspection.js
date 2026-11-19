import { distanceToSegment } from './boundary.js';

// Selection and presentation only. A1 owns eligibility; A3 owns impact status.
export function roadInspectionDetails(graph, selection) {
  if (!selection) return null;
  const junction = selection.kind === 'junction';
  const record = (junction ? graph.nodesById : graph.roadsById).get(selection.id);
  if (!record) return null;
  const roadIds = junction ? graph.incidentRoads.get(record.id) : [record.id];
  const classes = roadIds.map((id) => graph.roadClasses.get(id));
  return {
    ...selection,
    record,
    roadIds,
    endpoints: junction ? [...graph.adjacency.get(record.id)] : [record.a, record.b],
    classes: [...new Set(classes.map((c) => c.kind))],
    reasons: [...new Set(classes.flatMap((c) => c.reasons))],
    protected: classes.some((c) => c.protected),
    movable: junction && graph.valid && roadIds.length > 0 && classes.every((c) => !c.protected),
  };
}

export function hitRoadInspection(graph, point, zoom, pointerType = 'mouse', draft = null) {
  const radius = (pointerType === 'touch' ? 22 : 10) / zoom;
  if (
    draft &&
    Number.isFinite(draft.point?.x) &&
    Number.isFinite(draft.point?.y) &&
    Math.hypot(point.x - draft.point.x, point.y - draft.point.y) <= radius
  )
    return { kind: 'junction', id: draft.id };
  let hit = null,
    best = radius;
  for (const [id, node] of graph.nodesById) {
    const distance = Math.hypot(point.x - node.x, point.y - node.y);
    if (distance <= best) {
      hit = { kind: 'junction', id };
      best = distance;
    }
  }
  if (hit) return hit;
  best = (pointerType === 'touch' ? 22 : 7) / zoom;
  for (const [id, road] of graph.roadsById) {
    const a = graph.nodesById.get(road.a),
      b = graph.nodesById.get(road.b);
    if (!a || !b) continue;
    const distance = distanceToSegment(point, a, b);
    if (distance <= best) {
      hit = { kind: 'road', id };
      best = distance;
    }
  }
  return hit;
}

// Typed IDs are essential: different accepted collections may reuse an ID.
export function roadReportHighlights(report) {
  const rank = { info: 0, 'needs-review': 1, invalid: 2 },
    affected = new Map();
  for (const row of report?.affected ?? []) {
    const key = JSON.stringify([row.kind, row.id]),
      old = affected.get(key);
    if (!old || rank[row.severity] > rank[old.severity])
      affected.set(key, { kind: row.kind, id: row.id, severity: row.severity });
  }
  return {
    affected: [...affected.values()],
    preserved: (report?.preservedObjects ?? []).filter(
      (row) => !affected.has(JSON.stringify([row.kind, row.id])),
    ),
  };
}
