import { riCompare } from '../../../src/core/road-impact-model.js';
import { X34_IDS } from './ares-p4x-analytical.mjs';

// Frozen ten exact X34 search refusals; not a general research entrypoint.
export const X56_IDS=Object.freeze([
  "linear-medium:eight-loop:75:y",
  "linear-medium:five-branch:100:diagonal",
  "linear-medium:five-chain:100:diagonal",
  "radial-small:eight-loop:100:diagonal",
  "radial-small:eight-loop:100:x",
  "radial-small:eight-loop:50:y",
  "radial-small:eight-loop:75:x",
  "radial-small:eight-loop:75:y",
  "radial-small:five-branch:75:diagonal",
  "radial-small:five-chain:50:y"
]);
if(X56_IDS.length!==10||new Set(X56_IDS).size!==10||!X56_IDS.every(id=>X34_IDS.includes(id)))throw Error('Invalid X56 target inventory.');
const order=(a,b)=>riCompare(a,b);
const sort=(a,budget,cmp=order)=>{budget.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));return a.sort(cmp);};
const pairCode=c=>c==='unnormalized-crossing'||c==='overlapping-roads';
const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function pairsFor(graph,diagnostics,eligible,budget){
  const seen=new Set(),out=[];
  for(const d of diagnostics){
    budget.spend();
    if(!pairCode(d.code))continue;
    const ids=sort([...(d.roadIds??d.refs.filter(r=>r.collection==='roads').map(r=>r.id))],budget);
    if(ids.length!==2||!ids.every(id=>graph.roadsById.has(id)))throw Error('Incomplete X56 conflict pair.');
    const key=JSON.stringify(ids);if(seen.has(key))continue;seen.add(key);
    const [a,b]=ids.map(id=>graph.roadsById.get(id)),ends=[a.a,a.b,b.a,b.b];
    const movable=sort([...new Set(ends)].filter(id=>eligible.has(id)),budget);
    out.push({ids,ends,movable,triplets:[[a.a,a.b,b.a],[a.a,a.b,b.b],[b.a,b.b,a.a],[b.a,b.b,a.b]]});
  }
  return sort(out,budget,(a,b)=>order(a.ids[0],b.ids[0])||order(a.ids[1],b.ids[1]));
}
// Enumerate connected subsets of the SAME eligible junctions, contracting
// only paths through exact-selected nodes. Non-conflicting connectors still
// count toward the cap, and must actually move in a retained candidate.
export function hybridGroups(graph,rows,selected,pairs,budget,telemetry){
  const eligible=new Set(rows.map(r=>r.ref.id)),direct=new Set(pairs.flatMap(p=>p.movable));
  if(!pairs.length||pairs.some(p=>!p.movable.length))return [];
  const adj=new Map();
  for(const id of sort([...eligible],budget)){
    const seen=new Set([id]),queue=[id],found=new Set();
    for(let i=0;i<queue.length;i++){
      budget.spend();
      for(const n of graph.adjacency.get(queue[i])){
        budget.spend();if(seen.has(n))continue;seen.add(n);
        if(eligible.has(n))found.add(n);
        else if(selected.has(n))queue.push(n);
      }
    }
    adj.set(id,sort([...found],budget));
  }
  const queue=[],seen=new Set(),groups=[];
  function enqueue(ids){
    budget.spend(1+ids.length);const key=JSON.stringify(ids);
    if(seen.has(key))return;
    if(seen.size>=8192){telemetry.enumerationLimit=true;return;}
    budget.expand();seen.add(key);queue.push(ids);
  }
  for(const id of sort([...direct],budget))enqueue([id]);
  for(let i=0;i<queue.length;i++){
    budget.spend();const ids=queue[i];telemetry.subsets++;
    if(ids.length>=2){
      let covers=true;
      for(const pair of pairs){budget.spend(1+pair.movable.length*ids.length);if(!pair.movable.some(n=>ids.includes(n))){covers=false;break;}}
      if(covers){
        telemetry.coveringGroups++;
        if(groups.length<32)groups.push(ids);else telemetry.groupLimit=true;
      }
    }
    if(ids.length===4||telemetry.groupLimit)continue;
    const frontier=new Set();
    for(const id of ids)for(const n of adj.get(id)){budget.spend();if(!ids.includes(n))frontier.add(n);}
    for(const n of sort([...frontier],budget))enqueue(sort([...ids,n],budget));
  }
  telemetry.connectedGroups=groups.length;
  telemetry.connectorGroups=groups.filter(ids=>ids.some(id=>!direct.has(id))).length;
  return groups;
}
function clamp(old,p,limit){
  const dx=p.x-old.x,dy=p.y-old.y,n=Math.hypot(dx,dy);
  if(!Number.isFinite(n))throw Error('Nonfinite X56 vector.');
  if(n<=limit*(1-1e-12))return {x:p.x,y:p.y};
  const k=limit*(1-1e-12)/n;
  return {x:old.x+dx*k,y:old.y+dy*k};
}
// Project a joint orientation inequality using gradients at the CURRENT
// candidate, not the translated baseline. Accepted-side orientation is a
// heuristic only; the unchanged exact oracle decides whether it is valid.
function requirement(graph,positions,points,ids,triplet,margin,budget){
  budget.spend(16);
  const old=id=>graph.nodesById.get(id),now=id=>points.get(id)??positions.get(id)??old(id);
  const sign=Math.sign(orient(...triplet.map(old)));
  if(!sign)return null;
  const [a,b,c]=triplet.map(now),len=Math.hypot(b.x-a.x,b.y-a.y);
  if(len<=1e-9)return null;
  const deficit=margin*len-sign*orient(a,b,c);
  const grad=[[b.y-c.y,c.x-b.x],[c.y-a.y,a.x-c.x],[a.y-b.y,b.x-a.x]],terms=new Map();
  for(let i=0;i<3;i++){
    budget.spend();const id=triplet[i];if(!ids.has(id))continue;
    const g=terms.get(id)??[0,0];g[0]+=sign*grad[i][0];g[1]+=sign*grad[i][1];terms.set(id,g);
  }
  let norm=0;for(const g of terms.values()){budget.spend();norm+=g[0]*g[0]+g[1]*g[1];}
  return {deficit,terms,norm,cost:deficit<=0?0:norm>1e-12?deficit*deficit/norm:Infinity};
}
function project(graph,positions,points,ids,pairs,offset,variant,budget){
  const allowed=new Set(ids),limit=Math.hypot(offset.x,offset.y),margin=[.25,1,3,6][variant%4],relax=[.7,1,1.25][variant%3];
  // A small fixed number of joint passes. Every new full candidate consumes
  // the shared outer candidate cap; internal projection work is also charged.
  for(let pass=0;pass<3;pass++){
    for(let i=0;i<pairs.length;i++){
      budget.spend();const pair=pairs[(variant%2?pairs.length-1-i:i)];
      const signs=pair.triplets.map(t=>Math.sign(orient(...t.map(id=>graph.nodesById.get(id)))));
      const sides=[];
      for(const start of [0,2]){
        budget.spend();
        if(signs[start]&&signs[start+1]&&signs[start]!==signs[start+1])continue;
        const ts=pair.triplets.slice(start,start+2).filter((_,j)=>signs[start+j]);
        if(!ts.length)continue;
        const rs=ts.map(t=>requirement(graph,positions,points,allowed,t,margin,budget));
        if(rs.some(r=>!r||!Number.isFinite(r.cost)))continue;
        sides.push({ts,cost:rs.reduce((n,r)=>n+r.cost,0)});
      }
      sort(sides,budget,(a,b)=>a.cost-b.cost);
      const chosen=sides[variant%5===4&&sides.length>1?1:0];
      if(!chosen)continue;
      for(const triplet of chosen.ts){
        const r=requirement(graph,positions,points,allowed,triplet,margin,budget);
        if(!r||r.deficit<=0||r.norm<=1e-12)continue;
        const step=relax*r.deficit/r.norm;
        for(const [id,g] of r.terms){
          budget.spend(4);const p=points.get(id),old=graph.nodesById.get(id);
          points.set(id,clamp(old,{x:p.x+step*g[0],y:p.y+step*g[1]},limit));
        }
      }
    }
  }
}
function seed(graph,ids,offset,variant,budget){
  const limit=Math.hypot(offset.x,offset.y),points=new Map();
  const angle=[0,Math.PI/2,-Math.PI/2,Math.PI,Math.PI/4,-Math.PI/4][variant%6],scale=[.0625,.25,.5,1][Math.floor(variant/6)%4];
  for(const id of ids){
    budget.spend(4);const old=graph.nodesById.get(id),x=(offset.x*Math.cos(angle)-offset.y*Math.sin(angle))*scale,y=(offset.x*Math.sin(angle)+offset.y*Math.cos(angle))*scale;
    points.set(id,clamp(old,{x:old.x+x,y:old.y+y},limit));
  }
  return points;
}
export function* hybridTrials(graph,rows,positions,report,offset,budget,telemetry,feedback){
  const eligible=new Set(rows.map(r=>r.ref.id)),baseline=pairsFor(graph,report.geometryDiagnostics,eligible,budget);
  telemetry.baselinePairs=baseline.length;
  const groups=hybridGroups(graph,rows,new Set(positions.keys()),baseline,budget,telemetry);
  const states=groups.map(ids=>({ids,best:null,last:null,seen:new Set(),attempt:0}));
  // Breadth across groups; every third arm restarts from a directional
  // stencil. Other arms use the last or best *actual oracle* conflict set.
  // Never carry geometry outside this case or reset its shared root.
  for(let round=0;round<48;round++){
    let emitted=false;
    for(const s of states){
      budget.spend();const variant=s.attempt++,prior=variant%3===0?null:variant%3===1?s.last:s.best;
      const points=prior?new Map(prior.points):seed(graph,s.ids,offset,Math.floor(variant/3),budget);
      const pairs=prior?.pairs?.length?prior.pairs:baseline;
      if(prior)telemetry.feedbackProposals++;else telemetry.seedProposals++;
      project(graph,positions,points,s.ids,pairs,offset,variant,budget);
      const limit=Math.hypot(offset.x,offset.y);
      // All counted connectors are real adjusted junctions, never virtual
      // authority. A collapsed vector gets a small bounded directional seed.
      for(const id of s.ids){
        budget.spend(4);const old=graph.nodesById.get(id),p=points.get(id);
        if(p.x===old.x&&p.y===old.y)points.set(id,clamp(old,{x:old.x+offset.x*.001,y:old.y+offset.y*.001},limit));
      }
      const key=JSON.stringify(s.ids.map(id=>[id,points.get(id)]));budget.spend(1+s.ids.length);
      if(s.seen.has(key)){telemetry.duplicates++;continue;}s.seen.add(key);
      feedback.value=null;emitted=true;
      const strategy=prior?'hybrid-refinement':'hybrid-directional-seed';
      yield {ids:s.ids,analyticalPoints:points,strategy};
      const checked=feedback.value;
      if(!checked)continue;
      const actual=pairsFor(graph,checked.conflictPairs??[],eligible,budget);
      budget.spend(1+checked.issues.length);
      const other=checked.issues.filter(c=>!pairCode(c)).length;
      const score=checked.valid?0:actual.length+100000*(other+(actual.length?0:1));
      const entry={points:new Map(points),pairs:actual,score};
      s.last=entry;
      if(!s.best||score<s.best.score)s.best=entry;
      if(telemetry.bestConflictCount===null||actual.length<telemetry.bestConflictCount)telemetry.bestConflictCount=actual.length;
      telemetry.feedbackEvaluations++;
    }
    if(!emitted&&round>=6)break;
  }
}
