// E3's combined outline is a ghost only. Accepted land is unchanged until Apply.
export function drawPropertyMergeE3(ctx,camera,city,session){
  if(!ctx||!session?.active)return;
  const primary=city?.properties?.find(p=>p.id===session.primaryId);
  if(!primary)return;
  const g=session.geometry(city);
  const outline=(points,color,width=2,dash=[6,4])=>{
    if(!points?.length)return;
    ctx.beginPath();
    points.forEach((p,i)=>{
      const q=camera.worldToScreen(p);
      if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);
    });
    ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();
  };
  ctx.save();
  outline(primary.boundary,'#e3b25b');
  if(g){
    ctx.beginPath();
    g.union.forEach((point,i)=>{const p=camera.worldToScreen(point);
      if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
    ctx.closePath();ctx.fillStyle='rgba(43,164,130,.20)';ctx.fill();
    outline(g.union,'#28b08b',3,[]);
    outline(g.secondary.boundary,'#e3b25b',2,[6,4]);
  }
  ctx.restore();
}
