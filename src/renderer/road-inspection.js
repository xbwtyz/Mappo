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
  const highlights = session.showRoadDiagnostics ? roadReportHighlights(session.report) : {
    preserved: [],
    affected: session.roadPreviewVerifiedD1 ? [] :
      session.previewGeometry?.unresolved?.length ? session.previewGeometry.unresolved : session.report?.issues ?? [],
  };
  const preservedBlocks = highlights.preserved.filter(row => row.kind === 'block');
  const preview = session.previewGeometry;
  const showPreview = session.previewVisible !== false &&
    (session.roadPreviewVerifiedD1 || preview?.mode === 'topology-only');
  const previewHasFocus = session.focusKey && showPreview && preview?.rows.some(row =>
    session.focusKey === JSON.stringify([row.kind, row.id]));
  const acceptedFocus = session.focusKey && !previewHasFocus ? JSON.parse(session.focusKey) : null;
  const records = new Map();
  if (highlights.affected.length || preservedBlocks.length || session.recoveryFocusD3 || acceptedFocus) {
    for (const [collection, kind] of ROAD_IMPACT_COLLECTIONS)
      for (const record of city[collection] ?? []) records.set(JSON.stringify([kind, record.id]), record);
    if (city.plaza) records.set(JSON.stringify(['plaza', city.plaza.id]), city.plaza);
  }
  const highlight = (row, preserved, focused = false) => {
    const record = records.get(JSON.stringify([row.kind, row.id]));
    if (!record) return;
    const color = focused ? '#075e52' : preserved ? '#147d70' : rpColors[row.severity];
    if (row.kind === 'road') {
      segment(record, color, focused ? 6 : 4);
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
        highlight({ kind: 'block', id: block.id, severity: row.severity }, preserved, focused);
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
      ctx.lineWidth = focused ? 4 : preserved ? 0.7 : 2;
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
  preservedBlocks.forEach(row => highlight(row, true));
  highlights.affected.forEach((r) => highlight(r, false));
  // D3 identifies a verified, accepted obstruction without changing the
  // proposed road geometry or implying that a blocked candidate is safe.
  if (session.recoveryFocusD3)
    highlight({...session.recoveryFocusD3,severity:'invalid'}, false);
  // B3 overlays only geometry computed from detached B1/B2 candidates.
  if (acceptedFocus) {
    const [kind, id] = acceptedFocus;
    highlight({ kind, id }, false, true);
  }
  if (showPreview) {
    for(const row of preview?.rows??[]){
      const color=row.kind==='property'?'#8053a5':row.kind==='plot'?'#168578':row.kind==='building'?'#b45468':row.kind==='road'?'#168f80':'#cf8731';
      const focused=session.focusKey===JSON.stringify([row.kind,row.id]);
      const closed=!['road','junction'].includes(row.kind);
      if (!session.showRoadDiagnostics && !focused && ['property','plot','open-space'].includes(row.kind)) continue;
      if(path(row.originalPoints,closed)){
        ctx.strokeStyle='#5d717b';ctx.lineWidth=focused?3:1.4;
        ctx.setLineDash([]);ctx.stroke();
      }
      if (row.kind === 'junction' && row.proposedPoints?.length === 1) {
        const p = camera.worldToScreen(row.proposedPoints[0]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, focused ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else if(path(row.proposedPoints,closed)){
        if (row.kind === 'block' || row.kind === 'building') {
          ctx.fillStyle = color;
          ctx.globalAlpha = row.kind === 'building' ? .23 : .12;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle=color;ctx.lineWidth=focused?5:2.8;
        ctx.setLineDash([7,4]);ctx.stroke();ctx.setLineDash([]);
      }
    }
  }
  // Highlight a choice target using detached, proven successor geometry.
  // This overlay is not an indication that the candidate passed Apply.
  const ownershipFace = session.reconciliation?.ownershipReview?.find(row=>
    row.candidateKey===session.ownershipFocusKey023);
  if (session.pending && ownershipFace && session.previewVisible!==false &&
      path(ownershipFace.points,true)) {
    ctx.strokeStyle='#075e52';ctx.lineWidth=4;
    ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
  }
  // Road-first C1 shows the user's intended position even when the current
  // parcels, face graph or buildings cannot yet adapt. Draft never reaches Apply.
  const intended=session.roadIntentNodes;
  if(intended && session.pending && session.previewVisible!==false){
    const incident=[...new Set([...intended.keys()].flatMap(id=>
      graph.incidentRoads.get(id)??[]))];
    const position=id=>intended.get(id)??graph.nodesById.get(id);
    ctx.setLineDash([8,5]);
    ctx.strokeStyle='#168f80';ctx.lineWidth=3.5;
    for(const id of incident){
      const road=graph.roadsById.get(id);
      if(path([position(road.a),position(road.b)]))ctx.stroke();
    }
    ctx.setLineDash([]);
    for(const point of intended.values()){
      const p=camera.worldToScreen(point);
      ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);
      ctx.fillStyle='#168f80';ctx.fill();
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.stroke();
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
  if (d?.kind === 'road' && session.roadConnectionEdit && session.roadConnectionEdit.kind !== 'shape' && session.previewVisible !== false) {
    const { kind, endpoint, target } = session.roadConnectionEdit;
    const start = kind === 'add' ? d.record[endpoint] : d.record[endpoint === 'a' ? 'b' : 'a'];
    const ids = kind === 'remove' ? d.endpoints : [start,target];
    if (path(ids.map(id => graph.nodesById.get(id)))) {
      ctx.setLineDash([8,5]);
      ctx.strokeStyle = kind === 'remove' ? rpColors.invalid : '#168f80';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (d?.kind === 'junction') {
    const p = camera.worldToScreen(d.record);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#315c69';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (session.mergeMode) {
    const marks = [
      {id:session.mergeSourceId,color:'#2563eb',label:'Source'},
      {id:session.mergeTargetId,color:'#059669',label:'Target'},
      {id:session.mergeHoverId,color:'#f59e0b',label:'Click'},
    ];
    const seen = new Set();
    for (const mark of marks) {
      if (!mark.id || seen.has(mark.id)) continue;
      seen.add(mark.id);
      const node = graph.nodesById.get(mark.id);
      if (!node) continue;
      const p = camera.worldToScreen(node);
      ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);
      ctx.strokeStyle = mark.color;ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle=mark.color;ctx.font='12px sans-serif';
      ctx.fillText(mark.label+' '+mark.id,p.x+15,p.y-10);
    }
  }
  if (session.snapTargetId && session.drag?.kind === 'junction') {
    const node = graph.nodesById.get(session.snapTargetId);
    if (node) {
      const p = camera.worldToScreen(node);
      ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);
      ctx.strokeStyle='#059669';ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle='#059669';ctx.font='12px sans-serif';
      ctx.fillText('Snap '+node.id,p.x+15,p.y-11);
    }
  }
  if (session.pending && d?.kind==='junction') {
    const color = session.roadPreviewVerifiedD1 ? rpColors.safe : rpColors[session.report?.status] ?? rpColors.checking;
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
  const bends = session.bendPathPoints;
  if (bends && path(bends)) {
    ctx.strokeStyle = '#168f80';
    ctx.lineWidth = 4;
    ctx.setLineDash([8,5]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [index,point] of bends.slice(1,-1).entries()) {
      const p = camera.worldToScreen(point);
      ctx.beginPath();
      ctx.arc(p.x,p.y,index === session.bendEditor.selected ? 8 : 6,0,Math.PI*2);
      ctx.fillStyle = '#168f80';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}
