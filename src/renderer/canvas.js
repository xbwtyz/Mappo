import { clamp } from '../core/geometry.js';

const INK = '#34494b';
const ACCENT = '#bb8152';

function line(ctx, a, b) {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

export function renderMap(canvas, camera, project) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const width = camera.width;
  const height = camera.height;
  const physicalW = Math.max(1, Math.round(width * dpr));
  const physicalH = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== physicalW || canvas.height !== physicalH) {
    canvas.width = physicalW;
    canvas.height = physicalH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#efeadc';
  ctx.fillRect(0, 0, width, height);

  // The measurement grid belongs to world coordinates and moves with the camera.
  const topLeft = camera.screenToWorld({ x: 0, y: 0 });
  const bottomRight = camera.screenToWorld({ x: width, y: height });
  const intervals = [10, 20, 50, 100, 200, 500, 1000];
  const gridStep = intervals.find(step => step * camera.zoom >= 27) ?? 1000;
  const xStart = Math.floor(topLeft.x / gridStep);
  const xEnd = Math.ceil(bottomRight.x / gridStep);
  const yStart = Math.floor(topLeft.y / gridStep);
  const yEnd = Math.ceil(bottomRight.y / gridStep);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(80, 85, 74, 0.095)';
  ctx.beginPath();
  for (let i = xStart; i <= xEnd && i < xStart + 180; i++) {
    const x = camera.worldToScreen({ x: i * gridStep, y: 0 }).x;
    line(ctx, { x, y: 0 }, { x, y: height });
  }
  for (let i = yStart; i <= yEnd && i < yStart + 180; i++) {
    const y = camera.worldToScreen({ x: 0, y: i * gridStep }).y;
    line(ctx, { x: 0, y }, { x: width, y });
  }
  ctx.stroke();

  const survey = project.city.survey;
  const center = camera.worldToScreen({ x: 0, y: 0 });
  const scale = survey.nominalRadius * camera.zoom;
  // Draft site rings: these are survey guides, not roads.
  ctx.setLineDash([3, 9]);
  ctx.strokeStyle = 'rgba(167, 120, 76, 0.24)';
  ctx.lineWidth = 1;
  for (const factor of [0.36, 0.67]) {
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, scale * factor, scale * 0.86 * factor, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.beginPath();
  survey.boundary.forEach((p, index) => {
    const screen = camera.worldToScreen(p);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(115, 137, 118, 0.09)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#87947d';
  ctx.stroke();
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(53, 84, 75, 0.32)';
  ctx.stroke();
  ctx.setLineDash([]);

  for (const anchor of survey.anchors) {
    const p = camera.worldToScreen(anchor);
    const central = anchor.kind === 'center';
    ctx.fillStyle = central ? ACCENT : '#667f77';
    ctx.strokeStyle = '#efeadd';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, central ? 7 : 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    if (camera.zoom > 0.45 || central) {
      ctx.font = `${central ? '700' : '600'} 10px ui-monospace, SFMono-Regular, Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.fillText(central ? 'CIVIC SITE' : anchor.id, p.x + 11, p.y - 9);
    }
  }

  // Screen-space overlays, unaffected by pan and zoom.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(52, 73, 75, 0.57)';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.fillText('SITE SURVEY  /  NOT YET A GENERATED CITY', 22, 31);
  ctx.strokeStyle = 'rgba(52, 73, 75, 0.40)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width - 44, 56); ctx.lineTo(width - 44, 94);
  ctx.moveTo(width - 50, 63); ctx.lineTo(width - 44, 53); ctx.lineTo(width - 38, 63);
  ctx.stroke();
  ctx.font = '700 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.fillText('N', width - 44, 44);

  const meters = gridStep;
  const scaleWidth = clamp(gridStep * camera.zoom, 25, 240);
  const barY = height - 34;
  const barX = width - scaleWidth - 24;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY); ctx.lineTo(barX + scaleWidth, barY);
  ctx.moveTo(barX, barY - 4); ctx.lineTo(barX, barY + 4);
  ctx.moveTo(barX + scaleWidth, barY - 4); ctx.lineTo(barX + scaleWidth, barY + 4);
  ctx.stroke();
  ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${meters} survey units`, width - 24, barY - 9);
}
