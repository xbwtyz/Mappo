import { clamp } from '../core/geometry.js';

const INK = '#34494b';
const ACCENT = '#ad8054';
const ROAD_STYLES = Object.freeze({
  primary: { width: 12, fill: '#fbf6e9', edge: '#a58f73' },
  secondary: { width: 8.2, fill: '#faf4e6', edge: '#b2a58e' },
  lane: { width: 4.5, fill: '#f8f1df', edge: '#b6ab93' }
});
const BLOCK_FILLS = [
  ['#cbd3b7', '#d7d5b9', '#d8d3b4', '#c9d2b7'],
  ['#ced2b5', '#ddd7ba', '#d2d4bb', '#d8d3b4'],
  ['#d6d3b6', '#cbd0b3', '#dcd6ba', '#d0d4b9'],
  ['#d2d5bf', '#d8d4b9', '#cdd4ba', '#dfd8c0']
];

function pathPolygon(ctx, points, camera) {
  ctx.beginPath();
  points.forEach((point, i) => {
    const p = camera.worldToScreen(point);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
}

function drawGrid(ctx, camera) {
  const width = camera.width;
  const height = camera.height;
  const first = camera.screenToWorld({ x: 0, y: 0 });
  const last = camera.screenToWorld({ x: width, y: height });
  const intervals = [10, 20, 50, 100, 200, 500, 1000];
  const gridStep = intervals.find(step => step * camera.zoom >= 27) ?? 1000;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(80, 85, 74, 0.065)';
  ctx.beginPath();
  const firstX = Math.floor(first.x / gridStep);
  const firstY = Math.floor(first.y / gridStep);
  for (let x = firstX; x <= Math.ceil(last.x / gridStep) && x < firstX + 180; x++) {
    const sx = camera.worldToScreen({ x: x * gridStep, y: 0 }).x;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (let y = firstY; y <= Math.ceil(last.y / gridStep) && y < firstY + 180; y++) {
    const sy = camera.worldToScreen({ x: 0, y: y * gridStep }).y;
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();
  return gridStep;
}

function drawSurvey(ctx, camera, survey) {
  pathPolygon(ctx, survey.boundary, camera);
  ctx.fillStyle = 'rgba(121, 145, 112, 0.065)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(107, 123, 97, 0.60)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 7]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBlocks(ctx, camera, city, byId) {
  for (const block of city.blocks) {
    const points = block.vertices.map(id => byId.get(id));
    pathPolygon(ctx, points, camera);
    const palette = BLOCK_FILLS[block.ring % BLOCK_FILLS.length];
    ctx.fillStyle = palette[(block.sector + block.id.length * 7 + Number(block.id.slice(-2))) % palette.length];
    ctx.fill();
    ctx.strokeStyle = '#a9b09c';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
}

function drawRoads(ctx, camera, city, byId) {
  // Two passes maintain clean junctions even when neighboring streets differ in width.
  for (const pass of ['edge', 'fill']) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of city.roads) {
      const style = ROAD_STYLES[road.kind];
      const a = camera.worldToScreen(byId.get(road.a));
      const b = camera.worldToScreen(byId.get(road.b));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = style[pass];
      ctx.lineWidth = (style.width + (pass === 'edge' ? 2.2 : 0)) * camera.zoom;
      ctx.stroke();
    }
  }
}

function drawPlaza(ctx, camera, plaza, byId) {
  const points = plaza.vertices.map(id => byId.get(id));
  pathPolygon(ctx, points, camera);
  ctx.fillStyle = '#e7d5af';
  ctx.fill();
  ctx.strokeStyle = '#a38866';
  ctx.lineWidth = Math.max(1, 2.2 * camera.zoom);
  ctx.stroke();

  // Fine, quiet radial paving; these are decorations, not road segments.
  const center = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
  const screen = camera.worldToScreen(center);
  ctx.beginPath();
  for (const point of points) {
    const p = camera.worldToScreen(point);
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = 'rgba(148, 123, 82, 0.22)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  const ring = Math.max(4, 6 * camera.zoom);
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, ring, 0, Math.PI * 2);
  ctx.fillStyle = '#b7a17c';
  ctx.fill();
  ctx.strokeStyle = '#f7ead1';
  ctx.lineWidth = Math.max(1, 2.8 * camera.zoom);
  ctx.stroke();
  if (camera.zoom >= 0.4) {
    ctx.font = '700 11px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(plaza.name.toUpperCase(), screen.x, screen.y - Math.max(13, 18 * camera.zoom));
  }
}

function drawCompassAndScale(ctx, camera, step) {
  const width = camera.width;
  const height = camera.height;
  ctx.strokeStyle = 'rgba(52, 73, 75, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width - 44, 56); ctx.lineTo(width - 44, 94);
  ctx.moveTo(width - 50, 63); ctx.lineTo(width - 44, 53); ctx.lineTo(width - 38, 63);
  ctx.stroke();
  ctx.font = '700 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.fillText('N', width - 44, 44);
  const scaleWidth = clamp(step * camera.zoom, 25, 240);
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
  ctx.fillText(`${step} survey units`, width - 24, barY - 9);
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
  const gridStep = drawGrid(ctx, camera);
  const city = project.city;
  const byId = new Map(city.nodes.map(node => [node.id, node]));
  drawSurvey(ctx, camera, city.survey);
  drawBlocks(ctx, camera, city, byId);
  drawRoads(ctx, camera, city, byId);
  drawPlaza(ctx, camera, city.plaza, byId);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(52, 73, 75, 0.67)';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.fillText('CITY PLAN  /  STREET NETWORK & BLOCKS', 22, 31);
  drawCompassAndScale(ctx, camera, gridStep);
}
