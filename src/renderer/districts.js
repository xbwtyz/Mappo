import {
  buildDistrictTopology,
  districtSummary
} from '../core/district-topology.js';

const districtDrawingCache = new WeakMap();

function districtDrawing(city) {
  if (districtDrawingCache.has(city)) return districtDrawingCache.get(city);
  const topology = buildDistrictTopology(city),
    owners = new Map(city.blocks.map(b => [b.id, b.districtId]));
  const boundaries = [...topology.edges.values()].filter(e => e.blockIds.length === 1 || owners.get(e.blockIds[0]) !== owners.get(e.blockIds[1]));
  const summaries = new Map(city.districts.map(d => [d.id, districtSummary(city, d, topology)]));
  const drawing = {
    topology,
    owners,
    boundaries,
    summaries
  };
  districtDrawingCache.set(city, drawing);
  return drawing;
}

function traceDistrictFace(ctx, points, camera) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = camera.worldToScreen(p);
    if (i) ctx.lineTo(s.x, s.y);
    else ctx.moveTo(s.x, s.y);
  });
  ctx.closePath();
}
export function drawDistrictColors(ctx, camera, city, layers, selection) {
  if (city.districtState?.status !== 'assigned' || (!layers.districtColors && !selection)) return;
  const {
    topology,
    owners
  } = districtDrawing(city), districts = new Map(city.districts.map(d => [d.id, d]));
  const alpha = ctx.globalAlpha;
  for (const block of city.blocks) {
    const id = owners.get(block.id),
      district = districts.get(id);
    traceDistrictFace(ctx, block.vertices.map(id => topology.nodes.get(id)), camera);
    ctx.fillStyle = district.color;
    ctx.globalAlpha = alpha * (layers.districtColors ? .58 : 0);
    ctx.fill();
    if (selection === id) {
      ctx.fillStyle = district.color;
      ctx.globalAlpha = alpha * .24;
      ctx.fill();
    }
  }
  ctx.globalAlpha = alpha;
}
export function drawDistrictOverlay(ctx, camera, city, layers, selection) {
  if (city.districtState?.status !== 'assigned') return;
  const {
    topology,
    owners,
    boundaries,
    summaries
  } = districtDrawing(city);
  if (layers.districtBorders || selection) {
    for (const edge of boundaries) {
      const selected = selection && edge.blockIds.some(id => owners.get(id) === selection);
      if (!layers.districtBorders && !selected) continue;
      const a = camera.worldToScreen(topology.nodes.get(edge.a)),
        b = camera.worldToScreen(topology.nodes.get(edge.b));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = selected ? '#4d5145' : '#786f5c';
      ctx.lineWidth = selected ? 2.5 : 1.15;
      ctx.setLineDash(selected ? [] : [5, 3]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (layers.districtLabels && camera.zoom >= .28) {
    const occupied = [];
    const ordered = [...city.districts].sort((a, b) => Number(b.id === selection) - Number(a.id === selection));
    for (const district of ordered) {
      const center = camera.worldToScreen(summaries.get(district.id).label),
        name = district.name.length > 24 ? district.name.slice(0, 23) + '…' : district.name,
        width = name.length * 6.5 + 18;
      if (center.x < 0 || center.y < 0 || center.x > camera.width || center.y > camera.height) continue;
      if (district.id !== selection && occupied.some(p => Math.abs(p.x - center.x) < (p.width + width) / 2 + 4 && Math.abs(p.y - center.y) < 28)) continue;
      occupied.push({
        ...center,
        width
      });
      ctx.fillStyle = 'rgba(250,246,233,.93)';
      ctx.fillRect(center.x - width / 2, center.y - 12, width, 24);
      ctx.strokeStyle = district.color;
      ctx.lineWidth = district.id === selection ? 2.5 : 1.5;
      ctx.strokeRect(center.x - width / 2, center.y - 12, width, 24);
      ctx.fillStyle = '#34494b';
      ctx.font = '600 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, center.x, center.y + 4);
    }
  }
}
