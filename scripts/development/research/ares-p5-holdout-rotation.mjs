import {riCompare} from '../../../src/core/road-impact-model.js';
// Pure research constraints. Only the caller's freshly eligible vertices
// may enter a clause. A clause is necessary, not sufficient for feasibility.
export function rotationCoverGroups(clauses,adj,b,cap=4){
 if(cap!==4)throw Error('Rotation cover cap must be four.');
 return enumerateRotationCovers(clauses,adj,b,cap);
}
// Detached, owner-approved fixed numerical study only. Historical API remains locked.
export function reformRotationCoverGroups(clauses,adj,b,cap){
 if(cap!==4&&cap!==8)throw Error('Invalid reform cluster cap.');
 return enumerateRotationCovers(clauses,adj,b,cap);
}
function enumerateRotationCovers(clauses,adj,b,cap){
 const unique=new Map();
 for(const c of clauses){b.spend(1+c.length);const ids=[...new Set(c)].sort(riCompare);unique.set(JSON.stringify(ids),ids);}
 const rows=[...unique.values()];b.spend(Math.max(1,rows.length*Math.ceil(Math.log2(rows.length+1))));rows.sort((a,c)=>a.length-c.length||riCompare(JSON.stringify(a),JSON.stringify(c)));
 if(rows.some(c=>!c.length))return {status:'empty-clause',groups:[],states:0};
 if(!rows.length)return {status:'no-required-contacts',groups:[],states:0};
 const seen=new Set(),groups=[],keys=new Set();let limited=false;
 const visit=chosen=>{
  if(limited)return;
  const ids=[...chosen].sort(riCompare),key=JSON.stringify(ids);b.spend(1+ids.length);
  if(seen.has(key))return;
  if(seen.size>=8192||groups.length>=32){limited=true;return;}
  seen.add(key);b.expand();
  let branch=rows.find(c=>{b.spend(1+c.length);return !c.some(id=>chosen.has(id));});
  if(!branch){
   const reached=new Set([ids[0]]),q=[ids[0]];
   for(const id of q)for(const v of adj.get(id)??[]){b.spend();if(chosen.has(v)&&!reached.has(v)){reached.add(v);q.push(v);}}
   if(reached.size===ids.length){
    if(!keys.has(key)){keys.add(key);groups.push(ids);}
    // Explore connected supersets within the same four-node authority.
   }
   const frontier=new Set();
   for(const id of reached)for(const v of adj.get(id)??[]){b.spend();if(!chosen.has(v))frontier.add(v);}
   branch=[...frontier].sort(riCompare);
  }
  if(chosen.size>=cap)return;
  for(const id of branch){b.spend();const next=new Set(chosen);next.add(id);visit(next);if(limited)return;}
 };
 visit(new Set());
 groups.sort((a,c)=>a.length-c.length||riCompare(JSON.stringify(a),JSON.stringify(c)));
 return {status:groups.length?'groups-found':limited?'enumeration-limited':'no-connected-cover',groups,states:seen.size,limited};
}
const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function rotationTriplets(graph,nodeIds,allowed,b){
 const out=[];
 for(const id of nodeIds){
  b.spend();const n=graph.nodesById.get(id),neighbors=[...graph.incidentRoads.get(id)].map(rid=>{b.spend();const r=graph.roadsById.get(rid);return {rid,id:r.a===id?r.b:r.a};});
  if(neighbors.length<3)continue;
  // Preserve prior pairwise orientation as a conservative heuristic.
  // It may overconstrain a legal cyclic ordering; the exact gate is unchanged.
  for(let i=0;i<neighbors.length;i++)for(let j=i+1;j<neighbors.length;j++){
   b.spend(8);const ids=[id,neighbors[i].id,neighbors[j].id];if(!ids.some(v=>allowed.has(v)))continue;
   const a=graph.nodesById.get(ids[1]),c=graph.nodesById.get(ids[2]),o=orient(n,a,c);
   if(Math.abs(o)<=1e-9)continue;
   out.push({ids,sign:Math.sign(o)});
  }
 }
 return out;
}
export function projectRotation(graph,exact,points,triplets,offset,variant,b){
 const limit=Math.hypot(offset.x,offset.y),margin=[.05,.25,.75,1.5][variant%4],relax=[.65,1,1.2][variant%3];
 const now=id=>points.get(id)??exact.get(id)??graph.nodesById.get(id);
 for(let pass=0;pass<4;pass++)for(let i=0;i<triplets.length;i++){
  b.spend(16);const t=triplets[variant%2?triplets.length-1-i:i], [a,c,d]=t.ids.map(now);
  const len=Math.max(1,Math.min(Math.hypot(c.x-a.x,c.y-a.y),Math.hypot(d.x-a.x,d.y-a.y)));
  const deficit=margin*len-t.sign*orient(a,c,d);if(deficit<=0)continue;
  const grad=[[c.y-d.y,d.x-c.x],[d.y-a.y,a.x-d.x],[a.y-c.y,c.x-a.x]],terms=new Map();
  for(let j=0;j<3;j++){b.spend();const id=t.ids[j];if(!points.has(id))continue;const v=terms.get(id)??[0,0];v[0]+=t.sign*grad[j][0];v[1]+=t.sign*grad[j][1];terms.set(id,v);}
  let norm=0;for(const v of terms.values()){b.spend();norm+=v[0]*v[0]+v[1]*v[1];}if(norm<=1e-12)continue;
  for(const [id,v] of terms){b.spend(8);const p=points.get(id),old=graph.nodesById.get(id),step=relax*deficit/norm;
   const dx=p.x+step*v[0]-old.x,dy=p.y+step*v[1]-old.y,distance=Math.hypot(dx,dy);
   if(!Number.isFinite(distance))continue;
   const k=distance>limit*(1-1e-12)?limit*(1-1e-12)/distance:1;
   points.set(id,{x:old.x+dx*k,y:old.y+dy*k});
  }
 }
 return points;
}
