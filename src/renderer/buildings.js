const ROOF_COLORS = ['#b68e76', '#b38a70', '#9a8d78', '#c29d82', '#a4977e'];

function traceDevelopmentPolygon(ctx, polygon, camera) {
  polygon.forEach((p, i) => {
    const s = camera.worldToScreen(p);
    if (!i) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

export function drawDevelopment(ctx, camera, city, layers) {
  if (layers.buildings !== false) {
    for (const building of city.buildings) {
      ctx.beginPath();
      traceDevelopmentPolygon(ctx, building.footprint, camera);
      for (const hole of building.holes) traceDevelopmentPolygon(ctx, hole, camera);
      ctx.fillStyle = ROOF_COLORS[building.roofTone];
      ctx.fill('evenodd');
      ctx.strokeStyle = '#756552';
      ctx.lineWidth = Math.max(.45, .85 * camera.zoom);
      ctx.stroke();
      if (camera.zoom > .6) {
        ctx.save();
        ctx.clip('evenodd');
        const a = building.footprint[0],
          b = building.footprint[1];
        const along = {
          x: Math.cos(building.orientation),
          y: Math.sin(building.orientation)
        };
        const inward = {
          x: -along.y,
          y: along.x
        };
        const offsets = building.footprint.map(p => (p.x - a.x) * inward.x + (p.y - a.y) * inward.y);
        const distance = (Math.min(...offsets) + Math.max(...offsets)) / 2;
        const start = camera.worldToScreen({
          x: a.x + inward.x * distance,
          y: a.y + inward.y * distance
        });
        const end = camera.worldToScreen({
          x: b.x + inward.x * distance,
          y: b.y + inward.y * distance
        });
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = 'rgba(95,69,49,.35)';
        ctx.lineWidth = Math.max(.45, .65 * camera.zoom);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  if (layers.properties) {
    ctx.strokeStyle = 'rgba(108,82,47,.7)';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([5, 3]);
    for (const property of city.properties) {
      ctx.beginPath();
      traceDevelopmentPolygon(ctx, property.boundary, camera);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (layers.plots) {
    ctx.strokeStyle = 'rgba(45,89,112,.75)';
    ctx.lineWidth = .8;
    ctx.setLineDash([2, 3]);
    for (const plot of city.plots) {
      ctx.beginPath();
      traceDevelopmentPolygon(ctx, plot.boundary, camera);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}
