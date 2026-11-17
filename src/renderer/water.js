import {
  waterRibbon,
  waterAt,
  waterBridgeGeometry,
  WATER_BANK
} from '../core/water-geometry.js';

function waterDrawPolygon(ctx, camera, polygon, fill, stroke) {
  ctx.beginPath();
  polygon.forEach((p, i) => {
    const q = camera.worldToScreen(p);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}
export function drawWater(ctx, camera, features) {
  for (const feature of features ?? []) {
    waterDrawPolygon(ctx, camera, feature.corridor, '#c8c7ac');
    waterDrawPolygon(ctx, camera, feature.polygon, '#94bbc2', '#6d99a5');
    ctx.beginPath();
    feature.path.forEach((p, i) => {
      const q = camera.worldToScreen(p);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.strokeStyle = 'rgba(231,245,236,.38)';
    ctx.lineWidth = Math.max(.7, feature.width * .10 * camera.zoom);
    ctx.stroke();
  }
}
export function drawBridges(ctx, camera, city) {
  const nodes = new Map(city.nodes.map(n => [n.id, n]));
  for (const road of city.roads.filter(r => r.bridgeId)) {
    const a = camera.worldToScreen(nodes.get(road.a)),
      b = camera.worldToScreen(nodes.get(road.b));
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = 12 * camera.zoom;
    ctx.strokeStyle = '#7e715e';
    ctx.stroke();
    ctx.lineWidth = 9 * camera.zoom;
    ctx.strokeStyle = '#d7c7a7';
    ctx.stroke();
    const length = Math.hypot(b.x - a.x, b.y - a.y),
      nx = -(b.y - a.y) / length,
      ny = (b.x - a.x) / length;
    ctx.beginPath();
    for (let t = 3 * camera.zoom; t < length; t += 5 * camera.zoom) {
      const x = a.x + (b.x - a.x) * t / length,
        y = a.y + (b.y - a.y) * t / length;
      ctx.moveTo(x + nx * 3.8 * camera.zoom, y + ny * 3.8 * camera.zoom);
      ctx.lineTo(x - nx * 3.8 * camera.zoom, y - ny * 3.8 * camera.zoom);
    }
    ctx.lineWidth = .5;
    ctx.strokeStyle = '#aa9678';
    ctx.stroke();
  }
}
export function drawWaterDraft(ctx, camera, editor, boundary) {
  if (!editor || (!editor.dirty && editor.mode === 'pan')) return;
  const f = editor.features[0];
  if (!f) return;
  if (editor.dirty) {
    ctx.globalAlpha = .82;
    try {
      drawWater(ctx, camera, [{
        ...f,
        polygon: waterRibbon(f),
        corridor: waterRibbon(f, WATER_BANK)
      }]);
    } catch {}
    ctx.globalAlpha = 1;
  }
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  f.path.forEach((p, i) => {
    const q = camera.worldToScreen(p);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.strokeStyle = '#326b80';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  if (editor.mode === 'river') f.path.forEach((p, i) => {
    const q = camera.worldToScreen(p);
    ctx.beginPath();
    ctx.arc(q.x, q.y, i === editor.selectedPoint ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = i === editor.selectedPoint ? '#79bed0' : '#f6faf2';
    ctx.fill();
    ctx.strokeStyle = '#326b80';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  for (const bridge of editor.bridges) {
    try {
      const g = waterBridgeGeometry(f, bridge, boundary),
        a = camera.worldToScreen(g.ends[0]),
        b = camera.worldToScreen(g.ends[1]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = bridge.id === editor.selectedBridge ? '#b46a27' : '#5f684f';
      ctx.lineWidth = 4;
      ctx.stroke();
    } catch {}
    try {
      const q = camera.worldToScreen(waterAt(f, bridge.t));
      ctx.beginPath();
      ctx.arc(q.x, q.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = bridge.id === editor.selectedBridge ? '#d8a16a' : '#fff9e9';
      ctx.fill();
      ctx.strokeStyle = '#6e6249';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } catch {}
  }
}
