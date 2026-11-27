import { createHash } from 'node:crypto';
import { materializeAresP3Case } from './ares-p3-fixtures.mjs';
import { inspectFreshRtreNeighborhood } from './ares-rtre-fresh-neighborhood.mjs';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { iterateRoadGraph } from '../../../src/core/road-graph.js';
import { appendSegmentCuts, insideOrOn, lerpPoint } from '../../../src/core/boundary.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
import { riFreeze, riCompare } from '../../../src/core/road-impact-model.js';

// C: bounded dry-land, single-unselected-junction geometry experiment.
// A graph witness is NOT a city witness, property repair, or Apply authority.
// Public entry owns fresh fixture generation; never accepts a city or B2 DTO.
function graphFor(city,budget){
  budget.spend(Math.max(1,city.nodes.length+city.roads.length));
  const it=iterateRoadGraph(city);let charged=0;
  try{
    for(;;){
      const s=it.next();
      if(s.done){
        if(s.value.work>charged)budget.spend(s.value.work-charged);
        return s.value;
      }
      if(s.value.stage==='road-graph-intersections'){budget.spend(64);charged+=64;}
      else budget.spend();
    }
  }finally{it.return();}
}
function readOptions(o){
  if(!o||Array.isArray(o)||![Object.prototype,null].includes(Object.getPrototypeOf(o))||
    Reflect.ownKeys(o).length!==4||
    !['mode','maxObjects','maxHops','maxCandidates'].every(k=>Object.hasOwn(o,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'))||
    !Number.isSafeInteger(o.maxCandidates)||o.maxCandidates<1)
    throw Error('Explicit bounded single-junction research options required.');
  return {mode:o.mode,maxObjects:o.maxObjects,maxHops:o.maxHops,maxCandidates:o.maxCandidates};
}
const finite=p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000;
function insideSegment(a,b,boundary,budget){
  budget.spend(boundary.length*2);
  if(!insideOrOn(a,boundary)||!insideOrOn(b,boundary))return false;
  const cuts=[0,1];
  for(let i=0;i<boundary.length;i++){
    budget.spend();appendSegmentCuts(cuts,a,b,boundary[i],boundary[(i+1)%boundary.length]);
  }
  budget.spend(Math.max(1,cuts.length*Math.ceil(Math.log2(cuts.length+1))));
  cuts.sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
    budget.spend(boundary.length);
    if(!insideOrOn(lerpPoint(a,b,(cuts[i-1]+cuts[i])/2),boundary))return false;
  }
  return true;
}
function rotation(graph,id,budget){
  const n=graph.nodesById.get(id),ids=[...graph.adjacency.get(id)];
  budget.spend(Math.max(1,ids.length*Math.ceil(Math.log2(ids.length+1))));
  ids.sort((a,b)=>{
    const p=graph.nodesById.get(a),q=graph.nodesById.get(b);
    return Math.atan2(p.y-n.y,p.x-n.x)-Math.atan2(q.y-n.y,q.x-n.x)||riCompare(a,b);
  });
  if(!ids.length)return [];
  let first=0;
  for(let i=1;i<ids.length;i++)if(riCompare(ids[i],ids[first])<0)first=i;
  return [...ids.slice(first),...ids.slice(0,first)];
}
function checkGeometry(source,accepted,positions,budget){
  for(const p of positions.values()){
    budget.spend();if(!finite(p))return {valid:false,issues:['coordinate-limit']};
  }
  const city={...source.city,nodes:source.city.nodes.map(n=>{
    budget.spend();const p=positions.get(n.id);
    return p?{...n,x:p.x,y:p.y}:n;
  })};
  const graph=graphFor(city,budget);
  if(!graph.valid)return {valid:false,issues:[...new Set(graph.issues.map(i=>i.code))].sort(riCompare),
    blockingRoadIds:[...new Set(graph.issues.flatMap(i=>i.roadIds??[]))].sort(riCompare),
    blockingNodeIds:[...new Set(graph.issues.flatMap(i=>i.nodeIds??[]))].sort(riCompare)};
  const boundary=source.city.survey.boundary,check=new Set();
  for(const id of positions.keys()){
    budget.spend();check.add(id);
    for(const other of accepted.adjacency.get(id)){budget.spend();check.add(other);}
    for(const roadId of accepted.incidentRoads.get(id)){
      budget.spend();const road=accepted.roadsById.get(roadId);
      if(!insideSegment(graph.nodesById.get(road.a),graph.nodesById.get(road.b),boundary,budget))
        return {valid:false,issues:['boundary-escape']};
    }
  }
  for(const id of [...check].sort(riCompare)){
    budget.spend();
    if(JSON.stringify(rotation(accepted,id,budget))!==JSON.stringify(rotation(graph,id,budget)))
      return {valid:false,issues:['cyclic-road-order-changed']};
  }
  return {valid:true,issues:[]};
}
function move(p,dx,dy){
  return {x:dx===0?p.x:p.x+dx,y:dy===0?p.y:p.y+dy};
}
export async function probeFreshRtreSingleJunction(caseId,optionsInput,budget){
  const {maxCandidates,...options}=readOptions(optionsInput);
  const report=await inspectFreshRtreNeighborhood(caseId,options,budget);
  const f=materializeAresP3Case(caseId),source=f.project,before=aresReplayJson(source,budget);
  const bytes=Buffer.from(before,'utf8');budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(createHash('sha256').update(bytes).digest('hex')!==report.snapshotFingerprint||
    aresReplayJson(f.context,budget)!==aresReplayJson(report.context,budget))
    throw Error('RTRE single-junction source identity mismatch.');
  const result={version:1,caseId,context:f.context,snapshotFingerprint:report.snapshotFingerprint,
    limits:report.limits,maxCandidates,eligibilityStatus:report.status,status:'preflight-refused',
    baseline:null,attempts:0,adjustedWitness:null,termination:'preflight'};
  const finish=()=>{
    if(aresReplayJson(source)!==before)throw Error('RTRE search source mutated.');
    return riFreeze({...result,stats:budget.snapshot()});
  };
  // Landscape/defense constraints will be supplied in E; do not claim a
  // graph-only bypass of any existing protected feature.
  if(['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces','walls','gates','towers']
    .some(k=>(source.city[k]??[]).length>0)){
    result.status='unsupported-landscape';return finish();
  }
  if(!['research-eligible','no-eligible-neighbors','strict-no-adjustment'].includes(report.status))return finish();
  try{
    const accepted=graphFor(source.city,budget);
    if(!accepted.valid)throw Error('Invalid fresh RTRE base graph.');
    const positions=new Map(report.requested.map(r=>[r.ref.id,r.point]));
    result.baseline=checkGeometry(source,accepted,positions,budget);
    if(report.status==='strict-no-adjustment'){
      result.status=result.baseline.valid?'baseline-valid':'search-refused';
      result.termination='strict';return finish();
    }
    const blockers=new Set(result.baseline.blockingNodeIds??[]);
    for(const id of result.baseline.blockingRoadIds??[]){
      budget.spend();const r=accepted.roadsById.get(id);blockers.add(r.a);blockers.add(r.b);
    }
    const rows=[...report.eligibleJunctions].sort((a,b)=>
      Number(blockers.has(b.ref.id))-Number(blockers.has(a.ref.id))||
      a.primaryIncidentCount-b.primaryIncidentCount||a.depth-b.depth||riCompare(a.ref.id,b.ref.id));
    const offset=f.context.operation.geometry.offset;
    // Fixed deterministic stencil, not a new production quality setting.
    // Include small same-direction shifts for a geometry demonstration even
    // if exact translation already works; baseline remains preferred.
    const stencil=[.125,.25,.5,1,-.125,-.25,-.5,-1];
    outer:for(const factor of stencil)for(const entry of rows){
      if(result.attempts>=maxCandidates){result.termination='candidate-limit';break outer;}
      budget.spend();
      const id=entry.ref.id,p=move(entry.old,offset.x*factor,offset.y*factor);
      if(p.x===entry.old.x&&p.y===entry.old.y)continue;
      budget.expand();result.attempts++;
      const proposed=new Map(positions);proposed.set(id,p);
      const checked=checkGeometry(source,accepted,proposed,budget);
      if(checked.valid){
        const updates=[...proposed.entries()].sort(([a],[b])=>riCompare(a,b)).map(([id,point])=>({id,point:{...point}}));
        // Fully charge candidate evidence before retaining it. No source
        // or candidate project exposed and no road record is modified.
        const witness={kind:'geometry-only',neighbor:{id,old:{...entry.old},point:{...p}},
          updates,changedRoadIds:[...new Set(updates.flatMap(u=>accepted.incidentRoads.get(u.id)))].sort(riCompare)};
        aresReplayJson(witness,budget);
        result.adjustedWitness=witness;result.termination='first-valid-adjustment';break outer;
      }
    }
    if(result.termination==='preflight')result.termination='stencil-exhausted';
    result.status=result.baseline.valid?'baseline-valid':result.adjustedWitness?'geometry-recovered':'search-refused';
  }catch(e){
    if(!(e instanceof LareBudgetExceeded))throw e;
    result.termination='work-limit';
    result.status=result.baseline?.valid?'baseline-valid':result.adjustedWitness?'geometry-recovered':'work-limit';
  }
  return finish();
}
