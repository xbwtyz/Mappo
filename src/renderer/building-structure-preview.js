import { lerpPoint } from '../core/boundary.js';
// 3H placement is a ghost until a validated, atomic Apply to City.
export function drawBuildingStructurePreview3H(ctx,camera,city,layers,session) {
  if (!session?.isActive || layers?.buildings===false)return;
  const property=city?.properties.find(p=>p.id===session.propertyId);
  if (session.operation === 'components') {
    drawComponentPlacement(ctx, camera, city, session);
    return;
  }
  const geometry=session.previewFor(city);
  if (!property) return;
  const trace=points=>{
    ctx.beginPath();
    points.forEach((p,i)=>{
      const screen=camera.worldToScreen(p);
      if(i)ctx.lineTo(screen.x,screen.y);else ctx.moveTo(screen.x,screen.y);
    });
    ctx.closePath();
  };
  ctx.save();
  trace(property.boundary);
  ctx.strokeStyle='rgba(27,94,105,.65)';
  ctx.lineWidth=1.5;
  ctx.setLineDash([3,5]);
  ctx.stroke();
  const original=city.buildings.find(b=>b.id===session.buildingId);
  if(original){
    trace(original.footprint);
    for (const hole of original.holes ?? []) {
      hole.forEach((point,i) => {
        const p = camera.worldToScreen(point);
        if (i) ctx.lineTo(p.x,p.y); else ctx.moveTo(p.x,p.y);
      });
      ctx.closePath();
    }
    ctx.strokeStyle='#a88d6b';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.stroke();
  }
  drawCourtyardPlacementPreview(ctx, camera, city, session);
  if (session.active.courtyard?.only || !geometry?.footprint?.length) {
    ctx.restore();
    return;
  }
  trace(geometry.footprint);
  for(const hole of geometry.holes) {
    hole.forEach((point,i)=>{
      const p=camera.worldToScreen(point);
      if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);
    });
    ctx.closePath();
  }
  const valid=session.validation?.status==='valid';
  const invalid=session.validation?.status==='invalid';
  ctx.fillStyle=invalid?'rgba(202,70,58,.22)':valid?'rgba(31,142,89,.22)':'rgba(26,132,166,.22)';
  ctx.fill('evenodd');
  ctx.setLineDash([9,4]);
  ctx.lineWidth=3;
  ctx.strokeStyle=invalid?'#cb5143':valid?'#30a37b':'#287fa0';
  ctx.stroke();
  ctx.restore();
}

function drawCourtyardPlacementPreview(ctx, camera, city, session) {
  const state = session.active.courtyard;
  if (!state?.hostId) return;
  const host = city.buildings.find(b => b.id === state.hostId);
  if (!host) return;
  const courtyard = host.geometry.regions.find(r => r.id === state.courtyardId);
  const exterior = host.geometry.regions.find(r => r.id === courtyard?.parentId);
  ctx.save();
  ctx.setLineDash([]);
  if (state.action === 'save' && exterior) {
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [ring, active, color, prefix] of [
      [exterior.ring, state.outerEdge, '#176e8a', 'E'],
      [courtyard.ring, state.innerEdge, '#7d427c', 'C']
    ]) {
      for (let i = 0; i < ring.length; i++) {
        const a = camera.worldToScreen(ring[i]), b = camera.worldToScreen(ring[(i + 1) % ring.length]);
        const middle = lerpPoint(a, b, .5);
        if (i === active) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();ctx.moveTo(a.x, a.y);ctx.lineTo(b.x, b.y);ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.fillRect(middle.x - 11, middle.y - 8, 22, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(prefix + (i + 1), middle.x, middle.y);
      }
    }
  }
  const {strip, paths} = session.validation?.accessPreview ?? {};
  if (strip) {
    ctx.beginPath();
    strip.forEach((point, i) => {
      const p = camera.worldToScreen(point);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,211,106,.78)';
    ctx.fill();
  }
  for (const path of paths ?? []) {
    ctx.beginPath();
    path.forEach((point, i) => {
      const p = camera.worldToScreen(point);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    });
    ctx.strokeStyle = '#fff4d2';ctx.lineWidth = 4;ctx.stroke();
    ctx.strokeStyle = '#176e8a';ctx.lineWidth = 2;ctx.stroke();
  }
  ctx.restore();
}

function drawComponentPlacement(ctx, camera, city, session) {
  const building = city.buildings.find(b => b.id === session.buildingId);
  if (!building) return;
  const result = session.validation;
  const regions = result?.preview?.geometry.regions ?? building.geometry.regions;
  const active = result?.preview?.activeId ?? session.active.componentDraft.componentId;
  const byId = new Map(regions.map(region => [region.id, region]));
  const trace = (points, close) => {
    points.forEach((point, index) => {
      const screen = camera.worldToScreen(point);
      if (index) ctx.lineTo(screen.x, screen.y); else ctx.moveTo(screen.x, screen.y);
    });
    if (close) ctx.closePath();
  };
  ctx.save();
  if (result?.preview?.join) {
    // Fill the combined footprint so the removal of the seam is visible.
    ctx.beginPath();
    for (const region of regions) trace(region.ring, true);
    ctx.fillStyle = 'rgba(45,160,130,.38)';
    ctx.fill('evenodd');
  }
  for (const region of regions) {
    const componentId = region.componentId ?? byId.get(region.parentId)?.componentId;
    ctx.strokeStyle = result?.status === 'invalid' ? '#cb5143' : '#287fa0';
    ctx.lineWidth = !active || active === componentId ? 3 : 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    trace(region.ring, true);
    ctx.stroke();
  }
  if (result?.incomingOutline) {
    ctx.strokeStyle = '#cb5143';
    ctx.lineWidth = 3;
    ctx.beginPath();
    trace(result.incomingOutline, true);
    ctx.stroke();
  }
  if (result?.preview?.accessPath) {
    ctx.strokeStyle = '#176e8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    trace(result.preview.accessPath, false);
    ctx.stroke();
  }
  ctx.restore();
}
