import {createHash} from 'node:crypto';
import {D2_LOCKS} from './ares-p5-topology-d2.mjs';
import {materializeLockedRtreCase,lockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {classifyRoad} from '../../../src/core/road-graph.js';
import {terminalRoadIds} from '../../../src/core/road-terminal-corridors.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
const locks=new Map(D2_LOCKS.map(l=>[l.id,l]));
// D6: conservative endpoint authority and axis-aligned interval proof.
// No new search, movement, geometry edits, or overlap identity retirement.
export async function inspectP5OverlapAuthority(caseId){
  const lock=locks.get(caseId);if(!lock)throw Error('Frozen D6 overlap case required.');
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
  const r={version:1,caseId,source:null,status:'unverified',authority:'none',topologyChanged:false,reason:null,pairs:[]};
  const finish=()=>riFreeze({...r,stats:b.snapshot()});
  try{
    const f=materializeLockedRtreCase(caseId),city=f.project.city,before=aresReplayJson(f.project,b),bytes=Buffer.from(before);
    b.spend(Math.max(1,Math.ceil(bytes.length/64)));r.source=createHash('sha256').update(bytes).digest('hex');
    if(r.source!==lock.source||r.source!==lockedRtreCase(caseId).source)throw Error('D6 source mismatch.');
    const report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:10000,maxHops:6},b);
    if(report.snapshotFingerprint!==r.source||aresReplayJson(report.context,b)!==aresReplayJson(f.context,b))throw Error('D6 scope mismatch.');
    const nodes=new Map(city.nodes.map(n=>[n.id,n])),roads=new Map(city.roads.map(e=>[e.id,e]));
    const requested=new Map(report.requested.map(n=>[n.ref.id,n.point]));
    const selected=new Set(f.context.operation.editedRefs.map(e=>e.id)),exact=new Map(),offset=f.context.operation.geometry.offset;
    const fixed=new Set(city.plaza?.vertices??[]),terminal=terminalRoadIds(city.roads);
    b.spend(Math.max(1,nodes.size+roads.size+terminal.size));
    for(const road of city.roads){
      b.spend();if(classifyRoad(road).protected||terminal.has(road.id)){fixed.add(road.a);fixed.add(road.b);}
      if(selected.has(road.id))for(const id of [road.a,road.b]){
        b.spend();const n=nodes.get(id);exact.set(id,{x:offset.x===0?n.x:n.x+offset.x,y:offset.y===0?n.y:n.y+offset.y});
      }
    }
    for(const g of city.gates??[]){b.spend();if(g.connection?.cityNodeId!=null)fixed.add(g.connection.cityNodeId);}
    for(const k of ['waterFaces','terrainFaces'])for(const row of city[k]??[])for(const id of row.vertices??[]){b.spend();fixed.add(id);}
    if(exact.size!==requested.size||[...exact].some(([id,p])=>!requested.has(id)||!Object.is(p.x,requested.get(id).x)||!Object.is(p.y,requested.get(id).y)))throw Error('D6 exact intent mismatch.');
    const at=id=>exact.get(id)??nodes.get(id),entries=new Map(report.entries.map(e=>[e.ref.collection+':'+e.ref.id,e]));
    const eligible=new Set(report.eligibleJunctions.map(e=>e.ref.id));
    b.spend(Math.max(1,entries.size+eligible.size+exact.size));
    const ready=['research-eligible','no-eligible-neighbors'].includes(report.status);
    const endpoint=id=>{
      b.spend();const scope=entries.get('nodes:'+id),reasons=[];
      if(exact.has(id))reasons.push('exact-requested-position');
      if(fixed.has(id)||scope?.role==='protected-anchor')reasons.push('protected-anchor');
      if(!scope||scope.depth>6)reasons.push('outside-scope');
      if(!ready)reasons.push('preflight-refused');
      if(!exact.has(id)&&!eligible.has(id))reasons.push('unqualified-junction');
      return {id,reasons,locallyEligibleForFurtherGeometryResearch:reasons.length===0};
    };
    for(const pair of lock.overlaps){
      b.spend(16);const [a,c]=pair.roadIds.map(id=>roads.get(id)),ids=[a.a,a.b,c.a,c.b],pts=ids.map(at);
      const vertical=pts.every(p=>p.x===pts[0].x),horizontal=pts.every(p=>p.y===pts[0].y);
      const axis=vertical?'y':horizontal?'x':null;
      let span=null;
      if(axis){
        const lo=Math.max(Math.min(pts[0][axis],pts[1][axis]),Math.min(pts[2][axis],pts[3][axis]));
        const hi=Math.min(Math.max(pts[0][axis],pts[1][axis]),Math.max(pts[2][axis],pts[3][axis]));
        if(hi>lo)span={axis,lo,hi,length:hi-lo};
      }
      const endpoints=[...new Set(ids)].sort(riCompare).map(endpoint),possible=endpoints.filter(e=>e.locallyEligibleForFurtherGeometryResearch).map(e=>e.id);
      r.pairs.push({roadIds:pair.roadIds,span,endpoints,possibleNeighborIds:possible,scopeReasons:pair.reasons,
        disposition:!span?'non-axis-exactness-unproven':possible.length?'geometry-research-opportunity':'fixed-under-observed-local-endpoint-scope'});
    }
    if(aresReplayJson(f.project,b)!==before)throw Error('D6 source mutated.');
    r.status='observed';aresReplayJson(r,b);
  }catch(e){if(e instanceof LareBudgetExceeded){r.status='work-limit';r.reason=e.resource;}else throw e;}
  return finish();
}
