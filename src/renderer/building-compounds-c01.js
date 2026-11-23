import { drawProposedBuildingAccess, drawBuildingEditObstruction } from './building-editing.js';

// C01: drawing-only overlay of a detached all-member transform candidate.
export function drawCompoundPreviewC01(ctx,camera,result) {
  const preview=result?.preview;
  if(!preview?.project?.city||!preview.buildingIds?.length)return;
  ctx.save();
  ctx.lineWidth=2;
  ctx.setLineDash([7,4]);
  for(const id of preview.buildingIds) {
    const b=preview.project.city.buildings.find(item=>item.id===id);
    if(!b?.footprint?.length)continue;
    ctx.beginPath();
    for(const [i,p] of b.footprint.entries()){
      const q=camera.worldToScreen(p);
      if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);
    }
    ctx.closePath();
    ctx.fillStyle=result.ok?'rgba(36,153,115,0.17)':'rgba(210,116,40,0.15)';
    ctx.strokeStyle=result.ok?'#21a57f':'#d27428';
    ctx.fill();
    ctx.stroke();
    for(const hole of b.holes??[]){
      ctx.beginPath();
      hole.forEach((p,i)=>{const q=camera.worldToScreen(p);if(!i)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});
      ctx.closePath();ctx.stroke();
    }
  }
  for(const id of preview.buildingIds) {
    if(result.ok)drawProposedBuildingAccess(ctx,camera,preview.project.city.buildings.find(building=>building.id===id));
  }
  drawBuildingEditObstruction(ctx,camera,preview.project.city,result.issues[0]?.blockerId);
  ctx.restore();
}
