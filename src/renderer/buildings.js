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
      // Alternating solid/void regions are rendered by even-odd fill, including
      // nested islands and multiple disjoint solid roots.
      const regions=building.geometry?.regions ?? [
        {kind:'solid',parentId:null,ring:building.footprint},
        ...(building.holes??[]).map(ring=>({kind:'void',ring}))
      ];
      for (const region of regions) traceDevelopmentPolygon(ctx, region.ring, camera);
      ctx.fillStyle = ROOF_COLORS[building.roofTone % ROOF_COLORS.length];
      ctx.fill('evenodd');
      ctx.strokeStyle = '#756552';
      ctx.lineWidth = Math.min(2.3,Math.max(.65,.85*camera.zoom));
      ctx.stroke();
      if (camera.zoom > .6) {
        ctx.save();
        ctx.clip('evenodd');
        const footprint=regions.find(r=>r.kind==='solid'&&r.parentId===null)?.ring;
        if (!footprint || footprint.length < 2) {ctx.restore();continue;}
        const a = footprint[0],
          b = footprint[1];
        const along = {
          x: Math.cos(building.orientation),
          y: Math.sin(building.orientation)
        };
        const inward = {
          x: -along.y,
          y: along.x
        };
        const offsets = footprint.map(p => (p.x - a.x) * inward.x + (p.y - a.y) * inward.y);
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
        ctx.lineWidth = Math.min(1.5,Math.max(.55,.65*camera.zoom));
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  if (layers.properties) {
    ctx.strokeStyle = 'rgba(108,82,47,.84)';
    ctx.lineWidth = Math.min(1.7,Math.max(.95,1.1*camera.zoom));
    ctx.setLineDash([5, 3]);
    for (const property of city.properties) {
      ctx.beginPath();
      traceDevelopmentPolygon(ctx, property.boundary, camera);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (layers.plots) {
    ctx.strokeStyle = 'rgba(45,89,112,.86)';
    ctx.lineWidth = Math.min(1.4,Math.max(.8,.8*camera.zoom));
    ctx.setLineDash([2, 3]);
    for (const plot of city.plots) {
      ctx.beginPath();
      traceDevelopmentPolygon(ctx, plot.boundary, camera);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}
