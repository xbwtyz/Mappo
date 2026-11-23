export function drawBuildingSelection(ctx, camera, buildings, layers, selection, hover) {
  if (layers.buildings === false) return;
  for (const [ref, selected] of [[hover, false], [selection, true]]) {
    if (ref?.kind !== 'building' || (!selected && ref.id === selection?.id && selection?.kind === 'building')) continue;
    const building = buildings.find(record => record.id === ref.id);
    if (!building) continue;
    ctx.save();
    ctx.beginPath();
    // Use canonical region rings directly for unhydrated and nested records.
    const rings=building.geometry?.regions?.map(region=>region.ring) ??
      [building.footprint,...(building.holes??[])];
    for (const polygon of rings) {
      if (!Array.isArray(polygon)) continue;
      polygon.forEach((point, i) => {
        const screen = camera.worldToScreen(point);
        if (i) ctx.lineTo(screen.x, screen.y);
        else ctx.moveTo(screen.x, screen.y);
      });
      ctx.closePath();
    }
    ctx.setLineDash([]);
    ctx.lineJoin = 'round';
    ctx.lineWidth = selected ? 6 : 4;
    ctx.strokeStyle = '#fff9e5';
    ctx.stroke();
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeStyle = selected ? '#b35f24' : '#297a87';
    ctx.stroke();
    ctx.restore();
  }
}
