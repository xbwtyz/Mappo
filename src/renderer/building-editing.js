import { buildingPreviewHandles, buildingPreviewPivot, buildingTransformDirty } from '../core/building-transform.js';

// Temporary overlay: the accepted building is drawn by the normal renderer,
// while this draft remains a separate, visibly tentative geometry preview.
export function drawBuildingEditOverlay(ctx, camera, city, layers, edit) {
  if (!edit?.isActive || layers?.buildings === false) return;
  const building = city?.buildings?.find(item => item.id === edit.buildingId);
  const property = city?.properties?.find(item => item.id === edit.propertyId);
  if (!building || !property || building.propertyId !== property.id
      || !(property.buildingIds ?? []).includes(building.id)) return;
  const preview = edit.previewFor(city);
  if (!preview?.footprint?.length) return;
  const trace = geometry => {
    ctx.beginPath();
    for (const polygon of [geometry.footprint,...(geometry.holes ?? [])]) {
      if (!polygon || polygon.length < 3) continue;
      polygon.forEach((point,i) => {
        const p = camera.worldToScreen(point);
        if (i) ctx.lineTo(p.x,p.y);
        else ctx.moveTo(p.x,p.y);
      });
      ctx.closePath();
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  if (buildingTransformDirty(edit.transform)) {
    trace(building);
    ctx.setLineDash([5,5]);
    ctx.strokeStyle = 'rgba(90, 76, 57, .8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  trace(preview);
  ctx.fillStyle = 'rgba(32, 140, 151, .18)';
  ctx.fill('evenodd');
  ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 5; ctx.setLineDash([]); ctx.stroke();
  const invalid = edit.validation?.status === 'invalid';
  ctx.strokeStyle = invalid ? '#d65045' : edit.validation?.status === 'valid' ? '#218b65' : '#14788a';
  ctx.lineWidth = 2.5; ctx.setLineDash([8,3]); ctx.stroke();
  ctx.setLineDash([]);
  const points = buildingPreviewHandles(building,edit.transform,camera.zoom)
    .filter(h => h.kind === edit.tool);
  if (edit.tool === 'move') {
    const p = camera.worldToScreen(buildingPreviewPivot(building,edit.transform));
    ctx.beginPath();
    ctx.moveTo(p.x-7,p.y); ctx.lineTo(p.x+7,p.y);
    ctx.moveTo(p.x,p.y-7); ctx.lineTo(p.x,p.y+7);
    ctx.strokeStyle = '#14788a'; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const handle of points) {
    const p = camera.worldToScreen(handle);
    ctx.beginPath();
    if (handle.kind === 'resize') ctx.rect(p.x-5,p.y-5,10,10);
    else ctx.arc(p.x,p.y,7,0,Math.PI*2);
    ctx.fillStyle = '#fffaf0'; ctx.fill();
    ctx.strokeStyle = '#14788a'; ctx.lineWidth = 2; ctx.stroke();
  }
  const target = edit.validation?.issues?.find(issue=>issue.targetId)?.targetId;
  const conflicting = target && (city.properties?.find(p=>p.id===target)?.boundary
    || city.buildings?.find(b=>b.id===target)?.footprint);
  if(conflicting){
    ctx.beginPath();
    conflicting.forEach((point,i)=>{
      const p=camera.worldToScreen(point);
      if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
    });
    ctx.closePath();
    ctx.strokeStyle='#d65045';ctx.lineWidth=3;ctx.setLineDash([4,3]);ctx.stroke();
  }
  ctx.restore();
}
