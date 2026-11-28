import {riCompare} from '../../../src/core/road-impact-model.js';
// For one variable vertex with every other coordinate fixed, cyclic
// order can change only at collinearity of three incident vertices or
// coincidence. Sample both sides of relevant event lines. This is not
// exhaustive arrangement feasibility, nor an editing or topology oracle.
export function* angularLineProposals(current,old,limit,lines,b){
 const seen=new Set();
 function offer(p){
  b.spend(4);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.hypot(p.x-old.x,p.y-old.y)>limit||p.x===old.x&&p.y===old.y)return null;
  const k=JSON.stringify(p);if(seen.has(k))return null;seen.add(k);return p;
 }
 for(const [a,c] of lines){
  b.spend(16);const dx=c.x-a.x,dy=c.y-a.y,len=Math.hypot(dx,dy);if(len<=1e-9)continue;
  const ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
  const t=(current.x-a.x)*ux+(current.y-a.y)*uy,oldT=(old.x-a.x)*ux+(old.y-a.y)*uy;
  const dist=(old.x-a.x)*nx+(old.y-a.y)*ny;
  // Points near the projection and endpoints of the chord of the
  // displacement disk. Inside-disk filtering remains exact.
  const ts=[t,oldT];
  if(Math.abs(dist)<limit){const h=Math.sqrt(Math.max(0,limit*limit-dist*dist));ts.push(oldT-h*.98,oldT+h*.98);}
  for(const u of ts)for(const gap of [.05,.5,2])for(const sign of [-1,1]){
   const p=offer({x:a.x+u*ux+sign*gap*nx,y:a.y+u*uy+sign*gap*ny});if(p)yield p;
  }
 }
 // Coarse bounded interpolation gives a separate non-line fallback.
 for(const scale of [.1,.25,.5,.75,1.1]){
  const p=offer({x:old.x+(current.x-old.x)*scale,y:old.y+(current.y-old.y)*scale});if(p)yield p;
 }
}
export function localAngularLines(graph,exact,points,changed,variable,b){
 const now=id=>points.get(id)??exact.get(id)??graph.nodesById.get(id),rows=[],seen=new Set();
 for(const id of changed){
  b.spend();const arms=[...graph.incidentRoads.get(id)].map(rid=>{b.spend();const r=graph.roadsById.get(rid);return r.a===id?r.b:r.a;}).sort(riCompare);
  for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++){
   b.spend(4);const triplet=[id,arms[i],arms[j]];if(!triplet.includes(variable))continue;
   const others=triplet.filter(v=>v!==variable).sort(riCompare);if(others.length!==2)continue;
   const key=JSON.stringify(others);if(seen.has(key))continue;seen.add(key);rows.push(others.map(now));
  }
 }
 return rows;
}
