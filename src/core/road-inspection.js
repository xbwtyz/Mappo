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

const previewCollections = {
  junction:'nodes',road:'roads',block:'blocks',property:'properties',plot:'plots',
  building:'buildings','open-space':'openSpaces',
};
const roadPreviewIndex = (city, kind) => new Map((city?.[previewCollections[kind]] ?? [])
  .map(record => [record.id,record]));
function roadPreviewPoints(nodes, kind, record) {
  if (!record) return null;
  const points = kind === 'junction' ? [record] : kind === 'road' ?
    [nodes.get(record.a),nodes.get(record.b)] : kind === 'block' ?
    record.vertices.map(n=>nodes.get(n)) : record.boundary ?? record.footprint ?? null;
  return Array.isArray(points) && points.length &&
    points.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y))
      ? points.map(p=>({x:p.x,y:p.y})) : null;
}
const roadPreviewArea = (record,points,kind) => {
  if(Number.isFinite(record?.area))return record.area;
  if(kind==='plot' && points?.length>=3){
    let sum=0;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      sum+=a.x*b.y-b.x*a.y;
    }
    return Math.abs(sum/2);
  }
  return null;
};
const roadPreviewFrontage = record => Array.isArray(record?.frontage) && record.frontage.length===2 &&
  record.frontage.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)) ?
  Math.hypot(record.frontage[1].x-record.frontage[0].x,record.frontage[1].y-record.frontage[0].y) : null;
const roadPreviewLength = points => points?.length===2 ?
  Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y) : null;

// Read-only typed geometry inventory shared by B3 UI and renderer. Rejected B2
// candidates may show only independently proven B1 topology, not parcel repairs.
export function roadReconciliationPreviewB3(project,reconciliation,topology=null) {
  const original=project?.city;
  const full=reconciliation?.candidateProject?.city ?? null;
  const candidate=full ?? topology?.candidateProject?.city ?? null;
  const mode=full?'reconciled':candidate?'topology-only':'unavailable';
  const changes=full ? (reconciliation?.changed??[]) : candidate ? (topology?.changed??[]) : [];
  const entries=[];
  const kinds = new Set(changes.map(row => row.kind));
  const beforeNodes = roadPreviewIndex(original, 'junction'), afterNodes = roadPreviewIndex(candidate, 'junction');
  const beforeRecords = new Map([...kinds].map(kind => [kind, roadPreviewIndex(original, kind)]));
  const afterRecords = new Map([...kinds].map(kind => [kind, roadPreviewIndex(candidate, kind)]));
  for(const item of changes){
    const before=beforeRecords.get(item.kind).get(item.id);
    const after=afterRecords.get(item.kind).get(item.id);
    const originalPoints=roadPreviewPoints(beforeNodes,item.kind,before);
    const proposedPoints=roadPreviewPoints(afterNodes,item.kind,after);
    if (!before && !after) continue;
    const oldArea=roadPreviewArea(before,originalPoints,item.kind);
    const newArea=roadPreviewArea(after,proposedPoints,item.kind);
    const oldLength=roadPreviewLength(originalPoints);
    const newLength=roadPreviewLength(proposedPoints);
    const oldFrontage=roadPreviewFrontage(before);
    const newFrontage=roadPreviewFrontage(after);
    if(JSON.stringify(originalPoints)===JSON.stringify(proposedPoints) &&
       oldArea===newArea && oldLength===newLength && oldFrontage===newFrontage)continue;
    entries.push({kind:item.kind,id:item.id,fields:[...(item.fields??[])],
      state:mode==='reconciled'?'reconciled':'topology-only',
      originalPoints,proposedPoints,oldArea,newArea,oldLength,newLength,oldFrontage,newFrontage});
  }
  entries.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
  const counts={roads:0,blocks:0,properties:0,plots:0,buildings:0,openSpaces:0};
  for(const row of entries){
    const field={road:'roads',block:'blocks',property:'properties',plot:'plots',building:'buildings',
      'open-space':'openSpaces'}[row.kind];
    if(field)counts[field]++;
  }
  return {
    mode,rows:entries,counts,
    unresolved:(reconciliation?.unresolved??[]).map(row=>({
      kind:row.kind,id:row.id,code:row.code,message:row.message,severity:row.severity
    })),
    buildingsPreserved:(original?.buildings?.length??0) - entries.filter(row=>row.kind==='building' && row.originalPoints).length,
    verified:!!full && reconciliation?.validation?.project==='valid',
  };
}
