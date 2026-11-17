import {
  waterFeaturePolygon,
  waterUnionSegments,
  waterSetIntervals,
  waterFrame,
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

function waterDrawSegment(ctx, camera, a, b, color, width) {
  const p = camera.worldToScreen(a),
    q = camera.worldToScreen(b);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
export function drawWater(ctx, camera, features = []) {
  for (const f of features) waterDrawPolygon(ctx, camera, f.corridor, '#c8c7ac');
  for (const f of features) waterDrawPolygon(ctx, camera, f.polygon, '#94bbc2');
  for (const s of waterUnionSegments(features, 'polygon')) {
    const f = features.find(f => f.id === s.featureId);
    waterDrawSegment(ctx, camera, s.a, s.b, f.kind === 'coast' ? '#f1edcf' : '#6d99a5', f.kind === 'coast' ? Math.max(1, 2 * camera.zoom) : 1.2);
  }
  for (const f of features) {
    const others = features.filter(other => other !== f);
    if (f.kind === 'river') {
      for (let i = 1; i < f.path.length; i++)
        for (const s of waterSetIntervals(f.path[i - 1], f.path[i], others, 'polygon'))
          if (!s.inside) waterDrawSegment(ctx, camera, s.a, s.b, 'rgba(231,245,236,.38)', Math.max(.7, f.width * .10 * camera.zoom));
    } else {
      const {
        v
      } = waterFrame(f), sign = f.waterSide === 'left' ? 1 : -1;
      for (const distance of [4, 11]) {
        const path = f.path.map(p => ({
          x: p.x + v.x * sign * distance,
          y: p.y + v.y * sign * distance
        }));
        for (let i = 1; i < path.length; i++)
          for (const s of waterSetIntervals(path[i - 1], path[i], others, 'polygon'))
            if (!s.inside) waterDrawSegment(ctx, camera, s.a, s.b, distance === 4 ? 'rgba(241,239,212,.65)' : 'rgba(224,237,230,.28)', Math.max(.6, .8 * camera.zoom));
      }
    }
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
  const f = editor.activeFeature();
  if (!f) return;
  if (editor.dirty) {
    ctx.globalAlpha = .82;
    try {
      drawWater(ctx, camera, editor.features.map(f => ({
        ...f,
        polygon: waterFeaturePolygon(f),
        corridor: waterFeaturePolygon(f, WATER_BANK)
      })));
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
    const river = editor.features.find(r => r.id === bridge.waterId);
    if (!river) continue;
    try {
      const g = waterBridgeGeometry(river, bridge, boundary),
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
      const q = camera.worldToScreen(waterAt(river, bridge.t));
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
