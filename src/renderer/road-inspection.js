import { roadReportHighlights } from '../core/road-inspection.js';
import { waterFeaturePolygon } from '../core/water-geometry.js';
import { ROAD_IMPACT_COLLECTIONS } from '../core/road-impact-model.js';

const rpColors = {
  safe: '#147d70',
  'needs-review': '#a06109',
  invalid: '#c12d38',
  checking: '#526d9a',
  info: '#62817b',
};
export function drawRoadInspectionOverlay(canvas, camera, city, session) {
  if (!session?.current()) return;
  const ctx = canvas.getContext('2d'),
    graph = session.graph;
  const path = (points, closed = false) => {
    if (!points?.length || !points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)))
      return false;
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = camera.worldToScreen(p);
      if (i) ctx.lineTo(s.x, s.y);
      else ctx.moveTo(s.x, s.y);
    });
    if (closed) ctx.closePath();
    return true;
  };
  const segment = (road, color, width = 3, candidate = false) => {
    if (!road) return;
    const points = [road.a, road.b].map((id) =>
      candidate && id === session.selection?.id ? session.point : graph.nodesById.get(id),
    );
    if (path(points)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  };
  const highlights = roadReportHighlights(session.report);
  const records = new Map();
  for (const [collection, kind] of ROAD_IMPACT_COLLECTIONS)
    for (const record of city[collection] ?? []) records.set(JSON.stringify([kind, record.id]), record);
  if (city.plaza) records.set(JSON.stringify(['plaza', city.plaza.id]), city.plaza);
  const highlight = (row, preserved) => {
    const record = records.get(JSON.stringify([row.kind, row.id]));
    if (!record) return;
    const color = preserved ? '#147d70' : rpColors[row.severity];
    if (row.kind === 'road') {
      segment(record, color, 4);
      return;
    }
    if (row.kind === 'junction') {
      const p = camera.worldToScreen(record);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      return;
    }
    let points = record.boundary ?? record.footprint ?? record.polygon ?? record.path ?? record.points;
    if (row.kind === 'water' && city.waterFeatures.includes(record)) points = waterFeaturePolygon(record);
    if (record.vertices) points = record.vertices.map((id) => graph.nodesById.get(id));
    if (row.kind === 'district') {
      for (const block of city.blocks.filter((b) => b.districtId === row.id))
        highlight({ kind: 'block', id: block.id, severity: row.severity }, preserved);
      return;
    }
    if (!points && record.a && record.b)
      points = [
        typeof record.a === 'string' ? graph.nodesById.get(record.a) : record.a,
        typeof record.b === 'string' ? graph.nodesById.get(record.b) : record.b,
      ];
    if (path(points, true)) {
      ctx.globalAlpha = preserved ? 0.055 : 0.15;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = preserved ? 0.7 : 2;
      ctx.stroke();
    } else if (Number.isFinite((record.center ?? record).x) && Number.isFinite((record.center ?? record).y)) {
      const p = camera.worldToScreen(record.center ?? record);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };
  ctx.save();
  // Preserved block shading is intentionally subtle; affected geometry wins.
  highlights.preserved.filter((r) => r.kind === 'block').forEach((r) => highlight(r, true));
  highlights.affected.forEach((r) => highlight(r, false));
  // B3 overlays only geometry computed from detached B1/B2 candidates.
  if(session.previewVisible!==false){
    for(const row of session.previewGeometry?.rows??[]){
      const color=row.kind==='property'?'#8053a5':row.kind==='plot'?'#168578':'#cf8731';
      const focused=session.focusKey===JSON.stringify([row.kind,row.id]);
      const closed=!['road','junction'].includes(row.kind);
      if(path(row.originalPoints,closed)){
        ctx.strokeStyle='#5d717b';ctx.lineWidth=focused?3:1.4;
        ctx.setLineDash([]);ctx.stroke();
      }
      if(path(row.proposedPoints,closed)){
        ctx.strokeStyle=color;ctx.lineWidth=focused?5:2.8;
        ctx.setLineDash([7,4]);ctx.stroke();ctx.setLineDash([]);
      }
    }
  }
  for (const [id, node] of graph.nodesById) {
    const p = camera.worldToScreen(node),
      protectedNode = graph.incidentRoads.get(id).some((r) => graph.roadClasses.get(r).protected);
    ctx.beginPath();
    ctx.arc(p.x, p.y, protectedNode ? 2.7 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = protectedNode ? '#787b76' : '#315c69';
    ctx.fill();
  }
  const d = session.details;
  if (d?.kind === 'road') segment(d.record, '#315c69', 5);
  if (d?.kind === 'junction') {
    const p = camera.worldToScreen(d.record);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#315c69';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (session.pending) {
    const color = rpColors[session.report?.status] ?? rpColors.checking;
    ctx.setLineDash([7, 5]);
    for (const id of d.roadIds) segment(graph.roadsById.get(id), color, 3, true);
    ctx.setLineDash([]);
    if (Number.isFinite(session.point.x) && Number.isFinite(session.point.y)) {
      const p = camera.worldToScreen(session.point);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}
