// An overlay-only representation of the selected property's original geometry.
// 3I-A never writes the preview to city, project files, or recovery.
export function drawPropertyEditPreview3I(ctx, camera, city, session) {
  if (!session?.isActive) return;
  const boundary = session.previewFor(city);
  if (!boundary?.length) return;
  const trace = points => {
    ctx.beginPath();
    points.forEach((point, index) => {
      const p = camera.worldToScreen(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  };
  ctx.save();
  // Show the actual prospective plot tiling, without touching stored city plots.
  for (const plot of session.plotsFor(city) ?? []) {
    trace(plot.boundary);
    ctx.fillStyle = 'rgba(26,100,124,.055)';
    ctx.fill();
    ctx.strokeStyle = '#408c91';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4,4]);
    ctx.stroke();
  }
  if(session.flexibleMode){
    const f=session.flexible,ring=f.selected?.boundary;
    if(ring){
      trace(ring);
      ctx.fillStyle='rgba(230,174,88,.10)';ctx.fill();
      try{
        const cut=f.cut().cut.map(p=>camera.worldToScreen(p));
        ctx.beginPath();ctx.moveTo(cut[0].x,cut[0].y);ctx.lineTo(cut[1].x,cut[1].y);
        ctx.strokeStyle='#b96c37';ctx.lineWidth=3;ctx.setLineDash([]);ctx.stroke();
      }catch{}
      for(const [which,edge,t] of [['A',f.edgeA,f.ratioA],['B',f.edgeB,f.ratioB]]){
        const a=ring[edge],b=ring[(edge+1)%ring.length];if(!a||!b)continue;
        const p=camera.worldToScreen({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
        ctx.beginPath();ctx.arc(p.x,p.y,which===(f.endpoint??'A')?8:6,0,2*Math.PI);
        ctx.fillStyle=which==='A'?'#f0b763':'#d9987a';ctx.fill();
        ctx.strokeStyle='#8f5938';ctx.lineWidth=2;ctx.stroke();
      }
    }
  }
  trace(boundary);
  ctx.fillStyle = 'rgba(45,127,114,.12)';
  ctx.fill();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = session.validation?.status === 'invalid' ? '#c54e49' : '#167f7d';
  ctx.stroke();
  ctx.setLineDash([]);
  // The distinct center handle moves the whole single frontage without
  // changing its assigned street or the opposite parcel edges.
  if(session.polygonMode && !session.flexibleMode){
    const first=camera.worldToScreen(boundary[0]),last=camera.worldToScreen(boundary[1]);
    if(session.drag?.kind==='frontage-sfs'){
      ctx.beginPath();ctx.moveTo(first.x,first.y);ctx.lineTo(last.x,last.y);
      ctx.strokeStyle='#dea54d';ctx.lineWidth=4;ctx.stroke();
    }
    const mx=(first.x+last.x)/2,my=(first.y+last.y)/2;
    ctx.fillStyle='#f0c57f';ctx.strokeStyle='#945b26';ctx.lineWidth=2;
    ctx.fillRect(mx-7,my-7,14,14);ctx.strokeRect(mx-7,my-7,14,14);
  }
  if(!session.flexibleMode)boundary.forEach((point, index) => {
    const p = camera.worldToScreen(point);
    const chosen = session.selectedCorner === index;
    ctx.beginPath();
    ctx.arc(p.x, p.y, chosen ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = chosen ? '#eeb76a' : '#f8faf0';
    ctx.fill();
    ctx.lineWidth = chosen ? 3 : 2;
    ctx.strokeStyle = '#146c66';
    ctx.stroke();
  });
  ctx.restore();
}
