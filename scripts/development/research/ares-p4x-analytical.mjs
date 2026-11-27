import { readFileSync } from 'node:fs';
import { riCompare,riFreeze } from '../../../src/core/road-impact-model.js';
export const X34_COVER=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/p4x-x34-exact-cover-46079959187.json',import.meta.url),'utf8')));
export const X34_IDS=Object.freeze(X34_COVER.rows.filter(r=>r.min<=4).map(r=>r.id));
const orientation=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const chargeSort=(n,b)=>b.spend(Math.max(1,n*Math.ceil(Math.log2(n+1))));
const point=p=>({x:p.x,y:p.y});
// Linearize each signed orientation at the exact translated baseline.
// Signs from accepted geometry are a heuristic, not mandatory constraints.
// Each endpoint receives its own displacement; no iterative correction.
export function* analyticalTrials(graph,rows,positions,report,offset,budget,telemetry){
  const eligible=new Set(rows.map(r=>r.ref.id)),selected=new Set(positions.keys());
  const limit=Math.hypot(offset.x,offset.y);
  const old=id=>graph.nodesById.get(id),now=id=>positions.get(id)??old(id);
  const pairSets=[],requirements=new Map(),seen=new Set();
  function addTriplet(ids){
    budget.spend(12);
    const orig=ids.map(old),p=ids.map(now),v=orientation(...orig),base=orientation(...p);
    if(Math.abs(v)<=1e-9)return;
    const sign=Math.sign(v),[a,b,c]=p,len=Math.hypot(b.x-a.x,b.y-a.y);
    if(len<=1e-9)return;
    const grad=[[b.y-c.y,c.x-b.x],[c.y-a.y,a.x-c.x],[a.y-b.y,b.x-a.x]];
    const terms=new Map();
    for(let i=0;i<3;i++){
      budget.spend();if(!eligible.has(ids[i]))continue;
      const g=terms.get(ids[i])??[0,0];g[0]+=grad[i][0];g[1]+=grad[i][1];terms.set(ids[i],g);
    }
    for(const [id,g] of terms){
      budget.spend();const norm=Math.hypot(...g);if(norm<=1e-9)continue;
      const list=requirements.get(id)??[];
      list.push({x:sign*g[0]/norm,y:sign*g[1]/norm,base:sign*base/norm,scale:len/norm});
      requirements.set(id,list);
    }
  }
  for(const d of report.geometryDiagnostics){
    budget.spend();
    if(!['unnormalized-crossing','overlapping-roads'].includes(d.code))continue;
    const ids=d.refs.filter(r=>r.collection==='roads').map(r=>r.id).sort(riCompare);
    if(ids.length!==2)throw Error('Unexpected analytical road pair.');
    const key=JSON.stringify(ids);if(seen.has(key))continue;seen.add(key);
    const [a,b]=ids.map(id=>graph.roadsById.get(id));
    const movable=[...new Set([a.a,a.b,b.a,b.b])].filter(id=>eligible.has(id)).sort(riCompare);
    pairSets.push(movable);
    for(const triplet of [[a.a,a.b,b.a],[a.a,a.b,b.b],[b.a,b.b,a.a],[b.a,b.b,a.b]])addTriplet(triplet);
  }
  telemetry.pairs=pairSets.length;
  if(!pairSets.length||pairSets.some(s=>!s.length))return;
  const all=[...new Set(pairSets.flat())].sort(riCompare);chargeSort(all.length,budget);
  // Only connected groups with <=4 endpoints covering every observed pair.
  // Supersets up to cap are included; first 32 groups, no scope enlargement.
  function connected(ids){
    const allowed=new Set([...selected,...ids]),reached=new Set(),q=[ids[0]];
    for(let i=0;i<q.length;i++){
      budget.spend();const id=q[i];if(reached.has(id))continue;reached.add(id);
      for(const n of graph.adjacency.get(id)){budget.spend();if(allowed.has(n)&&!reached.has(n))q.push(n);}
    }
    return ids.every(id=>reached.has(id));
  }
  function* groups(k,start,ids){
    budget.spend();
    if(!k){
      telemetry.subsets++;
      for(const s of pairSets){budget.spend(1+s.length);if(!s.some(id=>ids.includes(id)))return;}
      telemetry.covering++;
      if(connected(ids))yield ids;
      return;
    }
    for(let i=start;i<=all.length-k;i++)yield* groups(k-1,i+1,[...ids,all[i]]);
  }
  const pool=[];
  outer:for(let k=2;k<=4;k++)for(const ids of groups(k,0,[])){
    pool.push(ids);if(pool.length===32){telemetry.groupLimit=true;break outer;}
  }
  telemetry.connectedGroups=pool.length;
  const vectors=new Map();
  function choices(id,margin){
    const key=id+':'+margin;if(vectors.has(key))return vectors.get(key);
    const req=(requirements.get(id)??[]).map(r=>({...r,target:margin*r.scale-r.base}));
    budget.spend(Math.max(1,req.length));
    const active=req.filter(r=>r.target>0);
    chargeSort(active.length,budget);active.sort((a,b)=>b.target-a.target);
    const top=active.slice(0,12),proposals=[],dedup=new Set();
    function offer(x,y){
      budget.spend(4);
      if(!Number.isFinite(x)||!Number.isFinite(y))return;
      const n=Math.hypot(x,y);if(n<=1e-9)return;
      // Clamp just below cap to avoid floating error on the final coordinate.
      if(n>=limit){x*=limit*(1-1e-12)/n;y*=limit*(1-1e-12)/n;}
      const p=old(id),q={x:p.x+x,y:p.y+y};
      if(Math.hypot(q.x-p.x,q.y-p.y)>limit||q.x===p.x&&q.y===p.y)return;
      const k=JSON.stringify(q);if(dedup.has(k))return;dedup.add(k);
      let loss=0;
      for(const r of req){budget.spend();const deficit=Math.max(0,r.target-r.x*x-r.y*y);loss+=deficit*deficit;}
      proposals.push({point:q,loss,n:Math.hypot(x,y)});
    }
    let sx=0,sy=0;
    for(const r of top){
      budget.spend();sx+=r.x*r.target;sy+=r.y*r.target;
      for(const scale of [.5,1,1.5,2])offer(r.x*r.target*scale,r.y*r.target*scale);
    }
    if(top.length){offer(sx,sy);offer(sx/top.length,sy/top.length);}
    for(let i=0;i<top.length;i++)for(let j=i+1;j<top.length;j++){
      budget.spend();const a=top[i],b=top[j],det=a.x*b.y-a.y*b.x;
      if(Math.abs(det)>1e-8)offer((a.target*b.y-a.y*b.target)/det,(a.x*b.target-a.target*b.x)/det);
    }
    // Preserve an explicit directional seed alongside analytic options.
    offer(offset.x,offset.y);offer(-offset.x,-offset.y);
    chargeSort(proposals.length,budget);
    proposals.sort((a,b)=>a.loss-b.loss||a.n-b.n||a.point.x-b.point.x||a.point.y-b.point.y);
    const result=proposals.slice(0,6).map(r=>r.point);vectors.set(key,result);return result;
  }
  const emitted=new Set();
  // Breadth across coverage groups before rank combinations. All 256
  // evaluated candidates share the caller's unchanged root.
  for(const margin of [.25,1,4,8])for(let rank=0;rank<6;rank++)for(const ids of pool){
    budget.spend();
    const opts=ids.map(id=>choices(id,margin));if(opts.some(o=>!o.length))continue;
    for(let mix=-1;mix<ids.length;mix++){
      budget.spend(1+ids.length);
      const points=ids.map((id,i)=>[id,opts[i][(rank+(i===mix?1:0))%opts[i].length]]);
      const k=JSON.stringify(points);if(emitted.has(k))continue;emitted.add(k);
      yield {ids,analyticalPoints:new Map(points),strategy:'analytical-independent'};
    }
  }
}
