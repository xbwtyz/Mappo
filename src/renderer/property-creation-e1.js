// E1: preview only. The accepted city is always drawn by the normal renderer.
export function drawPropertyCreationE1(ctx,camera,city,session){
  if(!ctx||!session?.active||!session.draft)return;
  const points=session.preview(city);
  if(!points?.length)return;
  ctx.save();
  ctx.beginPath();
  points.forEach((point,i)=>{
    const p=camera.worldToScreen(point);
    if(i===0)ctx.moveTo(p.x,p.y);
    else ctx.lineTo(p.x,p.y);
  });
  ctx.closePath();
  const invalid=session.validation?.status==='invalid';
  ctx.fillStyle=invalid?'rgba(195,68,66,.15)':'rgba(42,139,119,.17)';
  ctx.strokeStyle=invalid?'#b64140':'#13796c';
  ctx.lineWidth=3;
  ctx.setLineDash([7,4]);
  ctx.fill();ctx.stroke();ctx.setLineDash([]);
  points.forEach((point,i)=>{
    const p=camera.worldToScreen(point);
    ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);
    ctx.fillStyle=i<2?'#e9bf7b':'#e8f4e9';ctx.fill();
    ctx.strokeStyle='#325553';ctx.lineWidth=1;ctx.stroke();
  });
  ctx.restore();
}
