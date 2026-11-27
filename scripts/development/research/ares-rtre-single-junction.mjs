import { createHash } from 'node:crypto';
import { materializeLockedRtreCase } from './ares-rtre-locked-recipes.mjs';
import { inspectFreshRtreNeighborhood } from './ares-rtre-fresh-neighborhood.mjs';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { iterateRoadGraph, classifyRoad } from '../../../src/core/road-graph.js';
import { createAresLandscapeSegmentObserver } from '../../../src/core/ares-landscape-observation.js';
import { createAresDefenseSegmentObserver } from '../../../src/core/ares-defense-observation.js';
import { createSpatialRef } from '../../../src/core/spatial-recovery-contract.js';
import { appendSegmentCuts, insideOrOn, lerpPoint } from '../../../src/core/boundary.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
import { riFreeze, riCompare } from '../../../src/core/road-impact-model.js';
import { analyticalTrials,X34_IDS } from './ares-p4x-analytical.mjs';
import { hybridTrials,X56_IDS } from './ares-p4x-hybrid.mjs';
import { x7Recipe,x7Options } from './ares-p4x-x7-scope.mjs';

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
function checkGeometry(source,accepted,positions,budget,reuseIncidentChecks=false,capturePairs=false){
  for(const p of positions.values()){
    budget.spend();if(!finite(p))return {valid:false,issues:['coordinate-limit']};
  }
  const city={...source.city,nodes:source.city.nodes.map(n=>{
    budget.spend();const p=positions.get(n.id);
    return p?{...n,x:p.x,y:p.y}:n;
  })};
  const graph=graphFor(city,budget);
  if(!graph.valid){
    const conflictPairs=[];
    if(capturePairs)for(const i of graph.issues){budget.spend();if(['unnormalized-crossing','overlapping-roads'].includes(i.code)){budget.spend(1+i.roadIds.length);conflictPairs.push({code:i.code,roadIds:[...i.roadIds]});}}
    return {valid:false,...(capturePairs?{conflictPairs}:{}),issues:[...new Set(graph.issues.map(i=>i.code))].sort(riCompare),
    blockingRoadIds:[...new Set(graph.issues.flatMap(i=>i.roadIds??[]))].sort(riCompare),
    blockingNodeIds:[...new Set(graph.issues.flatMap(i=>i.nodeIds??[]))].sort(riCompare)};
  }
  const boundary=source.city.survey.boundary,check=new Set(),checkedRoads=reuseIncidentChecks?new Set():null;
  for(const id of positions.keys()){
    budget.spend();check.add(id);
    for(const other of accepted.adjacency.get(id)){budget.spend();check.add(other);}
    for(const roadId of accepted.incidentRoads.get(id)){
      budget.spend();
      // A road with two moved endpoints has the same final geometry in both
      // incident lists. Reuse only within this immutable candidate evaluation.
      if(checkedRoads?.has(roadId))continue;
      checkedRoads?.add(roadId);
      const road=accepted.roadsById.get(roadId);
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
async function openFreshRtre(caseId,options,budget){
  const report=await inspectFreshRtreNeighborhood(caseId,options,budget);
  const f=materializeLockedRtreCase(caseId),source=f.project,before=aresReplayJson(source,budget);
  const bytes=Buffer.from(before,'utf8');budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(createHash('sha256').update(bytes).digest('hex')!==report.snapshotFingerprint||
    aresReplayJson(f.context,budget)!==aresReplayJson(report.context,budget))
    throw Error('RTRE single-junction source identity mismatch.');
  return {report,f,source,before};
}
export async function probeFreshRtreSingleJunction(caseId,optionsInput,budget){
  const {maxCandidates,...options}=readOptions(optionsInput);
  const {report,f,source,before}=await openFreshRtre(caseId,options,budget);
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

// D: deterministic connected clusters; research only, same geometry oracle.
function sortCharge(n,budget){budget.spend(Math.max(1,n*Math.ceil(Math.log2(n+1))));}
function* connectedClusters(graph,rows,selected,cap,budget){
  const eligible=new Set(rows.map(r=>r.ref.id)),rank=new Map(rows.map((r,i)=>[r.ref.id,i])),groups=new Set(),cache=new Map();
  function neighbors(id){
    if(cache.has(id))return cache.get(id);
    const found=new Set(),seen=new Set([id]),q=[id];
    for(let i=0;i<q.length;i++){
      budget.spend();
      for(const n of graph.adjacency.get(q[i])){
        budget.spend();if(seen.has(n))continue;seen.add(n);
        if(eligible.has(n))found.add(n);
        else if(selected.has(n))q.push(n);
      }
    }
    cache.set(id,found);return found;
  }
  for(const row of rows){
    budget.spend();
    const ids=[row.ref.id],included=new Set(ids),frontier=new Set(neighbors(row.ref.id));
    while(ids.length<cap&&frontier.size){
      sortCharge(frontier.size,budget);
      const n=[...frontier].sort((a,b)=>rank.get(a)-rank.get(b))[0];
      frontier.delete(n);included.add(n);ids.push(n);
      for(const other of neighbors(n)){budget.spend();if(!included.has(other))frontier.add(other);}
      sortCharge(ids.length,budget);
      const group=[...ids].sort(riCompare),k=JSON.stringify(group);
      if(!groups.has(k)){groups.add(k);yield group;}
    }
  }
}
// P4R R3A: compare the same cluster/stencil candidates with a bounded
// breadth window. Legacy order and accounting remain exact. The breadth
// arm charges materialization and traversal inside the shared root.
// R4C-A: two explicit combined streams. All stages use the very same
// search root, preflight, exact requested positions and candidate checks.
// Neither arm resets the candidate count, creates another budget, or
// uses a wider neighborhood.
function* combinedTrials(graph,rows,selected,maxNeighbors,budget,kind){
  const factors=[.0625,.125,.25,.5,1,-.125,-.25,-.5,-1];
  const directions=['parallel','perpendicular','diagonal-left','diagonal-right'];
  if(kind==='original-directional-fallback'){
    // A fixed, cap-independent prefix preserves early reference witnesses.
    // After 64 emitted slots (not necessarily 64 evaluated candidates),
    // try only nonparallel directions; repeat cluster enumeration is charged.
    let emitted=0;
    for(const trial of orderedTrials(graph,rows,selected,maxNeighbors,budget,false,false)){
      yield trial;
      if(++emitted===64)break;
    }
    for(const ids of connectedClusters(graph,rows,selected,maxNeighbors,budget))
      for(const factor of factors)for(const direction of directions.slice(1))
        for(const taper of [false,true]){
          budget.spend();yield {ids,factor,taper,direction};
        }
    return;
  }
  if(kind!=='breadth-directional')throw Error('Unknown combined RTRE research strategy.');
  // Interleave directions over an eight-cluster bounded window; identical
  // signed factors/taper and displacement magnitude as the individual arms.
  let window=[];
  function* visit(groups){
    for(const factor of factors)for(const direction of directions)
      for(const taper of [false,true])for(const ids of groups){
        budget.spend();yield {ids,factor,taper,direction};
      }
  }
  for(const ids of connectedClusters(graph,rows,selected,maxNeighbors,budget)){
    budget.spend(1+ids.length);window.push(ids);
    if(window.length===8){yield* visit(window);window=[];}
  }
  if(window.length)yield* visit(window);
}
function* orderedTrials(graph,rows,selected,maxNeighbors,budget,breadth,directional=false){
  const factors=[.0625,.125,.25,.5,1,-.125,-.25,-.5,-1];
  const clusters=connectedClusters(graph,rows,selected,maxNeighbors,budget);
  if(directional){
    // R3B: same connected clusters and factor magnitudes, but rotate the
    // neighbor motion. Selected coordinates always use the original offset.
    // Interleave directions for each magnitude; no new displacement ceiling.
    for(const ids of clusters)for(const factor of factors)
      for(const direction of ['parallel','perpendicular','diagonal-left','diagonal-right'])
        for(const taper of [false,true]){
          budget.spend();yield {ids,factor,taper,direction};
        }
    return;
  }
  if(!breadth){
    for(const ids of clusters)for(const factor of factors)for(const taper of [false,true])
      yield {ids,factor,taper};
    return;
  }
  // At most eight obstruction-ranked connected clusters buffered at once.
  // Rotate between them for each stencil rather than spend 18 attempts
  // on one cluster. No altered eligibility or candidate geometry.
  let window=[];
  function* visit(groups){
    for(const factor of factors)for(const taper of [false,true])for(const ids of groups){
      budget.spend();yield {ids,factor,taper};
    }
  }
  for(const ids of clusters){
    budget.spend(1+ids.length);window.push(ids);
    if(window.length===8){yield* visit(window);window=[];}
  }
  if(window.length)yield* visit(window);
}
// R4C-C: preserve 160 reference descriptor slots, then use metered,
 // feedback-guided breadth/nonparallel streams without resetting search.
function* adaptiveTrials(graph,rows,selected,maxNeighbors,budget,p){
  const seen=new Set();
  function admit(trial,strategy){
    budget.spend(2+trial.ids.length);
    p.enumerated[strategy]++;
    if(strategy==='directional'&&trial.direction==='parallel'){p.skippedParallel++;return null;}
    const key=JSON.stringify([trial.ids,trial.factor,trial.taper,trial.direction??'parallel']);
    if(seen.has(key)){p.duplicates[strategy]++;return null;}
    seen.add(key);p.scheduled[strategy]++;
    return {...trial,strategy};
  }
  const original=orderedTrials(graph,rows,selected,maxNeighbors,budget,false,false);
  for(let i=0;i<160;i++){
    budget.spend();const next=original.next();if(next.done)break;
    const t=admit(next.value,'original');if(t)yield t;
  }
  const streams={breadth:orderedTrials(graph,rows,selected,maxNeighbors,budget,true,false),
    directional:orderedTrials(graph,rows,selected,maxNeighbors,budget,false,true)};
  const exhausted=new Set();let last=null,streak=0;
  while(exhausted.size<2){
    budget.spend();
    // Crossing/overlap feedback favors changed displacement; other failures
    // favor wider cluster coverage. Repeated choices get at most two slots
    // while both streams remain available.
    let kind=p.lastFailure==='crossing'?'directional':'breadth';
    if(kind===last&&streak>=2)kind=kind==='breadth'?'directional':'breadth';
    if(exhausted.has(kind))kind=kind==='breadth'?'directional':'breadth';
    const next=streams[kind].next();
    if(next.done){exhausted.add(kind);continue;}
    const t=admit(next.value,kind);if(!t)continue;
    if(kind===last)streak++;else{if(last!==null)p.switches++;last=kind;streak=1;}
    yield t;
  }
}
function portfolioTelemetry(){
  const counts=()=>({original:0,breadth:0,directional:0});
  return {prefixSlots:160,enumerated:counts(),scheduled:counts(),attempted:counts(),duplicates:counts(),
    skippedParallel:0,switches:0,lastFailure:null,feedback:{crossing:0,other:0}};
}
// E2: detached candidate constraints, built once per exact fresh snapshot.
// Same metered provider data, recomputed geometry for every evaluated candidate.
// Observed-satisfied final rows do not imply continuous sweep, full face
// identity, parcel clearance or city validity. Never accept caller geometry.
function constraintChecker(source,accepted,report,budget){
  const city=source.city,landscape=createAresLandscapeSegmentObserver(city,budget),
    defense=createAresDefenseSegmentObserver(city,budget);
  const ref=(collection,id)=>createSpatialRef({collection,id});
  const equal=(a,b)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y);
  const point=p=>({x:p.x,y:p.y});
  const admitted=new Set(report.entries.map(e=>JSON.stringify(e.ref)));
  const allowed=new Set([...report.requested.map(r=>r.ref.id),...report.eligibleJunctions.map(r=>r.ref.id)]);
  const terminal=new Set(accepted.terminalRoadIds);
  budget.spend(Math.max(1,admitted.size+allowed.size+terminal.size));
  return positions=>{
    const ids=new Set();
    for(const id of positions.keys()){
      budget.spend();
      if(!allowed.has(id))throw Error('RTRE candidate outside fresh eligibility.');
      for(const rid of accepted.incidentRoads.get(id)){budget.spend();ids.add(rid);}
    }
    sortCharge(ids.size,budget);
    const result={changedRoadIds:[],finalChecked:0,finalBlockers:[],sweptUnresolved:[]};
    for(const id of [...ids].sort(riCompare)){
      budget.spend();
      const road=accepted.roadsById.get(id),a=point(accepted.nodesById.get(road.a)),b=point(accepted.nodesById.get(road.b)),
        p=positions.get(road.a)??a,q=positions.get(road.b)??b;
      if(equal(a,p)&&equal(b,q))continue;
      const roadRef=ref('roads',id),endpointRefs=[ref('nodes',road.a),ref('nodes',road.b)];
      if(classifyRoad(road).protected||terminal.has(id)||
         ![roadRef,...endpointRefs].every(r=>admitted.has(JSON.stringify(r))))
        throw Error('RTRE candidate changes protected or out-of-scope road.');
      const segment={ref:roadRef,endpointRefs,old:{a,b},proposed:{a:p,b:q}};
      result.changedRoadIds.push(id);
      for(const phase of ['final','swept']){
        budget.spend();
        const rows=[...landscape.observe(report.context,report.snapshotFingerprint,segment,phase,budget),
          defense.observe(report.context,report.snapshotFingerprint,segment,phase,budget).constraint];
        for(const e of rows){
          budget.spend();
          if(phase==='final')result.finalChecked++;
          if(e.summary==='observed-satisfied')continue;
          if(phase==='final')result.finalBlockers.push(e);
          else result.sweptUnresolved.push(e);
        }
      }
    }
    if(result.finalChecked!==3*result.changedRoadIds.length)throw Error('Incomplete RTRE final constraint evidence.');
    aresReplayJson(result,budget);
    return result;
  };
}
export async function probeFreshRtreCoordinated(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,false);
}
export async function probeFreshRtreConstrained(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true);
}
// F1A: keep E2 as matched reference; no candidate order or permission change.
export async function probeFreshRtreOptimized(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true);
}
// F1B: experimental bounded preference, not a production profile/default.
// Only already geometry/domain-checked adjusted candidates enter ranking.
// Distinct major roads touched by extra neighbor motion take precedence;
// then fewer moved neighbors, then less total displacement. Stable first
// occurrence breaks ties in the deterministic candidate stream.
function leastDisruptiveScore(w,accepted,budget){
  const major=new Set();
  for(const n of w.neighbors){
    budget.spend();
    for(const id of accepted.incidentRoads.get(n.id)){
      budget.spend();
      if(accepted.roadsById.get(id).kind==='primary')major.add(id);
    }
  }
  return [major.size,w.neighbors.length,w.displacement];
}
function betterScore(a,b){
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];
  return false;
}
export async function probeFreshRtreRanked(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true,true);
}
// G2: first valid candidate, with zero neighbor adjustment when baseline works.
// Existing F1A/F1B demonstration and ranking entrypoints remain unchanged.
export async function probeFreshRtreFirstValid(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true,false,true);
}
export async function probeFreshRtreBreadth(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true,false,true,true);
}
// R3B is a separate detached first-valid arm, not a production setting.
export async function probeFreshRtreDirectional(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true,false,true,false,true);
}
export async function probeFreshRtreBreadthDirectional(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true,false,true,false,false,'breadth-directional');
}
export async function probeFreshRtreDirectionalFallback(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true,false,true,false,false,'original-directional-fallback');
}
export async function probeFreshRtreAdaptivePortfolio(caseId,o,budget){
  return probeCoordinated(caseId,o,budget,true,true,false,true,false,false,'adaptive-portfolio');
}
// P4X fixed recipe-only arm. No externally supplied coordinates or cap.
export async function probeFreshRtreAnalytical(caseId,o,budget){
  if(typeof caseId!=='string'||!X34_IDS.includes(caseId.slice(2))||!caseId.startsWith('g:')||
    o?.mode!=='adaptive'||o.maxObjects!==10000||o.maxHops!==6||o.maxNeighbors!==4||o.maxCandidates!==256)
    throw Error('Unapproved P4X analytical arm.');
  return probeCoordinated(caseId,o,budget,true,true,true,true,false,false,'analytical-independent');
}
// X56 uses the exact X34 research limits and only the ten frozen refusals.
export async function probeFreshRtreHybrid(caseId,o,budget){
  if(typeof caseId!=='string'||!caseId.startsWith('g:')||!X56_IDS.includes(caseId.slice(2))||
    o?.mode!=='adaptive'||o.maxObjects!==10000||o.maxHops!==6||o.maxNeighbors!==4||o.maxCandidates!==256)
    throw Error('Unapproved P4X hybrid arm.');
  return probeCoordinated(caseId,o,budget,true,true,true,true,false,false,'hybrid-refinement');
}
// X7 authority is recipe-bound, never a caller-selected larger cap.
export async function probeFreshRtreX7(caseId,budget){
  const recipe=x7Recipe(caseId);
  return probeCoordinated(caseId,x7Options(caseId),budget,true,true,true,true,false,false,'x7-minimum-cluster',recipe);
}
async function probeCoordinated(caseId,o,budget,constrained,reuseIncidentChecks=false,ranked=false,preferBaseline=false,breadth=false,directional=false,combined=null,minimumRecipe=null){
  if(!o||Array.isArray(o)||![Object.prototype,null].includes(Object.getPrototypeOf(o))||
    Reflect.ownKeys(o).length!==5||
    !['mode','maxObjects','maxHops','maxCandidates','maxNeighbors'].every(k=>Object.hasOwn(o,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'))||
    !Number.isSafeInteger(o.maxNeighbors)||o.maxNeighbors<2)throw Error('Explicit bounded coordinated RTRE options required.');
  const {maxNeighbors,...single}=o,{maxCandidates,...options}=readOptions(single);
  const {report,f,source,before}=await openFreshRtre(caseId,options,budget);
  const result={version:1,caseId,context:f.context,snapshotFingerprint:report.snapshotFingerprint,
    limits:report.limits,maxCandidates,maxNeighbors,eligibilityStatus:report.status,status:'preflight-refused',
    baseline:null,attempts:0,adjustedWitness:null,termination:'preflight'};
  if(constrained){result.constraintMode='final-landscape-defense';result.constraintRejected=0;}
  if(combined==='adaptive-portfolio')result.portfolio=portfolioTelemetry();
  if(combined==='hybrid-refinement'||minimumRecipe)result.hybrid={baselinePairs:0,subsets:0,coveringGroups:0,connectedGroups:0,connectorGroups:0,enumerationLimit:false,groupLimit:false,seedProposals:0,feedbackProposals:0,duplicates:0,feedbackEvaluations:0,bestConflictCount:null,attempted:{'hybrid-refinement':0,'hybrid-directional-seed':0},failures:{}};
  if(minimumRecipe){result.hybrid.approvedMinimum=minimumRecipe.minimum;result.hybrid.seedValidated=false;}
  if(combined==='analytical-independent')result.analytical={pairs:0,subsets:0,covering:0,connectedGroups:0,groupLimit:false,failures:{}};
  if(ranked)result.ranking={profile:'research-major-roads-neighbors-displacement-v1',verifiedCount:0,firstScore:null,bestScore:null,bestAttempt:null};
  const finish=()=>{
    if(aresReplayJson(source)!==before)throw Error('RTRE coordinated source mutated.');
    return riFreeze({...result,stats:budget.snapshot()});
  };
  if(!constrained&&['waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces','walls','gates','towers']
    .some(k=>(source.city[k]??[]).length>0)){result.status='unsupported-landscape';return finish();}
  if(!['research-eligible','no-eligible-neighbors','strict-no-adjustment'].includes(report.status))return finish();
  try{
    const accepted=graphFor(source.city,budget);
    if(!accepted.valid)throw Error('Invalid fresh RTRE base graph.');
    const positions=new Map(report.requested.map(r=>[r.ref.id,r.point])),selected=new Set(positions.keys());
    const checkConstraints=constrained?constraintChecker(source,accepted,report,budget):null;
    function evaluate(proposed,baseline=false){
      const geometry=checkGeometry(source,accepted,proposed,budget,reuseIncidentChecks,!!result.hybrid);
      if(!constrained)return geometry;
      // For baseline keep actual blocker evidence even when graph invalid.
      // Nonplanar search candidates need not run expensive providers.
      if(!geometry.valid&&!baseline)return {...geometry,geometryValid:false,constraints:null};
      if(geometry.issues.includes('graph-work-limit'))return {...geometry,geometryValid:false,constraints:null};
      const constraints=checkConstraints(proposed),blocked=constraints.finalBlockers.length>0;
      return {...geometry,valid:geometry.valid&&!blocked,geometryValid:geometry.valid,constraints,
        issues:blocked?[...geometry.issues,'final-constraint-blocked']:geometry.issues,
        blockingRoadIds:[...new Set([...(geometry.blockingRoadIds??[]),
          ...constraints.finalBlockers.map(e=>e.query.refs[0].id)])].sort(riCompare)};
    }
    result.baseline=evaluate(positions,true);
    if(constrained&&result.baseline.issues.includes('graph-work-limit')){
      result.status='work-limit';result.termination='graph-work-limit';return finish();
    }
    // A final blocker on an exact-selected road cannot be changed by
    // unselected junction adaptation. Do not relax the requested intent.
    if(constrained&&result.baseline.constraints?.finalBlockers.some(e=>
      f.context.operation.editedRefs.some(r=>r.id===e.query.refs[0].id))){
      result.status='search-refused';result.termination='fixed-selected-constraint';return finish();
    }
    if(report.status==='strict-no-adjustment'){
      result.status=result.baseline.valid?'baseline-valid':'search-refused';result.termination='strict';return finish();
    }
    // Zero extra neighbor changes always win when exact intent is valid.
    if((ranked||preferBaseline)&&result.baseline.valid){
      result.status='baseline-valid';result.termination='baseline-preferred';return finish();
    }
    const blockers=new Set(result.baseline.blockingNodeIds??[]);
    for(const id of result.baseline.blockingRoadIds??[]){
      budget.spend();const r=accepted.roadsById.get(id);blockers.add(r.a);blockers.add(r.b);
    }
    sortCharge(report.eligibleJunctions.length,budget);
    const rows=[...report.eligibleJunctions].sort((a,b)=>Number(blockers.has(b.ref.id))-Number(blockers.has(a.ref.id))||
      a.primaryIncidentCount-b.primaryIncidentCount||a.depth-b.depth||riCompare(a.ref.id,b.ref.id));
    const byId=new Map(rows.map(r=>[r.ref.id,r])),offset=f.context.operation.geometry.offset;
    const feedback={value:null};
    if(minimumRecipe&&report.snapshotFingerprint!==minimumRecipe.source)throw Error('X7 frozen source changed.');
    const trials=result.hybrid?hybridTrials(accepted,rows,positions,report,offset,budget,result.hybrid,feedback,minimumRecipe):
      result.analytical?analyticalTrials(accepted,rows,positions,report,offset,budget,result.analytical):
      result.portfolio?adaptiveTrials(accepted,rows,selected,maxNeighbors,budget,result.portfolio):
      combined?combinedTrials(accepted,rows,selected,maxNeighbors,budget,combined):
      orderedTrials(accepted,rows,selected,maxNeighbors,budget,breadth,directional);
    outer:for(const {ids,factor,taper,direction,strategy,analyticalPoints} of trials){
        if(result.attempts>=maxCandidates){result.termination='candidate-limit';break outer;}
        const proposed=new Map(positions),neighbors=[];
        let dx=offset.x,dy=offset.y;
        if(direction!==undefined){
          budget.spend();
          if(direction==='perpendicular'){dx=-offset.y;dy=offset.x;}
          else if(direction==='diagonal-left'){dx=(offset.x-offset.y)*Math.SQRT1_2;dy=(offset.x+offset.y)*Math.SQRT1_2;}
          else if(direction==='diagonal-right'){dx=(offset.x+offset.y)*Math.SQRT1_2;dy=(offset.y-offset.x)*Math.SQRT1_2;}
        }
        for(const id of ids){
          budget.spend();const row=byId.get(id),weight=taper?factor/(1+row.depth):factor,
            point=analyticalPoints?analyticalPoints.get(id):move(row.old,dx*weight,dy*weight);
          if(point.x===row.old.x&&point.y===row.old.y)continue;
          proposed.set(id,point);neighbors.push({id,old:{...row.old},point:{...point}});
        }
        if(neighbors.length!==ids.length)continue;
        if(result.hybrid){
          budget.spend(1+neighbors.length);
          if(neighbors.length<2||neighbors.length>(minimumRecipe?minimumRecipe.minimum:4)||(minimumRecipe&&neighbors.length!==minimumRecipe.minimum)||new Set(ids).size!==ids.length||neighbors.some(n=>!byId.has(n.id)||selected.has(n.id)||!finite(n.point)||Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)>Math.hypot(offset.x,offset.y)))throw Error(minimumRecipe?'X7 candidate exceeded authority.':'X56 candidate exceeded authority.');
        }
        budget.expand();result.attempts++;
        if(result.portfolio)result.portfolio.attempted[strategy]++;
        if(minimumRecipe)result.hybrid.attempted[strategy]++;
        const checked=evaluate(proposed);
        if(result.hybrid){
          budget.spend(1+checked.issues.length);
          if(!minimumRecipe)result.hybrid.attempted[strategy]++;
          feedback.value=checked;
          for(const issue of checked.issues)result.hybrid.failures[issue]=(result.hybrid.failures[issue]??0)+1;
        }
        if(!checked.valid){
          if(result.analytical)for(const issue of checked.issues){budget.spend();result.analytical.failures[issue]=(result.analytical.failures[issue]??0)+1;}
          if(result.portfolio){
            budget.spend(1+checked.issues.length);
            const reason=checked.issues.some(i=>i.includes('crossing')||i.includes('overlap'))?'crossing':'other';
            result.portfolio.lastFailure=reason;result.portfolio.feedback[reason]++;
          }
          if(constrained&&checked.constraints?.finalBlockers.length)result.constraintRejected++;
          if(constrained&&checked.issues.includes('graph-work-limit')){result.termination='graph-work-limit';break outer;}
          continue;
        }
        sortCharge(proposed.size,budget);
        const updates=[...proposed.entries()].sort(([a],[b])=>riCompare(a,b)).map(([id,point])=>({id,point:{...point}})),
          roads=new Set();
        for(const u of updates)for(const rid of accepted.incidentRoads.get(u.id)){budget.spend();roads.add(rid);}
        sortCharge(roads.size,budget);let displacement=0;
        for(const n of neighbors){budget.spend();displacement+=Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y);}
        const w={kind:'geometry-only',neighbors,updates,changedRoadIds:[...roads].sort(riCompare),displacement,stencil:analyticalPoints?{strategy:result.hybrid?strategy:'analytical-independent'}:direction!==undefined?{factor,taper,direction}:{factor,taper}};
        if(constrained){
          w.kind='geometry-with-final-constraints';
          w.constraints=checked.constraints;
        }
        aresReplayJson(w,budget);
        if(!ranked){
          result.adjustedWitness=w;result.termination='first-valid-adjustment';break outer;
        }
        const score=leastDisruptiveScore(w,accepted,budget),ranking=result.ranking;
        // Charge rank evidence before atomically updating the incumbent.
        aresReplayJson(score,budget);budget.spend(3);
        ranking.verifiedCount++;
        if(ranking.firstScore===null)ranking.firstScore=score;
        if(ranking.bestScore===null||betterScore(score,ranking.bestScore)){
          ranking.bestScore=score;ranking.bestAttempt=result.attempts;result.adjustedWitness=w;
        }
        // Continue only inside the original candidate/work/expansion limits.
    }
    if(result.termination==='preflight')result.termination=result.hybrid?'hybrid-stream-exhausted':result.analytical?'analytical-stream-exhausted':'cluster-stencil-exhausted';
    result.status=result.baseline.valid?'baseline-valid':result.adjustedWitness?'geometry-recovered':'search-refused';
  }catch(e){
    if(!(e instanceof LareBudgetExceeded))throw e;
    result.termination='work-limit';result.status=result.baseline?.valid?'baseline-valid':result.adjustedWitness?'geometry-recovered':'work-limit';
  }
  return finish();
}
