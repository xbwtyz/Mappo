import {riCompare} from '../../../src/core/road-impact-model.js';
import {measureContactCover} from './ares-p5-holdout-cover.mjs';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
// Read-only connected hitting set. Larger sizes are observations, never
// candidate groups or permissions. Prove minimum only after all smaller
// sizes have been exhausted or a certified lower bound excludes them.
export function measureConnectedMinimum(clauses,adj,b){
 const plain=measureContactCover(clauses,b);
 if(plain.status==='no-endpoint-cover')return {status:'no-endpoint-cover',plain,minimum:null,lower:null,witness:null,states:0};
 if(!clauses.length)return {status:'exact',plain,minimum:0,lower:0,witness:[],states:0};
 const unique=new Map();
 for(const c of clauses){b.spend(1+c.length);const v=[...new Set(c)].sort(riCompare);unique.set(JSON.stringify(v),v);}
 const rows=[...unique.values()].sort((a,c)=>a.length-c.length||riCompare(JSON.stringify(a),JSON.stringify(c)));
 let states=0,lower=Math.max(1,plain.lower??1);
 try{
  for(let k=lower;k<=adj.size;k++){
   const seen=new Set();let limited=false;
   function visit(chosen){
    const ids=[...chosen].sort(riCompare),key=JSON.stringify(ids);b.spend(1+ids.length);
    if(seen.has(key))return null;
    if(states>=8192){limited=true;return null;}
    seen.add(key);states++;b.expand();
    let branch=rows.find(c=>{b.spend(1+c.length);return !c.some(id=>chosen.has(id));});
    if(!branch){
     const reached=new Set([ids[0]]),q=[ids[0]];
     for(const id of q)for(const v of adj.get(id)??[]){b.spend();if(chosen.has(v)&&!reached.has(v)){reached.add(v);q.push(v);}}
     if(reached.size===ids.length)return ids;
     const frontier=new Set();
     for(const id of reached)for(const v of adj.get(id)??[]){b.spend();if(!chosen.has(v))frontier.add(v);}
     branch=[...frontier].sort(riCompare);
    }
    if(ids.length>=k)return null;
    for(const id of branch){b.spend();const next=new Set(chosen);next.add(id);const result=visit(next);if(result||limited)return result;}
    return null;
   }
   const witness=visit(new Set());
   if(witness)return {status:'exact',plain,minimum:witness.length,lower:witness.length,witness,states};
   if(limited)return {status:'bounded-unknown',plain,minimum:null,lower,witness:null,states,reason:'enumeration-limit'};
   lower=k+1;
  }
  return {status:'no-connected-cover',plain,minimum:null,lower:null,witness:null,states};
 }catch(e){if(!(e instanceof LareBudgetExceeded))throw e;return {status:'bounded-unknown',plain,minimum:null,lower,witness:null,states,reason:e.resource};}
}
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
// Exact cyclic equivalence allows any rotation of the bearing labels.
// Match current sorted angular slots to prior labels over every cyclic
// shift, select least squared angular correction. No pairwise sign lock.
export function cyclicTargets(prior,actual,b){
 if(prior.length!==actual.length||new Set(prior).size!==prior.length||new Set(actual.map(r=>r.rid)).size!==actual.length||actual.some(r=>!prior.includes(r.rid)))throw Error('Invalid cyclic labels.');
 if(prior.length<3)return [];
 const rows=[...actual].sort((a,c)=>a.angle-c.angle||riCompare(a.rid,c.rid)),by=new Map(rows.map(r=>[r.rid,r.angle]));let best=null;
 for(let shift=0;shift<prior.length;shift++){
  let cost=0;const targets=[];
  for(let i=0;i<prior.length;i++){b.spend(4);const rid=prior[i],delta=wrap(rows[(i+shift)%rows.length].angle-by.get(rid));cost+=delta*delta;targets.push({rid,delta});}
  if(!best||cost<best.cost)best={cost,targets};
 }
 return best.targets;
}
export function projectCyclic(graph,exact,points,affected,orders,offset,variant,b){
 const limit=Math.hypot(offset.x,offset.y),relax=[.55,.85,1.1][variant%3];
 const now=id=>points.get(id)??exact.get(id)??graph.nodesById.get(id);
 for(let pass=0;pass<6;pass++){
  for(let i=0;i<affected.length;i++){
   b.spend();const id=affected[variant%2?affected.length-1-i:i],center=now(id),prior=orders.get(id);
   if(prior.length<3)continue;
   const arms=prior.map(rid=>{b.spend(4);const r=graph.roadsById.get(rid),other=r.a===id?r.b:r.a,p=now(other);return {rid,other,angle:Math.atan2(p.y-center.y,p.x-center.x)};});
   const target=cyclicTargets(prior,arms,b),grad=new Map(),by=new Map(arms.map(a=>[a.rid,a]));
   for(const {rid,delta} of target){
    b.spend(12);if(Math.abs(delta)<1e-8)continue;
    const other=by.get(rid).other,p=now(other),dx=p.x-center.x,dy=p.y-center.y,denom=dx*dx+dy*dy;
    if(denom<=1e-12)continue;
    const terms=[[other,-dy/denom,dx/denom],[id,dy/denom,-dx/denom]].filter(t=>points.has(t[0]));
    const norm=terms.reduce((s,t)=>s+t[1]*t[1]+t[2]*t[2],0);if(norm<=1e-16)continue;
    // Small overshoot prevents a proposal from stopping exactly on a tie.
    const step=(delta+Math.sign(delta)*.002)*relax/norm;
    for(const [v,x,y] of terms){b.spend(4);const q=grad.get(v)??[0,0,0];q[0]+=x*step;q[1]+=y*step;q[2]++;grad.set(v,q);}
   }
   for(const [v,g] of grad){b.spend(8);const p=points.get(v),old=graph.nodesById.get(v),dx=p.x+g[0]/g[2]-old.x,dy=p.y+g[1]/g[2]-old.y,d=Math.hypot(dx,dy);
    if(!Number.isFinite(d))continue;const k=d>limit*(1-1e-12)?limit*(1-1e-12)/d:1;points.set(v,{x:old.x+dx*k,y:old.y+dy*k});}
  }
 }
 return points;
}
