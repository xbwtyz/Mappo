import { renderMap } from './canvas.js';

function drawRoadTarget(canvas, camera, city, target, color) {
  if (!target) return;
  const nodes = new Map(city.nodes.map(node => [node.id, node]));
  const street = target.kind === 'road' && city.roads.find(road => road.id === target.id);
  const points = (street ? [nodes.get(street.a), nodes.get(street.b)] : [nodes.get(target.id)])
    .filter(Boolean).map(point => camera.worldToScreen(point));
  if (!points.length) return;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.beginPath();
  if (points.length === 1) {
    ctx.arc(points[0].x, points[0].y, 6, 0, Math.PI * 2);
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff9e5';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

export function drawRoadComparison({ acceptedCanvas, proposedCanvas, camera, project, layers, candidate, target, impact }) {
  renderMap(acceptedCanvas, camera, project, null, layers, null, null, null, impact);
  drawRoadTarget(acceptedCanvas, camera, project.city, target, '#85582e');
  if (!candidate) {
    // Drop the previous bitmap immediately if the current draft is being rechecked.
    if (proposedCanvas.width !== 1) proposedCanvas.width = 1;
    if (proposedCanvas.height !== 1) proposedCanvas.height = 1;
    return;
  }
  renderMap(proposedCanvas, camera, candidate, null, layers, null, null, null, impact);
  drawRoadTarget(proposedCanvas, camera, candidate.city, target, '#126b58');
}
