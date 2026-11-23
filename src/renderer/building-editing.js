import { buildingPreviewHandles, buildingPreviewPivot } from '../core/building-transform.js';

import { buildingDirectHandles } from '../editor/building.js';

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
  if (edit.isPending) {
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
  const base = edit.draft ?? building;
  const points = edit.isDirect ? buildingDirectHandles(preview, edit.tool, edit.holeIndex)
    : buildingPreviewHandles(base, edit.transform, camera.zoom);
  const handleColor = edit.isDirect ? '#14788a' : '#234c39';
  if (!edit.isDirect) {
    const corners = points.filter(handle => handle.kind === 'resize');
    const rotation = points.find(handle => handle.kind === 'rotate');
    const anchor = camera.worldToScreen(rotation.anchor);
    const knob = camera.worldToScreen(rotation);
    ctx.beginPath();
    corners.forEach((corner, index) => {
      const p = camera.worldToScreen(corner);
      if (index) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(knob.x, knob.y);
    ctx.strokeStyle = handleColor; ctx.lineWidth = 1.5; ctx.stroke();
    const p = camera.worldToScreen(buildingPreviewPivot(base,edit.transform));
    ctx.beginPath();
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tipX = p.x + x * 8, tipY = p.y + y * 8;
      ctx.moveTo(p.x, p.y); ctx.lineTo(tipX, tipY);
      ctx.moveTo(tipX - x * 4 - y * 3, tipY - y * 4 + x * 3);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tipX - x * 4 + y * 3, tipY - y * 4 - x * 3);
    }
    ctx.strokeStyle = handleColor; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const handle of points) {
    const p = camera.worldToScreen(handle);
    ctx.beginPath();
    if (handle.kind === 'resize') ctx.rect(p.x-5,p.y-5,10,10);
    else ctx.arc(p.x,p.y,7,0,Math.PI*2);
    ctx.fillStyle = edit.isDirect && handle.index === edit.handleIndex ? '#f3bd58' : '#fffaf0';
    ctx.fill();
    ctx.strokeStyle = handleColor; ctx.lineWidth = 2; ctx.stroke();
    if (handle.kind === 'rotate') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.3, Math.PI / 4, 2 * Math.PI);
      ctx.lineTo(p.x + 3.3, p.y - 2.5);
      ctx.moveTo(p.x + 3.3, p.y);
      ctx.lineTo(p.x + 1, p.y - .8);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  const proposed = edit.validation?.candidate?.city.buildings.find(item => item.id === edit.buildingId);
  drawProposedBuildingAccess(ctx,camera,proposed);
  const issue = edit.validation?.issues?.find(row=>row.blockerId||row.targetId);
  drawBuildingEditObstruction(ctx,camera,city,issue?.blockerId??issue?.targetId);
  ctx.restore();
}

export function drawProposedBuildingAccess(ctx,camera,accepted) {
  ctx.save();
  if (accepted?.accessPath && accepted.entrance) {
    ctx.beginPath();
    for (const [i, point] of accepted.accessPath.entries()) {
      const p = camera.worldToScreen(point);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.strokeStyle = '#14788a';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    const door = camera.worldToScreen(accepted.entrance);
    ctx.beginPath();
    ctx.arc(door.x, door.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f3bd58';
    ctx.fill();
  }
  ctx.restore();
}

export function drawBuildingEditObstruction(ctx,camera,city,target) {
  ctx.save();
  const building=city.buildings?.find(b=>b.id===target);
  const conflicting = target && (city.properties?.find(p=>p.id===target)?.boundary
    || building?.geometry?.regions?.find(region=>region.parentId===null)?.ring
    || building?.footprint);
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
