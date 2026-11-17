import {
  WALL_EDGE_WIDTH,
  solidWallSegments,
  measureWall
} from '../core/fortification-geometry.js';
import {
  gatePosts
} from '../core/gate-geometry.js';
import {
  STREET_EDGE_WIDTH
} from '../core/placement.js';

function fortificationStroke(ctx, camera, points, width, color) {
  ctx.beginPath();
  points.forEach((point, i) => {
    const p = camera.worldToScreen(point);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width * camera.zoom;
  ctx.stroke();
}
export function drawGateApproaches(ctx, camera, city, layers) {
  if (layers.fortifications === false || city.fortificationState?.status !== 'built' || !city.fortificationState.enabled) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const gate of city.gates) {
    fortificationStroke(ctx, camera, gate.connection.points, gate.connection.width + STREET_EDGE_WIDTH, '#a58f73');
    fortificationStroke(ctx, camera, gate.connection.points, gate.connection.width, '#fbf6e9');
  }
}

function drawFortificationRound(ctx, camera, center, radius, small = false) {
  const p = camera.worldToScreen(center),
    outline = 1.25 * camera.zoom,
    r = radius * camera.zoom - outline / 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = small ? '#c6bba3' : '#b6b09a';
  ctx.fill();
  ctx.strokeStyle = '#5f675d';
  ctx.lineWidth = outline;
  ctx.stroke();
  if (camera.zoom > .55) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * .53, 0, Math.PI * 2);
    ctx.strokeStyle = '#8a907d';
    ctx.lineWidth = Math.max(.5, .7 * camera.zoom);
    ctx.stroke();
  }
}
export function drawFortifications(ctx, camera, city, layers) {
  if (layers.fortifications === false || city.fortificationState?.status !== 'built' || !city.fortificationState.enabled) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const wall of city.walls) {
    const sections = solidWallSegments(wall, city.gates);
    for (const section of sections) fortificationStroke(ctx, camera, [section.a, section.b], wall.width + (wall.edgeWidth ?? WALL_EDGE_WIDTH), '#616a5e');
    for (const section of sections) fortificationStroke(ctx, camera, [section.a, section.b], wall.width, '#b7b39e');
    for (const section of sections) fortificationStroke(ctx, camera, [section.a, section.b], Math.max(1, wall.width * .25), '#d7d0b9');
    const measure = measureWall(wall.path);
    for (const gate of city.gates.filter(g => g.wallId === wall.id))
      for (const post of gatePosts(gate, measure)) drawFortificationRound(ctx, camera, post, gate.postRadius, true);
  }
  for (const tower of city.towers) drawFortificationRound(ctx, camera, tower.center, tower.radius);
}
