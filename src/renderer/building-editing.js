// 3G-A: edit-only visual guides; no draggable handles until 3G-B.
export function drawBuildingEditOverlay(ctx, camera, city, layers, edit) {
  if (!edit?.isActive || layers?.buildings === false) return;
  const building = city?.buildings?.find(item => item.id === edit.buildingId);
  const property = city?.properties?.find(item => item.id === edit.propertyId);
  if (!building || !property || building.propertyId !== property.id
    || !(property.buildingIds ?? []).includes(building.id)) return;
  const polygons = [building.footprint, ...(building.holes ?? [])].filter(points => points?.length >= 3);
  if (!polygons.length) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const polygon of polygons) {
    polygon.forEach((point, i) => {
      const p = camera.worldToScreen(point);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(32,140,151,.12)';
  ctx.fill('evenodd');
  ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 5; ctx.setLineDash([]); ctx.stroke();
  ctx.strokeStyle = '#14788a'; ctx.lineWidth = 2.5; ctx.stroke();
  for (const point of building.footprint) {
    const p = camera.worldToScreen(point);
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#14788a'; ctx.stroke();
  }
  ctx.restore();
}
