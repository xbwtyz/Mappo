import {readFileSync} from 'node:fs';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
import {pairsFor} from './ares-p4x-hybrid.mjs';
import {RADIAL_IDS,radialRecipe} from './ares-p4x-radial-scope.mjs';
const SEEDS=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4x-residual-seeds.json',import.meta.url),'utf8')));
const sort=(a,b,cmp=riCompare)=>{b.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));return a.sort(cmp);};
const key=p=>JSON.stringify(p.ids??p.roadIds);
const pairCode=c=>c==='unnormalized-crossing'||c==='overlapping-roads';
const same=(a,c)=>a&&c&&a.x===c.x&&a.y===c.y;
const norm=(a,c)=>Math.hypot(a.x-c.x,a.y-c.y);
const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function residualSeeds(caseId){
  const recipe=radialRecipe(caseId),rows=SEEDS.seeds.filter(r=>r.id===recipe.id);
  if(!rows.length||rows.some(r=>r.source!==recipe.source||r.cap!==recipe.cap||r.best.score[0]!==0))throw Error('Invalid residual seed inventory.');
  return rows;
}
if(SEEDS.seeds.length!==12||new Set(SEEDS.seeds.map(r=>r.id+':'+r.arm)).size!==12||!RADIAL_IDS.every(id=>SEEDS.seeds.some(r=>r.id===id)))throw Error('Invalid residual scope.');
// Cache only coordinate-dependent primitives, not decisions, costs or
// authority. Every lookup compares all six scalar coordinate dependencies.
// Bounded FIFO storage is local to one case; no cross-fixture reuse.
export function createOrientationCache(tele){
  const entries=new Map();
  return {
    get(t,get,b){
      b.spend(9);
      const id=JSON.stringify(t),ps=t.map(get),coords=ps.flatMap(p=>[p.x,p.y]),prev=entries.get(id);
      if(prev&&coords.every((v,i)=>Object.is(v,prev.coords[i]))){tele.cacheHits++;return prev.value;}
      if(prev)tele.cacheInvalidations++;
      tele.cacheMisses++;b.spend(18);
      const [a,c,d]=ps,value={orientation:orient(a,c,d),length:norm(a,c),gradients:[[c.y-d.y,d.x-c.x],[d.y-a.y,a.x-d.x],[a.y-c.y,c.x-a.x]]};
      if(!prev&&entries.size>=512){entries.delete(entries.keys().next().value);tele.cacheEvictions++;}
      entries.set(id,{coords,value});return value;
    }
  };
}
function clamp(origin,p,limit){
  const dx=p.x-origin.x,dy=p.y-origin.y,n=Math.hypot(dx,dy),cap=limit*(1-1e-12);
  if(!Number.isFinite(n))throw Error('Nonfinite residual proposal.');
  return n<=cap?{x:p.x,y:p.y}:{x:origin.x+dx*cap/n,y:origin.y+dy*cap/n};
}
function requirement(g,exact,points,allowed,t,sign,margin,b,cache){
  b.spend(3);
  if(new Set(t).size!==3)return null;
  const v=cache.get(t,id=>points.get(id)??exact.get(id)??g.nodesById.get(id),b);
  if(v.length<1e-9)return null;
  const deficit=margin*v.length-sign*v.orientation,terms=[];
  let norm2=0;
  for(let i=0;i<3;i++){b.spend();if(!allowed.has(t[i]))continue;const x=sign*v.gradients[i][0],y=sign*v.gradients[i][1];terms.push({id:t[i],x,y});norm2+=x*x+y*y;}
  return {deficit,terms,norm2,cost:deficit<=0?0:norm2>1e-12?deficit*deficit/norm2:Infinity};
}
function alternatives(g,exact,points,allowed,pair,margin,b,cache){
  const options=[];
  for(const start of [0,2])for(const sign of [1,-1]){
    b.spend();const ts=pair.triplets.slice(start,start+2).filter(t=>new Set(t).size===3);
    if(!ts.length)continue;
    const rs=ts.map(t=>requirement(g,exact,points,allowed,t,sign,margin,b,cache));
    if(rs.some(r=>!r||!Number.isFinite(r.cost)))continue;
    options.push({ts,sign,cost:rs.reduce((n,r)=>n+r.cost,0)});
  }
  return sort(options,b,(a,c)=>a.cost-c.cost||a.sign-c.sign);
}
function projection(g,exact,points,allowed,pair,margin,choice,step,limit,b,cache){
  const opts=alternatives(g,exact,points,allowed,pair,margin,b,cache);
  if(!opts.length)return false;
  const opt=opts[choice%opts.length];let changed=false;
  for(const t of opt.ts){
    const r=requirement(g,exact,points,allowed,t,opt.sign,margin,b,cache);
    if(!r||r.deficit<=0||r.norm2<=1e-12)continue;
    for(const term of r.terms){
      b.spend(5);const p=points.get(term.id),old=g.nodesById.get(term.id),next=clamp(old,{x:p.x+step*r.deficit*term.x/r.norm2,y:p.y+step*r.deficit*term.y/r.norm2},limit);
      if(!same(p,next)){points.set(term.id,next);changed=true;}
    }
  }
  return changed;
}
function potential(g,exact,points,allowed,pairs,b,cache){
  let value=0;
  for(const p of pairs){b.spend();const options=alternatives(g,exact,points,allowed,p,.05,b,cache);value+=options.length?Math.min(1e15,options[0].cost):1e15;}
  return value;
}
// A parent is admitted only when the exact oracle reports no introduced
// pair and no non-pair issue. A proposal may fail; it never becomes a
// repair parent solely because its aggregate conflict count decreased.
export function preservesPairs(parent,next){
  const before=new Set(parent.map(key));
  return next.every(p=>before.has(key(p)));
}
function connected(g,ids,exact,b){
  const allow=new Set([...ids,...exact.keys()]),seen=new Set(),q=[ids[0]];
  for(let i=0;i<q.length;i++){b.spend();const id=q[i];if(seen.has(id))continue;seen.add(id);for(const n of g.adjacency.get(id)){b.spend();if(allow.has(n)&&!seen.has(n))q.push(n);}}
  return ids.every(id=>seen.has(id));
}
function pairKeys(pairs,b){return sort(pairs.map(p=>JSON.stringify([p.code,p.roadIds??p.ids])),b);}
function makeState(g,exact,rows,seed,recipe,limit,b){
  const byId=new Map(rows.map(r=>[r.ref.id,r])),ids=[],points=new Map();
  b.spend(rows.length+1);
  for(const n of seed.best.neighbors){
    b.spend(8);const old=g.nodesById.get(n.id);
    if(!old||!byId.has(n.id)||exact.has(n.id)||points.has(n.id)||!same(old,n.old)||!Number.isFinite(n.point.x)||!Number.isFinite(n.point.y)||same(old,n.point)||norm(old,n.point)>limit)throw Error('Residual seed coordinates or authority changed.');
    ids.push(n.id);points.set(n.id,{...n.point});
  }
  if(ids.length<2||ids.length>recipe.cap||(recipe.minimum&&ids.length!==recipe.minimum)||!connected(g,ids,exact,b))throw Error('Residual seed cluster invalid.');
  sort(ids,b);
  return {ids,allowed:new Set(ids),seed,points,parents:[],seen:new Set(),guards:new Map(),visits:0};
}
function coordKey(ids,points,b){b.spend(1+ids.length*3);return JSON.stringify(ids.map(id=>[id,points.get(id)]));}
export function* residualTrials(g,rows,exact,report,offset,b,tele,feedback,recipe,caseId){
  const eligible=new Set(rows.map(r=>r.ref.id)),limit=Math.hypot(offset.x,offset.y),cache=createOrientationCache(tele);
  const seeds=sort([...residualSeeds(caseId)],b,(a,c)=>a.best.score[1]-c.best.score[1]||riCompare(a.arm,c.arm));
  const states=seeds.map(seed=>makeState(g,exact,rows,seed,recipe,limit,b));
  tele.seedCount=states.length;tele.connectedGroups=states.length;
  for(const state of states){
    const p=state.points;
    state.seen.add(coordKey(state.ids,p,b));feedback.value=null;
    yield {ids:state.ids,analyticalPoints:p,strategy:'residual-seed-replay'};
    const checked=feedback.value;
    if(!checked||checked.valid)throw Error('Residual seed no longer rejected.');
    const actual=pairsFor(g,checked.conflictPairs??[],eligible,b);
    if(JSON.stringify(pairKeys(checked.conflictPairs??[],b))!==JSON.stringify(pairKeys(state.seed.best.pairs,b))||checked.issues.some(c=>!pairCode(c)))throw Error('Residual seed conflict replay changed.');
    const rank=potential(g,exact,p,state.allowed,actual,b,cache);
    state.parents.push({points:p,pairs:actual,rank,visits:0});
    tele.seedValidated++;tele.feedbackEvaluations++;
    tele.bestConflictCount=tele.bestConflictCount===null?actual.length:Math.min(tele.bestConflictCount,actual.length);
  }
  // A small beam per historical seed. Retain the original seed as an
  // exploration fallback; other parents must preserve all clear pairs.
  // Deterministic 512 proposal slots; evaluated candidates still <=256.
  for(let slot=0;slot<512&&states.length;slot++){
    b.spend();const state=states[slot%states.length],variant=state.visits++;
    const parents=sort([...state.parents],b,(a,c)=>a.pairs.length-c.pairs.length||a.rank-c.rank||a.visits-c.visits);
    const parent=variant%4===0?state.parents[0]:variant%4===1?parents[variant%parents.length]:parents[0];
    const turn=parent.visits++,points=new Map(parent.points),margin=[.05,.2,.75,2,4,8][Math.floor(turn/4)%6],step=[.5,1,1.5,2][Math.floor(turn/24)%4];
    const residual=parent.pairs.length?parent.pairs:[];
    if(!residual.length)continue;
    const target=variant%3===0?residual: [residual[turn%residual.length]];
    const passes=1+Math.floor(turn/96)%3;
    for(let pass=0;pass<passes;pass++){
      for(const pair of target){b.spend();projection(g,exact,points,state.allowed,pair,margin,turn%4,step,limit,b,cache);}
      // Learn introduced pairs from prior exact-oracle refusals. Protect
      // them only when the current approximate separation is violated.
      for(const guard of state.guards.values()){
        b.spend();const opts=alternatives(g,exact,points,state.allowed,guard,.05,b,cache);
        if(opts.length&&opts[0].cost>0){tele.guardProjections++;projection(g,exact,points,state.allowed,guard,.05,0,1,limit,b,cache);}
      }
    }
    // Additional deterministic line-search damping after projections.
    if(variant%5===4)for(const id of state.ids){b.spend(4);const a=parent.points.get(id),c=points.get(id);points.set(id,clamp(g.nodesById.get(id),{x:(a.x+c.x)/2,y:(a.y+c.y)/2},limit));}
    for(const id of state.ids){
      b.spend(3);const old=g.nodesById.get(id);if(same(old,points.get(id)))points.set(id,{...parent.points.get(id)});
    }
    const k=coordKey(state.ids,points,b);
    if(state.seen.has(k)){tele.duplicates++;continue;}state.seen.add(k);
    feedback.value=null;
    yield {ids:state.ids,analyticalPoints:points,strategy:'residual-repair'};
    const checked=feedback.value;if(!checked)continue;
    const actual=pairsFor(g,checked.conflictPairs??[],eligible,b);
    tele.feedbackEvaluations++;
    if(checked.valid){tele.bestConflictCount=0;continue;}
    const other=checked.issues.some(c=>!pairCode(c));
    if(!other&&actual.length)tele.bestConflictCount=Math.min(tele.bestConflictCount,actual.length);
    b.spend(1+actual.length+parent.pairs.length);
    const before=new Set(parent.pairs.map(key));
    const introduced=actual.filter(p=>!before.has(key(p)));
    if(!preservesPairs(parent.pairs,actual)||other||!actual.length){
      tele.preservationRejected++;
      for(const pair of introduced){b.spend();const k=key(pair);if(!state.guards.has(k)&&state.guards.size<16)state.guards.set(k,pair);}
      continue;
    }
    const rank=potential(g,exact,points,state.allowed,actual,b,cache);
    const next={points,pairs:actual,rank,visits:0};
    if(actual.length<parent.pairs.length||rank<parent.rank-1e-9){tele.preservedPromotions++;state.parents.push(next);
      const origin=state.parents[0],rest=sort(state.parents.slice(1),b,(a,c)=>a.pairs.length-c.pairs.length||a.rank-c.rank);
      state.parents=[origin,...rest.slice(0,3)];
    }
  }
}
