// An overlay-only representation of the selected property's original geometry.
// 3I-A never writes the preview to city, project files, or recovery.
export function drawPropertyEditPreview3I(ctx, camera, city, session) {
  if (!session?.isActive) return;
  const boundary = session.previewFor(city);
  if (!boundary?.length) return;
  const trace = points => {
    ctx.beginPath();
    points.forEach((point, index) => {
      const p = camera.worldToScreen(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  };
  ctx.save();
  trace(boundary);
  ctx.fillStyle = 'rgba(45,127,114,.12)';
  ctx.fill();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#167f7d';
  ctx.stroke();
  ctx.setLineDash([]);
  boundary.forEach((point, index) => {
    const p = camera.worldToScreen(point);
    const chosen = session.selectedCorner === index;
    ctx.beginPath();
    ctx.arc(p.x, p.y, chosen ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = chosen ? '#eeb76a' : '#f8faf0';
    ctx.fill();
    ctx.lineWidth = chosen ? 3 : 2;
    ctx.strokeStyle = '#146c66';
    ctx.stroke();
  });
  ctx.restore();
}
