import {riCompare} from '../../../src/core/road-impact-model.js';
import {pairsFor,hybridGroups} from './ares-p4x-hybrid.mjs';
import {x7Groups} from './ares-p4x-x7-scope.mjs';
const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const sort=(a,b,cmp=riCompare)=>{b.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));return a.sort(cmp);};
const pairCode=c=>c==='unnormalized-crossing'||c==='overlapping-roads';
const old=(g,id)=>g.nodesById.get(id);
const pairKey=p=>JSON.stringify(p.ids);
function bounded(origin,p,limit){
  const dx=p.x-origin.x,dy=p.y-origin.y,n=Math.hypot(dx,dy),cap=limit*(1-1e-12);
  if(!Number.isFinite(n))throw Error('Nonfinite radial vector.');
  return n<=cap?{x:p.x,y:p.y}:{x:origin.x+dx*cap/n,y:origin.y+dy*cap/n};
}
// Linearized signed half-plane requirement. Shared endpoints are omitted
// when a triplet repeats an ID; they are identically on the line.
function requirement(g,exact,points,allowed,t,sign,margin,b){
  b.spend(18);
  if(new Set(t).size!==3)return null;
  const [a,c,d]=t.map(id=>points.get(id)??exact.get(id)??old(g,id)),len=Math.hypot(c.x-a.x,c.y-a.y);
  if(len<1e-9)return null;
  const deficit=margin*len-sign*orient(a,c,d);
  const gradients=[[c.y-d.y,d.x-c.x],[d.y-a.y,a.x-d.x],[a.y-c.y,c.x-a.x]],terms=[];
  let norm=0;
  for(let i=0;i<3;i++){b.spend();if(!allowed.has(t[i]))continue;const x=sign*gradients[i][0],y=sign*gradients[i][1];terms.push({id:t[i],x,y});norm+=x*x+y*y;}
  return {deficit,terms,norm,cost:deficit<=0?0:norm>1e-12?deficit*deficit/norm:Infinity};
}
// A pair is separable if either road's other endpoints lie on one side
// of the opposite line. Explore both signs; accepted signs are a soft
// preference, not a hard rule. Exact oracle still rejects invalid topology.
function alternatives(g,exact,points,allowed,pair,margin,variant,b){
  const candidates=[];
  for(const start of [0,2])for(const sign of [1,-1]){
    b.spend();
    const ts=pair.triplets.slice(start,start+2).filter(t=>new Set(t).size===3);
    if(!ts.length)continue;
    const rs=ts.map(t=>requirement(g,exact,points,allowed,t,sign,margin,b));
    if(rs.some(r=>!r||!Number.isFinite(r.cost)))continue;
    const flips=ts.filter(t=>Math.sign(orient(...t.map(id=>old(g,id))))===-sign).length;
    const cost=rs.reduce((s,r)=>s+r.cost,0),penalty=[0,.1,.5,2][variant%4];
    candidates.push({ts,sign,cost:cost*(1+penalty*flips)+flips*penalty,flips});
  }
  return sort(candidates,b,(a,c)=>a.cost-c.cost||a.flips-c.flips||a.sign-c.sign);
}
function project(g,exact,points,ids,pairs,offset,variant,b,tele,diagnostic=null){
  const allowed=new Set(ids),limit=Math.hypot(offset.x,offset.y),margin=[.1,.5,1.5,3,6][variant%5],relax=[.65,1,1.2][variant%3];
  for(let pass=0;pass<3;pass++){
    const ranked=[];
    for(const pair of pairs){
      b.spend(1+pair.movable.length);
      const options=diagnostic?diagnostic.measure('orientation-ranking',b,()=>alternatives(g,exact,points,allowed,pair,margin,variant,b),true):alternatives(g,exact,points,allowed,pair,margin,variant,b);
      if(!options.length)continue;
      const degrees=pair.movable.filter(n=>allowed.has(n)).length;
      ranked.push({pair,degrees,cost:options[0].cost});
    }
    // Prefer conflicts with few available variables, then the most
    // expensive separation. Alternate severity-first to avoid starvation.
    sort(ranked,b,(a,c)=>variant%3===2?c.cost-a.cost||a.degrees-c.degrees||riCompare(pairKey(a.pair),pairKey(c.pair)):a.degrees-c.degrees||c.cost-a.cost||riCompare(pairKey(a.pair),pairKey(c.pair)));
    for(let i=0;i<ranked.length;i++){
      b.spend();const pair=ranked[variant%7===6?ranked.length-1-i:i].pair;
      const opts=diagnostic?diagnostic.measure('orientation-recomputation',b,()=>alternatives(g,exact,points,allowed,pair,margin,variant,b),true):alternatives(g,exact,points,allowed,pair,margin,variant,b);
      if(!opts.length)continue;
      const index=opts.length>1&&variant%5===4?1:0,choice=opts[index];
      tele.orientationChoices++;if(choice.flips)tele.alternateSigns++;
      for(const t of choice.ts){
        const r=requirement(g,exact,points,allowed,t,choice.sign,margin,b);
        if(!r||r.deficit<=0||r.norm<=1e-12)continue;
        const step=relax*r.deficit/r.norm;
        for(const term of r.terms){
          b.spend(5);const p=points.get(term.id),origin=old(g,term.id);
          points.set(term.id,bounded(origin,{x:p.x+step*term.x,y:p.y+step*term.y},limit));
        }
      }
    }
  }
}
function seed(g,ids,offset,variant,b){
  const limit=Math.hypot(offset.x,offset.y),points=new Map();
  const scale=[.08,.25,.5,.85][Math.floor(variant/8)%4],kind=variant%8;
  for(const id of ids){
    b.spend(8);const p=old(g,id);
    let x=offset.x/limit,y=offset.y/limit;
    if(kind>=4){
      // Local road direction, not a guessed city center. Longest incident
      // road provides a deterministic local spoke/tangent frame.
      let longest=0,axis=null;
      for(const n of g.adjacency.get(id)){b.spend();const q=old(g,n),dx=q.x-p.x,dy=q.y-p.y,l=Math.hypot(dx,dy);if(l>longest){longest=l;axis=[dx/l,dy/l];}}
      if(axis){[x,y]=axis;if(kind%2===1)[x,y]=[-y,x];if(kind>=6){x=-x;y=-y;}}
    }else{
      const angle=[0,Math.PI/2,-Math.PI/2,Math.PI][kind];
      [x,y]=[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];
    }
    points.set(id,bounded(p,{x:p.x+x*limit*scale,y:p.y+y*limit*scale},limit));
  }
  return points;
}
function union(a,c,b){
  const out=new Map();
  for(const p of [...a,...c]){b.spend();out.set(pairKey(p),p);}
  return [...out.values()];
}
// One stream and one shared root. Warm up every retained group; then
// interleave incumbent exploitation with least-visited exploration.
// A bounded proposal schedule cannot imply infeasibility.
export function* radialTrials(g,rows,exact,report,offset,b,tele,feedback,recipe,diagnostic=null){
  const eligible=new Set(rows.map(r=>r.ref.id)),baseline=pairsFor(g,report.geometryDiagnostics,eligible,b);
  tele.baselinePairs=baseline.length;
  const selected=new Set(exact.keys()),groups=recipe.minimumRecipe?x7Groups(g,rows,selected,baseline,b,tele,recipe.minimumRecipe):hybridGroups(g,rows,selected,baseline,b,tele);
  const states=groups.map((ids,i)=>({ids,i,visits:0,best:null,last:null,seen:new Set(),recent:[]}));
  for(let slot=0;slot<768&&states.length;slot++){
    b.spend();let state;
    if(slot<states.length){state=states[slot];tele.explore++;}
    else if(slot%3===0){
      state=sort([...states],b,(a,c)=>a.visits-c.visits||a.i-c.i)[0];tele.explore++;
    }else{
      state=sort([...states],b,(a,c)=>(a.best?.score??Infinity)-(c.best?.score??Infinity)||a.visits-c.visits||a.i-c.i)[0];tele.exploit++;
      // If a group stalls, reserve exploration rather than repeatedly
      // spending the same priority slot on duplicates.
      if(state.visits>Math.min(...states.map(s=>s.visits))+12)state=sort([...states],b,(a,c)=>a.visits-c.visits||a.i-c.i)[0];
    }
    const variant=state.visits++,prior=variant%4===0?null:variant%4===1?state.last:state.best;
    const points=prior?new Map(prior.points):seed(g,state.ids,offset,Math.floor(variant/4),b);
    if(prior)tele.feedbackProposals++;else tele.seedProposals++;
    // Retain original constraints to avoid cycling between newly fixed
    // and newly broken pairs. Recent actual pairs take precedence.
    const pairs=prior?union(prior.pairs,variant%3===0?state.recent:baseline,b):baseline;
    if(diagnostic)diagnostic.measure('projection',b,()=>project(g,exact,points,state.ids,pairs,offset,variant,b,tele,diagnostic),true);
    else project(g,exact,points,state.ids,pairs,offset,variant,b,tele);
    const limit=Math.hypot(offset.x,offset.y);
    for(const id of state.ids){
      b.spend(4);const p=old(g,id),q=points.get(id);
      if(p.x===q.x&&p.y===q.y)points.set(id,bounded(p,{x:p.x+offset.x*.001,y:p.y+offset.y*.001},limit));
    }
    const key=JSON.stringify(state.ids.map(id=>[id,points.get(id)]));b.spend(1+state.ids.length);
    if(state.seen.has(key)){tele.duplicates++;continue;}state.seen.add(key);
    feedback.value=null;
    yield {ids:state.ids,analyticalPoints:points,strategy:prior?'radial-refinement':'radial-directional-seed'};
    const checked=feedback.value;if(!checked)continue;
    const actual=pairsFor(g,checked.conflictPairs??[],eligible,b);
    b.spend(1+checked.issues.length);
    const other=checked.issues.filter(c=>!pairCode(c)).length;
    const score=checked.valid?0:actual.length+100000*(other+(actual.length?0:1));
    const entry={points:new Map(points),pairs:actual,score};state.last=entry;state.recent=actual;
    if(!state.best||score<state.best.score)state.best=entry;
    if(actual.length||checked.valid)tele.bestConflictCount=tele.bestConflictCount===null?actual.length:Math.min(tele.bestConflictCount,actual.length);
    tele.feedbackEvaluations++;
  }
}
