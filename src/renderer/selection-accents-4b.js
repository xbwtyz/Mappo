// Dev 4b: small screen-sized landmarks distinguish the selected object from
// the cyan hover outline and the dashed parent-property context.
export function drawSelectionAccents4B(ctx,camera,city,layers,selection) {
  if(!selection||!city)return;
  const property=selection.kind==='property'
    ? city.properties.find(p=>p.id===selection.id):null;
  const building=selection.kind==='building'&&layers.buildings!==false
    ? city.buildings.find(b=>b.id===selection.id):null;
  const boundary=property?.boundary??building?.footprint;
  if(!boundary?.length)return;
  ctx.save();
  if(property&&layers.plots===true){
    const ids=new Set(property.plotIds);
    ctx.lineWidth=1.6;
    ctx.strokeStyle='rgba(31,108,136,.95)';
    ctx.setLineDash([5,3]);
    for(const plot of city.plots){
      if(!ids.has(plot.id)||plot.propertyId!==property.id)continue;
      ctx.beginPath();
      plot.boundary.forEach((p,i)=>{
        const q=camera.worldToScreen(p);
        if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);
      });
      ctx.closePath();ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  const radius=property?3.3:2.7;
  ctx.fillStyle='#b35f24';
  ctx.strokeStyle='#fff9e5';
  ctx.lineWidth=1.4;
  for(const point of boundary){
    const pos=camera.worldToScreen(point);
    ctx.fillRect(pos.x-radius,pos.y-radius,radius*2,radius*2);
    ctx.strokeRect(pos.x-radius,pos.y-radius,radius*2,radius*2);
  }
  ctx.restore();
}
