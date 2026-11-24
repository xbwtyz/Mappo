import { validatePlotTiling027 } from './plot-partition-027.js';

// Positive-length shared edges define plot adjacency. Point-only contacts do
// not create adjacency. Compare using the same scale as existing geometry.
const larePlotEps=1e-6;
function lareSharedEdge(a,b,c,d){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<larePlotEps)return false;
  const cross=p=>Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))/len;
  if(cross(c)>larePlotEps||cross(d)>larePlotEps)return false;
  const u=p=>((p.x-a.x)*dx+(p.y-a.y)*dy)/len;
  return Math.min(len,Math.max(u(c),u(d)))-Math.max(0,Math.min(u(c),u(d)))>larePlotEps;
}
export function larePlotAdjacency(plots,budget){
  const pairs=[];
  for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++){
    const a=plots[i].boundary,b=plots[j].boundary;
    let shared=false;
    outer:for(let k=0;k<a.length;k++)for(let l=0;l<b.length;l++){
      budget.spend();
      if(lareSharedEdge(a[k],a[(k+1)%a.length],b[l],b[(l+1)%b.length])){shared=true;break outer;}
    }
    if(shared)pairs.push([plots[i].id,plots[j].id].sort().join('|'));
  }
  return pairs.sort();
}
export function verifyLarePlotDeformation(parent,original,next,budget,expectedAdjacency=null){
  if(next.length!==original.length||next.some((p,i)=>p.id!==original[i].id))
    throw Error('Plot identity or order changed.');
  if(new Set(next.map(p=>p.id)).size!==next.length)throw Error('Duplicate plot identity.');
  // Charge a conservative bound on containment, convexity and pair checks.
  const corners=next.reduce((n,p)=>n+p.boundary.length,0);
  budget.spend(Math.max(1,corners*corners+corners*parent.length*2+parent.length*parent.length));
  validatePlotTiling027(parent,next);
  const expected=expectedAdjacency??larePlotAdjacency(original,budget);
  if(JSON.stringify(larePlotAdjacency(next,budget))!==JSON.stringify(expected))
    throw Error('Plot adjacency changed.');
  return true;
}
export function mapLarePlotCells(plots,map,budget){
  const cache=new Map();
  return plots.map(p=>({...p,boundary:p.boundary.map(point=>{
    budget.spend();
    const key=point.x+','+point.y;
    if(!cache.has(key))cache.set(key,map(point));
    return {...cache.get(key)};
  })}));
}
