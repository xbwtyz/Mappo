// E2 is a preview overlay; the accepted city never changes while dragging.
export function drawPropertySplitE2(ctx,camera,city,session){
  if(!ctx||!session?.active)return;
  const g=session.geometry(city);
  if(!g)return;
  const invalid=session.validation?.status==='invalid';
  const trace=points=>{
    ctx.beginPath();
    points.forEach((point,i)=>{
      const p=camera.worldToScreen(point);
      if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
    });
    ctx.closePath();
  };
  ctx.save();
  for(const [outline,color] of [[g.left,'rgba(31,136,104,.17)'],[g.right,'rgba(224,164,81,.19)']]){
    trace(outline);ctx.fillStyle=color;ctx.fill();
    ctx.setLineDash([7,5]);ctx.lineWidth=2.5;
    ctx.strokeStyle=invalid?'#a64b3b':'#27796a';ctx.stroke();
  }
  ctx.setLineDash([]);
  const [a,b]=g.cut,pa=camera.worldToScreen(a),pb=camera.worldToScreen(b);
  ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);
  ctx.strokeStyle=invalid?'#bd3f38':'#e7aa57';ctx.lineWidth=4;ctx.stroke();
  for(const p of [pa,pb]){
    ctx.beginPath();ctx.arc(p.x,p.y,6,0,2*Math.PI);
    ctx.fillStyle='#f4eedf';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#8d5d27';ctx.stroke();
  }
  ctx.restore();
}
