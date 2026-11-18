// 3H placement is a ghost until a validated, atomic Apply to City.
export function drawBuildingStructurePreview3H(ctx,camera,city,layers,session) {
  if (!session?.isActive || layers?.buildings===false)return;
  const property=city?.properties.find(p=>p.id===session.propertyId);
  const geometry=session.previewFor(city);
  if(!property || !geometry?.footprint?.length)return;
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
    ctx.strokeStyle='#a88d6b';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.stroke();
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
