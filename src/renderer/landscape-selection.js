import {
  landscapePolygon
} from '../core/landscape-selection.js';

export function drawLandscapeSelection(ctx, camera, records, selection, hover) {
  for (const [ref, selected] of [
      [hover, false],
      [selection, true]
    ]) {
    const record = records.find(r => r.kind === ref?.kind && r.id === ref?.id);
    if (!record || (!selected && ref?.kind === selection?.kind && ref?.id === selection?.id)) continue;
    try {
      const path = record.feature.kind === 'coast' ? record.feature.path : landscapePolygon(record);
      ctx.save();
      ctx.beginPath();
      path.forEach((point, i) => {
        const p = camera.worldToScreen(point);
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      if (record.feature.kind !== 'coast') ctx.closePath();
      ctx.setLineDash([]);
      ctx.lineJoin = 'round';
      ctx.lineWidth = selected ? 7 : 5;
      ctx.strokeStyle = '#fff9e5';
      ctx.stroke();
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeStyle = selected ? '#b35f24' : '#297a87';
      ctx.stroke();
      ctx.restore();
    } catch {
      /* The list remains available for invalid older draft geometry. */ }
  }
}
