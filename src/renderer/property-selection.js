import { propertySelectionVisible } from '../core/property-selection.js';

export function drawPropertySelection(ctx, camera, city, layers, selection, hover) {
  if (!propertySelectionVisible(layers)) return;
  const building = selection?.kind === 'building' && layers.buildings !== false
    ? city.buildings.find(b => b.id === selection.id) : null;
  const selectedId = selection?.kind === 'property' ? selection.id : building?.propertyId;
  for (const [ref, selected] of [[hover, false], [selectedId ? { kind: 'property', id: selectedId } : null, true]]) {
    if (ref?.kind !== 'property' || (!selected && ref.id === selectedId)) continue;
    const property = city.properties.find(p => p.id === ref.id);
    if (!property) continue;
    const context = selected && Boolean(building);
    ctx.save();
    ctx.beginPath();
    property.boundary.forEach((point, i) => {
      const p = camera.worldToScreen(point);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.setLineDash(context ? [6, 4] : []);
    ctx.lineWidth = selected && !context ? 6 : 4;
    ctx.strokeStyle = '#fff9e5';
    ctx.stroke();
    ctx.lineWidth = selected && !context ? 2.5 : 1.5;
    ctx.strokeStyle = selected ? '#b35f24' : '#297a87';
    ctx.stroke();
    ctx.restore();
  }
}
