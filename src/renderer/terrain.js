import {
  terrainPolygon,
  terrainPassAt
} from '../core/terrain-geometry.js';
import {
  boundsOf
} from '../core/geometry.js';

function terrainDrawPath(ctx, camera, path) {
  ctx.beginPath();
  path.forEach((p, i) => {
    const q = camera.worldToScreen(p);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
}
export function drawMountains(ctx, camera, features = []) {
  for (const f of features) {
    terrainDrawPath(ctx, camera, terrainPolygon(f, 9));
    ctx.fillStyle = '#c6c0a2';
    ctx.fill();
    terrainDrawPath(ctx, camera, f.path);
    ctx.fillStyle = '#b7b09a';
    ctx.fill();
    ctx.strokeStyle = '#8c8b75';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    terrainDrawPath(ctx, camera, f.path);
    ctx.clip();
    const b = boundsOf(f.path),
      rx = (b.maxX - b.minX) * .45 * camera.zoom,
      ry = (b.maxY - b.minY) * .45 * camera.zoom;
    for (const [index, peak] of f.ridge.entries()) {
      const q = camera.worldToScreen(peak),
        levels = Math.max(3, Math.min(12, Math.ceil(peak.height / 180)));
      for (let level = levels; level >= 1; level--) {
        const t = level / levels;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, Math.max(1, rx * t * (index === 1 ? 1 : .6)), Math.max(1, ry * t * (index === 1 ? 1 : .6)), 0, 0, Math.PI * 2);
        ctx.fillStyle = level % 2 ? 'rgba(243,235,205,.12)' : 'rgba(69,79,67,.05)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(91,99,78,.34)';
        ctx.lineWidth = .8;
        ctx.stroke();
      }
    }
    ctx.beginPath();
    f.ridge.forEach((peak, i) => {
      const q = camera.worldToScreen(peak);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
    ctx.strokeStyle = '#777c67';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    for (const peak of f.ridge) {
      const q = camera.worldToScreen(peak),
        size = Math.max(4, Math.min(10, peak.height / 180) * camera.zoom);
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - size);
      ctx.lineTo(q.x + size * .85, q.y + size * .6);
      ctx.lineTo(q.x - size * .85, q.y + size * .6);
      ctx.closePath();
      ctx.fillStyle = '#e7dfc5';
      ctx.fill();
      ctx.strokeStyle = '#7c806a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - size);
      ctx.lineTo(q.x, q.y + size * .6);
      ctx.lineTo(q.x + size * .85, q.y + size * .6);
      ctx.closePath();
      ctx.fillStyle = '#92947b';
      ctx.fill();
    }
    ctx.restore();
  }
}
export function drawTerrainDraft(ctx, camera, editor) {
  if (!editor || (!editor.dirty && editor.mode === 'pan')) return;
  const f = editor.activeFeature();
  if (!f) return;
  if (editor.dirty) {
    ctx.globalAlpha = .85;
    drawMountains(ctx, camera, editor.features);
    ctx.globalAlpha = 1;
  }
  terrainDrawPath(ctx, camera, f.path);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#6f775b';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  const handle = (p, selected = false, radius = 5) => {
    const q = camera.worldToScreen(p);
    ctx.beginPath();
    ctx.arc(q.x, q.y, selected ? radius + 2 : radius, 0, Math.PI * 2);
    ctx.fillStyle = selected ? '#d8a268' : '#fff8e1';
    ctx.fill();
    ctx.strokeStyle = '#606b51';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  if (editor.mode === 'shape') f.path.forEach((p, i) => handle(p, i === editor.selectedPoint));
  if (editor.mode === 'ridge') {
    f.ridge.forEach((p, i) => {
      handle(p, i === editor.selectedPoint, 6);
      const q = camera.worldToScreen(p);
      ctx.fillStyle = '#4d5b47';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(p.height), q.x, q.y - 13);
    });
  }
  if (editor.mode === 'move') handle(f.center, true, 9);
  for (const pass of editor.passes.filter(p => p.terrainId === f.id)) try {
    handle(terrainPassAt(f, pass.t), pass.id === editor.selectedPass, 7);
  } catch {}
}
