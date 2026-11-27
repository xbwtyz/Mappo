import { createHash } from 'node:crypto';
import { materializeLockedRtreCase } from './ares-rtre-locked-recipes.mjs';
import { inspectFreshRtreNeighborhood } from './ares-rtre-fresh-neighborhood.mjs';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { iterateRoadGraph,classifyRoad } from '../../../src/core/road-graph.js';
import { segmentCuts,insideOrOn,lerpPoint } from '../../../src/core/boundary.js';
import { createAresLandscapeSegmentObserver } from '../../../src/core/ares-landscape-observation.js';
import { createAresDefenseSegmentObserver } from '../../../src/core/ares-defense-observation.js';
import { createSpatialRef,spatialRefKey } from '../../../src/core/spatial-recovery-contract.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
import { riFreeze,riCompare } from '../../../src/core/road-impact-model.js';

// Independent OFFLINE audit of a frozen-recipe geometry witness. Never calls
// the search, trusts a candidate city, grants authority or returns Apply data.
// Explicit audit budget is separate from measured historical search; this
// is not an extension of search limits or a mounted verification gate.
class Refusal extends Error {}
const need=(ok,code)=>{if(!ok)throw new Refusal(code);};
const point=n=>({x:n.x,y:n.y});
const same=(a,b)=>a&&b&&Object.is(a.x,b.x)&&Object.is(a.y,b.y);
const validPoint=p=>p&&Object.keys(p).length===2&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
const ref=(collection,id)=>createSpatialRef({collection,id});
const key=spatialRefKey;
const chargeSort=(n,b)=>b.spend(Math.max(1,n*Math.ceil(Math.log2(n+1))));
function graph(city,b){
  b.spend(Math.max(1,city.nodes.length+city.roads.length));
  const iterator=iterateRoadGraph(city);let charged=0;
  try{
    for(;;){
      const s=iterator.next();
      if(s.done){if(s.value.work>charged)b.spend(s.value.work-charged);return s.value;}
      if(s.value.stage==='road-graph-intersections'){b.spend(64);charged+=64;}else b.spend();
    }
  }finally{iterator.return();}
}
function contained(a,c,boundary,budget){
  const cuts=[0,1];
  for(let i=0;i<boundary.length;i++){
    budget.spend();cuts.push(...segmentCuts(a,c,boundary[i],boundary[(i+1)%boundary.length]));
  }
  chargeSort(cuts.length,budget);cuts.sort((x,y)=>x-y);
  for(let i=0;i<cuts.length;i++){
    budget.spend(boundary.length);if(!insideOrOn(lerpPoint(a,c,cuts[i]),boundary))return false;
    if(i){budget.spend(boundary.length);if(!insideOrOn(lerpPoint(a,c,(cuts[i-1]+cuts[i])/2),boundary))return false;}
  }
  return true;
}
function order(g,id,budget){
  const n=g.nodesById.get(id),others=[...g.adjacency.get(id)];
  chargeSort(others.length,budget);
  const angle=k=>{const p=g.nodesById.get(k);return Math.atan2(p.y-n.y,p.x-n.x);};
  return others.sort((a,b)=>angle(a)-angle(b)||riCompare(a,b));
}
function cyclicEqual(a,b,budget){
  if(a.length!==b.length)return false;
  if(!a.length)return true;
  const start=b.indexOf(a[0]);budget.spend(Math.max(1,a.length*2));
  return start>=0&&a.every((id,i)=>id===b[(start+i)%b.length]);
}
export async function verifyFreshRtreWitness(caseId,options,evidence,budget){
  const result={version:1,caseId,status:'unverified',reason:null,changedRoadIds:[],finalChecked:0,sweptUnresolved:0};
  const finish=()=>riFreeze({...result,stats:budget.snapshot()});
  const equal=(a,b)=>aresReplayJson(a,budget)===aresReplayJson(b,budget);
  try{
    need(typeof caseId==='string','recipe-required');
    need(options&&Number.isSafeInteger(options.maxCandidates)&&options.maxCandidates>=1&&Number.isSafeInteger(options.maxNeighbors)&&options.maxNeighbors>=2,'invalid-limits');
    const {mode,maxObjects,maxHops,maxNeighbors,maxCandidates}=options;
    const report=await inspectFreshRtreNeighborhood(caseId,{mode,maxObjects,maxHops},budget);
    const {project,context}=materializeLockedRtreCase(caseId),city=project.city,before=aresReplayJson(project,budget);
    const bytes=Buffer.from(before,'utf8');budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
    need(createHash('sha256').update(bytes).digest('hex')===report.snapshotFingerprint,'source-mismatch');
    need(evidence&&evidence.caseId===caseId&&evidence.snapshotFingerprint===report.snapshotFingerprint&&equal(evidence.context,context)&&equal(evidence.limits,report.limits)&&evidence.maxNeighbors===maxNeighbors&&evidence.maxCandidates===maxCandidates,'evidence-mismatch');
    need(['research-eligible','no-eligible-neighbors','strict-no-adjustment'].includes(report.status),'scope-refused');
    const accepted=graph(city,budget);need(accepted.valid,'invalid-source-graph');
    const requested=new Map(),selectedRoads=new Set(context.operation.editedRefs.map(r=>r.id)),offset=context.operation.geometry.offset;
    for(const road of city.roads){
      budget.spend();if(!selectedRoads.has(road.id))continue;
      for(const id of [road.a,road.b]){
        const p=accepted.nodesById.get(id);
        requested.set(id,{x:offset.x===0?p.x:p.x+offset.x,y:offset.y===0?p.y:p.y+offset.y});
      }
    }
    need(requested.size===report.requested.length&&report.requested.every(r=>same(requested.get(r.ref.id),r.point)),'exact-intent-mismatch');
    const positions=new Map(requested),neighbors=new Set(),w=evidence.adjustedWitness;
    const eligible=new Set(report.eligibleJunctions.map(r=>r.ref.id)),admitted=new Map(report.entries.map(r=>[key(r.ref),r]));
    budget.spend(Math.max(1,eligible.size+admitted.size));
    let claimed;
    if(w){
      need(mode==='adaptive'&&report.status==='research-eligible'&&w.kind==='geometry-with-final-constraints'&&Array.isArray(w.neighbors)&&w.neighbors.length>=2&&w.neighbors.length<=maxNeighbors&&Array.isArray(w.updates)&&w.updates.length===requested.size+w.neighbors.length,'neighbor-authority');
      for(const n of w.neighbors){
        budget.spend();
        need(n&&eligible.has(n.id)&&!requested.has(n.id)&&!neighbors.has(n.id),'neighbor-authority');
        const old=accepted.nodesById.get(n.id);
        need(validPoint(n.old)&&validPoint(n.point)&&same(n.old,old)&&!same(n.point,old),'neighbor-coordinate');
        neighbors.add(n.id);positions.set(n.id,n.point);
      }
      const seen=new Set();
      for(const u of w.updates){
        budget.spend();need(u&&!seen.has(u.id)&&validPoint(u.point)&&same(positions.get(u.id),u.point),'coordinate-update');seen.add(u.id);
      }
      need(seen.size===positions.size,'coordinate-update');
      // Connected cluster through selected junctions only, never through
      // unadjustable unselected junctions.
      const reached=new Set(),queue=[[...neighbors][0]];
      for(let i=0;i<queue.length;i++){
        budget.spend();const id=queue[i];if(reached.has(id))continue;reached.add(id);
        for(const n of accepted.adjacency.get(id)){budget.spend();if(!reached.has(n)&&(neighbors.has(n)||requested.has(n)))queue.push(n);}
      }
      need([...neighbors].every(id=>reached.has(id)),'disconnected-neighbor-cluster');
      claimed=w.constraints;
    }else{
      need(evidence.baseline?.valid===true,'no-valid-witness');claimed=evidence.baseline.constraints;
    }
    const affected=new Set(),changed=[],terminal=new Set(accepted.terminalRoadIds);
    const candidate={...city,nodes:city.nodes.map(n=>{budget.spend();return positions.has(n.id)?{...n,...point(positions.get(n.id))}:n;})};
    // Independently scan every original road; do not use solver incident list.
    const next=new Map(candidate.nodes.map(n=>[n.id,n]));budget.spend(Math.max(1,next.size));
    for(const road of city.roads){
      budget.spend();
      const a=accepted.nodesById.get(road.a),b=accepted.nodesById.get(road.b),p=next.get(road.a),q=next.get(road.b);
      if(same(a,p)&&same(b,q))continue;
      need(!classifyRoad(road).protected&&!terminal.has(road.id),'protected-road');
      for(const k of [ref('roads',road.id),ref('nodes',road.a),ref('nodes',road.b)]){
        budget.spend();const row=admitted.get(key(k));need(row&&row.depth<=maxHops,'outside-scope');
        if(k.collection==='nodes'&&positions.has(k.id))need(row.role!=='protected-anchor'&&!(city.plaza?.vertices??[]).includes(k.id),'protected-anchor');
      }
      need(contained(p,q,city.survey.boundary,budget),'boundary-escape');
      affected.add(road.a);affected.add(road.b);
      changed.push({ref:ref('roads',road.id),endpointRefs:[ref('nodes',road.a),ref('nodes',road.b)],old:{a:point(a),b:point(b)},proposed:{a:point(p),b:point(q)}});
    }
    const rebuilt=graph(candidate,budget);
    if(rebuilt.issues.some(i=>i.code==='graph-work-limit')){result.reason='graph-work-limit';return finish();}
    need(rebuilt.valid&&equal(accepted.components,rebuilt.components),'invalid-final-graph');
    for(const id of affected){
      budget.spend();need(cyclicEqual(order(accepted,id,budget),order(rebuilt,id,budget),budget),'cyclic-road-order-changed');
    }
    chargeSort(changed.length,budget);changed.sort((a,b)=>riCompare(a.ref.id,b.ref.id));
    const ids=changed.map(r=>r.ref.id);
    need(claimed&&equal(claimed.changedRoadIds,ids)&&(!w||equal(w.changedRoadIds,ids)),'changed-road-evidence');
    // Independently reconstruct all final and swept provider queries. Shared
    // authoritative predicates are intentional; orchestration and enumeration
    // are separate from the candidate search.
    const landscape=createAresLandscapeSegmentObserver(city,budget),defense=createAresDefenseSegmentObserver(city,budget);
    const swept=[],blockers=[];let finalChecked=0;
    for(const segment of changed)for(const phase of ['final','swept']){
      budget.spend();
      const observations=[...landscape.observe(context,report.snapshotFingerprint,segment,phase,budget),defense.observe(context,report.snapshotFingerprint,segment,phase,budget).constraint];
      for(const e of observations){
        budget.spend();if(phase==='final')finalChecked++;
        if(e.summary!=='observed-satisfied')(phase==='final'?blockers:swept).push(e);
      }
    }
    need(finalChecked===3*ids.length&&blockers.length===0,'final-constraint-blocked');
    need(claimed.finalChecked===finalChecked&&equal(claimed.finalBlockers,blockers)&&equal(claimed.sweptUnresolved,swept),'constraint-evidence-mismatch');
    need(aresReplayJson(project,budget)===before,'source-mutated');
    // Only coordinates changed by construction; never accept external
    // records, identity allocations, roads, properties or a supplied city.
    result.status='geometry-verified';result.changedRoadIds=ids;result.finalChecked=finalChecked;result.sweptUnresolved=swept.length;
  }catch(e){
    if(e instanceof Refusal){result.status='rejected';result.reason=e.message;}
    else if(e instanceof LareBudgetExceeded){result.status='unverified';result.reason='work-limit';}
    else throw e;
  }
  return finish();
}
