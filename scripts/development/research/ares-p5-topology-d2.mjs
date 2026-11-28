import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {materializeLockedRtreCase,lockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {segmentCuts} from '../../../src/core/boundary.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';

// D2 read-only overlap analysis; no candidate, consolidation, road deletion,
// endpoint displacement, or new scope authority. A new research root is a
// diagnostic measurement only, never extra search budget.
export const D2_LOCKS=riFreeze(JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p5-d2-overlap-inventory.json',import.meta.url),'utf8')).rows);
const map=new Map(D2_LOCKS.map(x=>[x.id,x]));
const pairKey=ids=>JSON.stringify([...ids].sort(riCompare));
function interval(a,b,c,d,budget){
  budget.spend(16);
  const dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y,l2=dx*dx+dy*dy;
  if(l2<=1e-12||ex*ex+ey*ey<=1e-12)return null;
  const det=dx*ey-dy*ex,off1=dx*(c.y-a.y)-dy*(c.x-a.x),off2=dx*(d.y-a.y)-dy*(d.x-a.x);
  if(Math.abs(det)>1e-9||Math.abs(off1)>1e-7)return null;
  const u=((c.x-a.x)*dx+(c.y-a.y)*dy)/l2,v=((d.x-a.x)*dx+(d.y-a.y)*dy)/l2;
  const lo=Math.max(0,Math.min(u,v)),hi=Math.min(1,Math.max(u,v));
  if(hi-lo<=1e-9)return null;
  const cuts=segmentCuts(a,b,c,d);
  if(!cuts.length)return null;
  const length=Math.sqrt(l2)*(hi-lo),exact=det===0&&off1===0&&off2===0;
  const firstContained=lo===0&&hi===1,secondContained=Math.min(u,v)>=0&&Math.max(u,v)<=1;
  return {lo,hi,length,exact,offsets:[off1,off2],det,
    relation:firstContained&&secondContained?'duplicate-span':firstContained||secondContained?'contained-span':'partial-span'};
}
export function analyzeP5OverlapCase(caseId){
  const lock=map.get(caseId);
  if(!lock)throw Error('Frozen D2 overlap case required.');
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
  const r={version:1,caseId,source:null,status:'unverified',authority:'none',topologyChanged:false,reason:null,
    overlapPairs:0,endpointPairs:0,components:[],pairs:[],unmatched:[],unexpected:[]};
  const finish=()=>riFreeze({...r,stats:b.snapshot()});
  try{
    const recipe=lockedRtreCase(caseId),f=materializeLockedRtreCase(caseId),city=f.project.city;
    const before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');
    b.spend(Math.max(1,Math.ceil(bytes.length/64)));r.source=createHash('sha256').update(bytes).digest('hex');
    if(r.source!==lock.source||r.source!==recipe.source)throw Error('D2 source lock mismatch.');
    const roads=[...city.roads].sort((a,c)=>riCompare(a.id,c.id)),nodes=new Map(city.nodes.map(n=>[n.id,n])),selected=new Set(f.context.operation.editedRefs.map(e=>e.id)),requested=new Map(),offset=f.context.operation.geometry.offset;
    b.spend(Math.max(1,nodes.size+roads.length*Math.ceil(Math.log2(roads.length+1))));
    for(const road of roads){b.spend();if(selected.has(road.id))for(const id of [road.a,road.b]){
      b.spend();const n=nodes.get(id);requested.set(id,{x:offset.x===0?n.x:n.x+offset.x,y:offset.y===0?n.y:n.y+offset.y});
    }}
    const at=id=>requested.get(id)??nodes.get(id),changed=new Set(roads.filter(e=>requested.has(e.a)||requested.has(e.b)).map(e=>e.id));
    b.spend(Math.max(1,roads.length));
    const expected=new Map(lock.overlaps.map(x=>[pairKey(x.roadIds),x])),found=new Set(),byId=new Map(roads.map(x=>[x.id,x])),adj=new Map();
    const link=(a,c)=>{if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(c);};
    for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++){
      b.spend();const a=roads[i],c=roads[j];if(!changed.has(a.id)&&!changed.has(c.id))continue;
      const [p,q,x,y]=[at(a.a),at(a.b),at(c.a),at(c.b)];
      if(Math.max(p.x,q.x)+1e-6<Math.min(x.x,y.x)||Math.max(x.x,y.x)+1e-6<Math.min(p.x,q.x)||
        Math.max(p.y,q.y)+1e-6<Math.min(x.y,y.y)||Math.max(x.y,y.y)+1e-6<Math.min(p.y,q.y))continue;
      const span=interval(p,q,x,y,b);
      if(!span)continue;
      const ids=[a.id,c.id],key=pairKey(ids),old=expected.get(key);
      if(!old){r.unexpected.push(ids);continue;}
      found.add(key);link(a.id,c.id);link(c.id,a.id);
      r.pairs.push({roadIds:ids,span,roadKinds:[a.kind,c.kind],scopeReasons:old.reasons,
        geometryOnlySplitInsufficient:span.exact});
    }
    r.unmatched=lock.overlaps.filter(x=>!found.has(pairKey(x.roadIds))).map(x=>x.roadIds);
    r.overlapPairs=r.pairs.length;r.endpointPairs=lock.endpoints.length;
    // Connected components of overlapping parent identities, with linked
    // endpoint contacts. Counts of pairs are not independent repairs.
    const seen=new Set();
    for(const root of [...adj.keys()].sort(riCompare)){
      b.spend();if(seen.has(root))continue;
      const queue=[root],members=new Set();
      for(let i=0;i<queue.length;i++){b.spend();const id=queue[i];if(seen.has(id))continue;seen.add(id);members.add(id);
        for(const next of adj.get(id)){b.spend();if(!seen.has(next))queue.push(next);}}
      b.spend(Math.max(1,r.pairs.length+lock.endpoints.length));
      const pairs=r.pairs.filter(p=>members.has(p.roadIds[0])&&members.has(p.roadIds[1]));
      const linked=lock.endpoints.filter(ids=>ids.some(id=>members.has(id)));
      const ids=[...members].sort(riCompare);
      r.components.push({roadIds:ids,overlapPairs:pairs.length,exactPairs:pairs.filter(p=>p.span.exact).length,
        linkedEndpointPairs:linked.length,roadKinds:[...new Set(ids.map(id=>byId.get(id).kind))].sort(riCompare),
        heldByScope:pairs.some(p=>p.scopeReasons.some(x=>x!=='overlap-resolution-held'))});
    }
    if(aresReplayJson(f.project,b)!==before)throw Error('D2 source mutated.');
    r.status=r.unmatched.length||r.unexpected.length?'classification-discrepancy':'observed';
    aresReplayJson(r,b);
  }catch(e){if(e instanceof LareBudgetExceeded){r.status='work-limit';r.reason=e.resource;}else throw e;}
  return finish();
}
