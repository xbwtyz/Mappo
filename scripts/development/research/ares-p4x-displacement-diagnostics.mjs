import {createHash} from 'node:crypto';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {segmentCuts} from '../../../src/core/boundary.js';
import {riCompare} from '../../../src/core/road-impact-model.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const key=(code,ids)=>JSON.stringify([code,[...ids].sort(riCompare)]);
// Exact bilinear expansion around disk centers. Bound the linear terms
// with Cauchy-Schwarz and the cross terms by products of radii. Widen
// for floating-point roundoff; only strict opposite signs certify a
// proper crossing for ALL allowed coordinates. Inconclusive != feasible.
export function orientationDiskInterval(a,b,c){
  const center=orient(a,b,c),linear=a.r*Math.hypot(b.x-c.x,b.y-c.y)+b.r*Math.hypot(c.x-a.x,c.y-a.y)+c.r*Math.hypot(a.x-b.x,a.y-b.y),
    quadratic=a.r*b.r+a.r*c.r+b.r*c.r;
  const scale=Math.max(1,Math.abs(a.x),Math.abs(a.y),Math.abs(b.x),Math.abs(b.y),Math.abs(c.x),Math.abs(c.y),a.r,b.r,c.r);
  const error=linear+quadratic+1e-10*scale*scale;
  return {lo:center-error,hi:center+error};
}
const opposite=(a,b)=>(a.lo>0&&b.hi<0)||(b.lo>0&&a.hi<0);
export function diskPairBound(a,b,c,d){
  const intervals=[orientationDiskInterval(a,b,c),orientationDiskInterval(a,b,d),orientationDiskInterval(c,d,a),orientationDiskInterval(c,d,b)];
  return {intervals,inevitableProperCrossing:opposite(intervals[0],intervals[1])&&opposite(intervals[2],intervals[3])};
}
function actualPairs(roads,points,changed,b){
  const pairs=[],changedIds=new Set(changed.map(r=>r.id));
  for(const a of changed)for(const c of roads){
    b.spend();
    if(a.id===c.id||(changedIds.has(c.id)&&riCompare(a.id,c.id)>0))continue;
    const shared=[a.a,a.b].filter(id=>id===c.a||id===c.b);
    if(shared.length===2)continue;
    const p=points.get(a.a),q=points.get(a.b),r=points.get(c.a),s=points.get(c.b);
    if(Math.max(p.x,q.x)+1e-6<Math.min(r.x,s.x)||Math.max(r.x,s.x)+1e-6<Math.min(p.x,q.x)||Math.max(p.y,q.y)+1e-6<Math.min(r.y,s.y)||Math.max(r.y,s.y)+1e-6<Math.min(p.y,q.y))continue;
    b.spend(16);
    const cuts=[...segmentCuts(p,q,r,s),...segmentCuts(r,s,p,q)];
    if(cuts.length&&(!shared.length||cuts.some(t=>t>1e-9&&t<1-1e-9)))pairs.push(key(shared.length?'overlapping-roads':'unnormalized-crossing',[a.id,c.id]));
  }
  b.spend(Math.max(1,pairs.length*Math.ceil(Math.log2(pairs.length+1))));return pairs.sort(riCompare);
}
// Separate historical audit root, no candidate generation or search.
// Independently rebuild the exact requested movement and compare all
// actual rejected pair contacts against the captured oracle evidence.
export function analyzeRejected(caseId,recipe,search,observation,b){
  const result={status:'unverified',reason:null,bounds:[],replay:null};
  const finish=()=>({...result,stats:b.snapshot()});
  try{
    const f=materializeLockedRtreCase(caseId),city=f.project.city,before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');
    b.spend(Math.max(1,Math.ceil(bytes.length/64)));
    const source=createHash('sha256').update(bytes).digest('hex');
    need(source===recipe.source&&source===search.snapshotFingerprint&&source===observation.source,'Diagnostic source mismatch.');
    const offset=f.context.operation.geometry.offset,limit=Math.hypot(offset.x,offset.y),selectedRoads=new Set(f.context.operation.editedRefs.map(r=>r.id));
    const nodes=new Map(city.nodes.map(n=>[n.id,n])),roads=new Map(city.roads.map(r=>[r.id,r])),exact=new Map(),eligible=new Set(observation.model.variables.map(v=>v.id));
    b.spend(nodes.size+roads.size+eligible.size);
    for(const r of city.roads){b.spend();if(selectedRoads.has(r.id))for(const id of [r.a,r.b]){const n=nodes.get(id);exact.set(id,{x:offset.x===0?n.x:n.x+offset.x,y:offset.y===0?n.y:n.y+offset.y});}}
    need(exact.size===observation.model.fixedNodes.filter(n=>n.role==='exact-requested').length&&observation.model.fixedNodes.filter(n=>n.role==='exact-requested').every(n=>exact.has(n.id)&&exact.get(n.id).x===n.point.x&&exact.get(n.id).y===n.point.y),'Diagnostic exact intent mismatch.');
    need(observation.audit.intentMatches&&!observation.audit.missing.length&&!observation.audit.extra.length,'Unqualified diagnostic observation.');
    const d=search.diagnostics,best=d.best;
    if(!best){result.status='no-rejected-candidate';return finish();}
    const positions=new Map(exact),group=new Set();
    for(const n of best.neighbors){
      b.spend(4);const p=nodes.get(n.id);
      need(p&&eligible.has(n.id)&&!exact.has(n.id)&&!group.has(n.id)&&p.x===n.old.x&&p.y===n.old.y&&Number.isFinite(n.point.x)&&Number.isFinite(n.point.y)&&Math.hypot(n.point.x-p.x,n.point.y-p.y)<=limit,'Invalid rejected coordinates.');
      group.add(n.id);positions.set(n.id,n.point);
    }
    need(group.size>=2&&group.size<=recipe.cap&&(!recipe.minimum||group.size===recipe.minimum),'Invalid rejected cluster size.');
    const adjacency=new Map([...nodes.keys()].map(id=>[id,[]]));
    for(const r of city.roads){b.spend();adjacency.get(r.a).push(r.b);adjacency.get(r.b).push(r.a);}
    const reached=new Set(),q=[[...group][0]];
    for(let i=0;i<q.length;i++){b.spend();const id=q[i];if(reached.has(id))continue;reached.add(id);for(const n of adjacency.get(id)){b.spend();if(!reached.has(n)&&(group.has(n)||exact.has(n)))q.push(n);}}
    need([...group].every(id=>reached.has(id)),'Disconnected rejected cluster.');
    const points=new Map(city.nodes.map(n=>[n.id,positions.get(n.id)??n])),changed=city.roads.filter(r=>positions.has(r.a)||positions.has(r.b));
    b.spend(city.nodes.length+city.roads.length);
    const actual=actualPairs(city.roads,points,changed,b),expected=best.pairs.map(p=>key(p.code,p.roadIds)).sort(riCompare);
    b.spend(Math.max(1,expected.length*Math.ceil(Math.log2(expected.length+1))));
    result.replay={attempt:best.attempt,actual,expected,matches:JSON.stringify(actual)===JSON.stringify(expected)};
    need(result.replay.matches,'Rejected pair replay mismatch.');
    const targets=new Map();
    for(const p of [...best.pairs,...d.recurrence.slice(0,8)]){b.spend();targets.set(key(p.code,p.roadIds),p);}
    function disk(id,allowed){const p=exact.get(id)??nodes.get(id);return {x:p.x,y:p.y,r:allowed.has(id)&&!exact.has(id)?limit:0};}
    for(const p of targets.values()){
      b.spend(32);const [a,c]=p.roadIds.map(id=>roads.get(id));
      need(a&&c,'Unknown recurring road.');
      const ids=[a.a,a.b,c.a,c.b],shared=new Set(ids).size!==4;
      const global=shared?null:diskPairBound(...ids.map(id=>disk(id,eligible))),local=shared?null:diskPairBound(...ids.map(id=>disk(id,group)));
      result.bounds.push({code:p.code,roadIds:p.roadIds,eligibleEndpoints:[...new Set(ids.filter(id=>eligible.has(id)))].sort(riCompare),groupEndpoints:[...new Set(ids.filter(id=>group.has(id)))].sort(riCompare),sharedEndpoint:shared,allEligibleRelaxation:global,bestGroup:local,interpretation:shared?'shared-endpoint-not-certified':global.inevitableProperCrossing?'unavoidable-even-with-all-eligible-disks':local.inevitableProperCrossing?'unavoidable-for-this-group':'inconclusive'});
    }
    need(aresReplayJson(f.project,b)===before,'Diagnostic source mutated.');
    aresReplayJson(result,b);
    result.status='diagnostic-verified';
  }catch(e){if(e instanceof LareBudgetExceeded){result.reason='audit-work-limit';}else throw e;}
  return finish();
}
