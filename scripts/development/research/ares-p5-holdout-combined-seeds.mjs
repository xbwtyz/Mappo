import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {holdoutLockedRow,HOLDOUT_OPTIONS} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {combinedCoverTrial,pairsFor} from './ares-p4x-hybrid.mjs';
import {analyticalTrials} from './ares-p4x-analytical.mjs';
import {rotationCoverGroups,rotationTriplets,projectRotation} from './ares-p5-holdout-rotation.mjs';
import {measureConnectedMinimum,projectCyclic} from './ares-p5-holdout-cyclic.mjs';
import {classifyP5Contact,P5_LIMITS} from './ares-p5-topology-contract.mjs';
import {iterateRoadGraph,classifyRoad} from '../../../src/core/road-graph.js';
import {insideOrOn} from '../../../src/core/boundary.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';

const jobs=[140845325328,140845325360,140845325383,140845325430,140845325433,140845325443,140845325463,140845325468],archive=new Map();
for(const job of jobs){
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-cluster-46101659701-'+job+'.json',import.meta.url),'utf8'));
 if(e.run!==46101659701||e.attempt!==1||e.source!=='aa08b3ea15cadb6b096a92fdb488e8481192a2af'||e.job!==job)throw Error('Cluster archive identity mismatch.');
 for(const r of e.rows){
  const lock=holdoutLockedRow(r.caseId);
  if(archive.has(r.caseId)||r.category!=='diagnosed'||r.authority!=='none'||r.source!==lock.source||JSON.stringify(r.offset)!==JSON.stringify(lock.offset)||r.group!==lock.group)throw Error('Invalid cluster archive.');
  archive.set(r.caseId,riFreeze(r));
 }
}
if(archive.size!==29)throw Error('Incomplete cluster archive.');
export const COMBINED_CASES=Object.freeze([...archive.values()].filter(r=>r.arms.optimisticSplit.connected.status==='within-four').map(r=>r.caseId).sort(riCompare));
if(COMBINED_CASES.length!==11)throw Error('Combined cohort changed.');
const rotationArchive=new Map();
function readRotationArchive(){
 if(rotationArchive.size===11)return rotationArchive;
 for(const job of [140850938491,140850938494,140850938506,140850938510,140850938515,140850938539,140850938542,140850938712]){
  const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-rotation-46103464314-'+job+'.json',import.meta.url),'utf8'));
  if(e.run!==46103464314||e.attempt!==1||e.source!=='62b986bc3208027bd41b67d73a42042e5abbde9a'||e.job!==job)throw Error('Rotation archive identity changed.');
  for(const r of e.rows){const lock=holdoutLockedRow(r.caseId);if(rotationArchive.has(r.caseId)||!COMBINED_CASES.includes(r.caseId)||r.source!==lock.source||r.authority!=='none'||JSON.stringify(r.offset)!==JSON.stringify(lock.offset)||r.seeds.length)throw Error('Rotation archive mismatch.');rotationArchive.set(r.caseId,riFreeze(r));}
 }
 if(rotationArchive.size!==11)throw Error('Incomplete rotation archive.');
 return rotationArchive;
}
const root=()=>createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
const point=n=>({x:n.x,y:n.y});
const nodeFields=new Set(['id','x','y']);
const roadFields=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
const known=(row,fields,b)=>Object.keys(row).every(k=>{b.spend();return fields.has(k);});
function graph(city,b){
 b.spend(Math.max(1,city.nodes.length+city.roads.length));const it=iterateRoadGraph(city);let paid=0;
 try{for(;;){const s=it.next();if(s.done){if(s.value.work>paid)b.spend(s.value.work-paid);return s.value;}
 if(s.value.stage==='road-graph-intersections'){b.spend(64);paid+=64;}else b.spend();}}finally{it.return();}
}
function order(g,id,positions,b){
 const n=positions.get(id)??g.nodesById.get(id),rows=[...g.incidentRoads.get(id)];
 b.spend(Math.max(1,rows.length*Math.ceil(Math.log2(rows.length+1))));
 return rows.map(rid=>{b.spend();const r=g.roadsById.get(rid),other=r.a===id?r.b:r.a,p=positions.get(other)??g.nodesById.get(other);return {rid,angle:Math.atan2(p.y-n.y,p.x-n.x)};}).sort((a,c)=>a.angle-c.angle||riCompare(a.rid,c.rid)).map(x=>x.rid);
}
function cyclicEqual(a,c){if(a.length!==c.length)return false;if(!a.length)return true;const i=c.indexOf(a[0]);return i>=0&&a.every((v,j)=>v===c[(i+j)%c.length]);}
// No caller geometry, city, group, permissions, or budget. This pass
// produces only seeds for a later separate construction and audit, never
// a recovered city or an authority-bearing witness.
export async function searchHoldoutCombinedSeeds(caseId){return searchCombined(caseId,false);}
export async function searchHoldoutRotationSeeds(caseId){return searchCombined(caseId,true);}
export async function searchHoldoutCyclicSeeds(caseId){return searchCombined(caseId,true,true);}
async function searchCombined(caseId,rotationAware,cyclicAware=false){
 const lock=holdoutLockedRow(caseId);
 if(!COMBINED_CASES.includes(caseId))throw Error('Frozen combined holdout case required.');
 const r=archive.get(caseId),b=root(),base={caseId,source:lock.source,morphology:lock.options.morphology,offset:lock.offset,authority:'none',attempts:0,rotationRefused:0,scopeRefused:0,contactRefused:0,duplicates:0,geometryOnly:0,seeds:[],best:null};
 let f,before;
 const finish=(category,reason=null)=>riFreeze({...base,category,reason,stats:b.snapshot()});
 try{
  f=materializeLockedRtreCase(caseId);before=aresReplayJson(f.project,b);const bytes=Buffer.from(before,'utf8');b.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(createHash('sha256').update(bytes).digest('hex')!==lock.source)throw Error('Combined source mismatch.');
  const city=f.project.city,report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:10000,maxHops:6},b);
  if(report.snapshotFingerprint!==lock.source||report.status!=='research-eligible')throw Error('Combined scope changed.');
  const g=graph(city,b);if(!g.valid)throw Error('Invalid accepted graph.');
  const positions=new Map(report.requested.map(x=>[x.ref.id,x.point])),eligible=new Set(report.eligibleJunctions.map(x=>x.ref.id)),admitted=new Set(report.entries.map(x=>x.ref.collection+':'+x.ref.id));
  const fixed=new Set(city.plaza?.vertices??[]),terminal=new Set(g.terminalRoadIds);
  for(const road of city.roads){b.spend();if(classifyRoad(road).protected||terminal.has(road.id)){fixed.add(road.a);fixed.add(road.b);}}
  for(const gate of city.gates??[]){b.spend();if(gate.connection?.cityNodeId!=null)fixed.add(gate.connection.cityNodeId);}
  for(const k of ['waterFaces','terrainFaces'])for(const row of city[k]??[])for(const id of row.vertices??[]){b.spend();fixed.add(id);}
  for(const entry of report.entries){b.spend();if(entry.role==='protected-anchor'&&entry.ref.collection==='nodes')fixed.add(entry.ref.id);}
  const nodeOK=id=>admitted.has('nodes:'+id)&&!fixed.has(id)&&known(g.nodesById.get(id),nodeFields,b);
  const roadOK=road=>admitted.has('roads:'+road.id)&&!classifyRoad(road).protected&&!terminal.has(road.id)&&known(road,roadFields,b);
  const splitOK=road=>roadOK(road)&&[road.a,road.b].every(id=>nodeOK(id)&&(positions.has(id)||eligible.has(id)));
  const at=id=>positions.get(id)??g.nodesById.get(id);
  const baseline=pairsFor(g,report.geometryDiagnostics,eligible,b);
  const mandatory=baseline.filter(p=>{b.spend(16);const [a,c]=p.ids.map(id=>g.roadsById.get(id));return !(splitOK(a)&&splitOK(c)&&classifyP5Contact(at(a.a),at(a.b),at(c.a),at(c.b)).kind==='interior-interior');});
  base.baselinePairs=baseline.length;base.mandatoryPairs=mandatory.length;
  if(baseline.length!==r.contactPairs||mandatory.length!==r.arms.optimisticSplit.clauses)throw Error('Combined baseline classification changed.');
  const ids=r.arms.optimisticSplit.connected.witness;
  if(!ids.length||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!eligible.has(id)||positions.has(id)||!nodeOK(id))||mandatory.some(p=>!p.movable.some(id=>ids.includes(id))))throw Error('Frozen cover invalid.');
  function connected(group){const allowed=new Set([...positions.keys(),...group]),seen=new Set(),q=[group[0]];for(let i=0;i<q.length;i++){b.spend();const id=q[i];if(seen.has(id))continue;seen.add(id);for(const v of g.adjacency.get(id)){b.spend();if(allowed.has(v)&&!seen.has(v))q.push(v);}}return group.every(id=>seen.has(id));}
  if(!connected(ids))throw Error('Frozen cover disconnected.');
  base.group=ids;
  const oldOrders=new Map();for(const id of g.nodesById.keys()){b.spend();oldOrders.set(id,order(g,id,new Map(),b));}
  const seen=new Set();let prior=null,feedback=mandatory;
  const pairCode=c=>c==='unnormalized-crossing'||c==='overlapping-roads';
  function evaluate(group,points,arm){
   if(base.attempts>=P5_LIMITS.maxCandidates)return null;
   const key=JSON.stringify(group.map(id=>[id,points.get(id)]));b.spend(1+group.length);if(seen.has(key)){base.duplicates++;return null;}seen.add(key);
   b.expand();base.attempts++;
   const pos=new Map(positions),limit=Math.hypot(lock.offset.x,lock.offset.y),neighbors=[];
   if(group.length<1||group.length>4||!connected(group)){base.scopeRefused++;return null;}
   for(const id of group){b.spend(8);const old=g.nodesById.get(id),p=points.get(id);
    if(!eligible.has(id)||positions.has(id)||!nodeOK(id)||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000||Math.hypot(p.x-old.x,p.y-old.y)>limit||p.x===old.x&&p.y===old.y){base.scopeRefused++;return null;}
    b.spend(city.survey.boundary.length);if(!insideOrOn(p,city.survey.boundary)){base.scopeRefused++;return null;}
    pos.set(id,p);neighbors.push({id,old:point(old),point:point(p)});
   }
   const moved=new Set(),affected=new Set(pos.keys());
   for(const id of pos.keys()){b.spend();if(!nodeOK(id)){base.scopeRefused++;return null;}for(const rid of g.incidentRoads.get(id)){b.spend();const road=g.roadsById.get(rid);if(!roadOK(road)||![road.a,road.b].every(v=>admitted.has('nodes:'+v)&&known(g.nodesById.get(v),nodeFields,b))){base.scopeRefused++;return null;}moved.add(rid);affected.add(road.a);affected.add(road.b);}}
   const changed=[];for(const id of affected){b.spend();if(!cyclicEqual(oldOrders.get(id),order(g,id,pos,b)))changed.push(id);}
   if(changed.length){base.rotationRefused++;if(rotationAware&&(!base.bestRotation||changed.length<base.bestRotation.count))base.bestRotation={count:changed.length,ids:changed.sort(riCompare),neighbors,arm};return {score:100000+changed.length,points,feedback:mandatory,changed};}
   const candidate={...city,nodes:city.nodes.map(n=>{b.spend();return pos.has(n.id)?{...n,...pos.get(n.id)}:n;})};
   const checked=graph(candidate,b);
   if(checked.valid){base.geometryOnly++;return {score:0,points,feedback:[]};}
   const atNext=id=>pos.get(id)??g.nodesById.get(id),pairs=[],bad=[];
   for(const issue of checked.issues){b.spend();if(!pairCode(issue.code)||issue.roadIds?.length!==2){bad.push(issue);continue;}
    const roadIds=[...issue.roadIds].sort(riCompare),[a,c]=roadIds.map(id=>g.roadsById.get(id));
    const contact=classifyP5Contact(atNext(a.a),atNext(a.b),atNext(c.a),atNext(c.b));
    if(contact.kind!=='interior-interior'||!splitOK(a)||!splitOK(c)||!moved.has(a.id)&&!moved.has(c.id))bad.push(issue);
    pairs.push({code:issue.code,roadIds});
   }
   const score=bad.length*1000+pairs.length;
   if(!base.best||score<base.best.score)base.best={score,blocking:bad.length,contacts:pairs.length,arm,neighbors};
   if(!bad.length&&pairs.length){base.seeds.push({arm,attempt:base.attempts,neighbors,pairs});return {score,points,feedback:[]};}
   base.contactRefused++;
   return {score,points,feedback:pairsFor(g,bad.filter(i=>pairCode(i.code)&&i.roadIds?.length===2),eligible,b)};
  }
  // Interleave fixed-cover directional starts and joint orientation
  // refinement. The same root and 256 ceiling cover every evaluation.
  // Existing analytical independent-vector trials are attempted after the
  // fixed-cover stream, and never granted a larger neighborhood.
  if(rotationAware){
   base.strategy='rotation-aware';base.bestRotation=null;
   const exactChanged=[];for(const id of g.nodesById.keys()){b.spend();if(!cyclicEqual(oldOrders.get(id),order(g,id,positions,b)))exactChanged.push(id);}
   const closureOK=id=>nodeOK(id)&&[...g.incidentRoads.get(id)].every(rid=>{b.spend();const road=g.roadsById.get(rid);return roadOK(road)&&[road.a,road.b].every(v=>admitted.has('nodes:'+v)&&known(g.nodesById.get(v),nodeFields,b));});
   const writable=new Set([...eligible].filter(id=>{b.spend();return !positions.has(id)&&closureOK(id);}));
   base.earlyScope={eligible:eligible.size,writable:writable.size,selectedClosure:[...positions.keys()].filter(id=>!closureOK(id))};
   const rotationClauses=exactChanged.map(id=>{b.spend();const vars=[id,...g.adjacency.get(id)];return {id,eligible:[...new Set(vars.filter(v=>writable.has(v)))].sort(riCompare)};});
   base.baselineRotation=rotationClauses;
   const mandatoryClauses=mandatory.map(p=>p.movable.filter(id=>writable.has(id)));
   const adj=new Map();
   for(const id of [...writable].sort(riCompare)){const q=[id],seen=new Set(q),next=new Set();for(const n of q)for(const v of g.adjacency.get(n)){b.spend();if(positions.has(v)&&!seen.has(v)){seen.add(v);q.push(v);}else if(v!==id&&writable.has(v))next.add(v);}adj.set(id,[...next].sort(riCompare));}
   const cover=base.earlyScope.selectedClosure.length?{status:'selected-closure-held',groups:[],states:0}:rotationCoverGroups([...mandatoryClauses,...rotationClauses.map(c=>c.eligible)],adj,b);
   base.rotationCover={status:cover.status,groups:cover.groups,states:cover.states,limited:cover.limited??false,emptyMandatory:mandatoryClauses.filter(c=>!c.length).length,emptyRotation:rotationClauses.filter(c=>!c.eligible.length).length};
   if(cyclicAware){
    base.strategy='cyclic-aware';
    const historical=readRotationArchive().get(caseId);
    if(JSON.stringify(historical.baselineRotation)!==JSON.stringify(rotationClauses)||historical.rotationCover.status!==cover.status)throw Error('Rotation baseline changed.');
    if(!cover.groups.length&&!base.earlyScope.selectedClosure.length){
     base.minimum=measureConnectedMinimum([...mandatoryClauses,...rotationClauses.map(c=>c.eligible)],adj,b);
     // This witness is diagnostic only. It is never passed to an evaluator.
     if(base.minimum.status==='exact'&&base.minimum.minimum<=4)throw Error('Four-neighbor proof contradicted.');
    }else if(cover.groups.length){
     const retained=historical.bestRotation?.neighbors??[],retainedIds=retained.map(n=>n.id).sort(riCompare);
     const ordered=[...cover.groups];
     const match=ordered.findIndex(group=>JSON.stringify(group)===JSON.stringify(retainedIds));
     if(match>=0)ordered.unshift(...ordered.splice(match,1));
     const states=ordered.slice(0,16).map(group=>{
      const affected=new Set(exactChanged);for(const id of [...positions.keys(),...group]){b.spend();affected.add(id);for(const v of g.adjacency.get(id)){b.spend();affected.add(v);}}
      let prior=null;
      if(JSON.stringify(group)===JSON.stringify(retainedIds)){
       prior=new Map();for(const n of retained){b.spend(8);const old=g.nodesById.get(n.id);if(!old||old.x!==n.old.x||old.y!==n.old.y||!Number.isFinite(n.point.x)||!Number.isFinite(n.point.y)||Math.hypot(n.point.x-old.x,n.point.y-old.y)>Math.hypot(lock.offset.x,lock.offset.y))throw Error('Archived residual seed changed.');prior.set(n.id,n.point);}
      }
      return {group,affected:[...affected].sort(riCompare),prior,best:null,feedback:mandatory};
     });
     for(let round=0;round<48&&base.attempts<48&&base.seeds.length<2;round++)for(const state of states){
      if(base.attempts>=48||base.seeds.length>=2)break;
      const {group,affected}=state,usePrior=state.prior&&round%4!==3;
      // First refine archived angular near misses directly. Later alternate
      // contact projection and exact cyclic-slot correction.
      const points=usePrior&&(round%2===0)?new Map(state.prior):combinedCoverTrial(g,positions,group,state.feedback.length?state.feedback:mandatory,lock.offset,round,b,usePrior?state.prior:null);
      projectCyclic(g,positions,points,affected,oldOrders,lock.offset,round,b);
      const item=evaluate(group,points,usePrior?'cyclic-residual':'cyclic-directional');
      if(item&&(!state.best||item.score<state.best.score)){state.best=item;state.prior=item.points;state.feedback=item.feedback;}
     }
    }
    if(aresReplayJson(f.project,b)!==before)throw Error('Cyclic search mutated source.');
    aresReplayJson(base,b);
    return finish(base.seeds.length?'split-seeds-found':cover.groups.length?'no-split-seed':'structural-held');
   }
   const states=cover.groups.slice(0,16).map(group=>{
    const affected=new Set(exactChanged);for(const id of [...positions.keys(),...group]){b.spend();affected.add(id);for(const v of g.adjacency.get(id)){b.spend();affected.add(v);}}
    return {group,triplets:rotationTriplets(g,[...affected].sort(riCompare),new Set(group),b),prior:null,feedback:mandatory,best:null};
   });
   // Breadth before refinement. At most 48 actual evaluations, same root.
   // Alternate existing contact projection with angular correction.
   for(let round=0;round<16&&base.attempts<48&&base.seeds.length<2;round++)for(const state of states){
    if(base.attempts>=48||base.seeds.length>=2)break;
    const {group,triplets}=state,usePrior=round%3!==0&&state.prior;
    const points=combinedCoverTrial(g,positions,group,usePrior&&state.feedback.length?state.feedback:mandatory,lock.offset,round,b,usePrior?state.prior:null);
    projectRotation(g,positions,points,triplets,lock.offset,round,b);
    const item=evaluate(group,points,usePrior?'rotation-residual':'rotation-analytical');
    if(item&&(!state.best||item.score<state.best.score)){state.best=item;state.prior=item.points;state.feedback=item.feedback;}
   }
   if(aresReplayJson(f.project,b)!==before)throw Error('Rotation search mutated source.');
   aresReplayJson(base,b);
   return finish(base.seeds.length?'split-seeds-found':cover.groups.length?'no-split-seed':'structural-held');
  }
  let best=null;
  for(let v=0;v<24&&base.seeds.length<2;v++){
   const usePrior=v%3!==0&&prior;
   const points=combinedCoverTrial(g,positions,ids,usePrior&&feedback.length?feedback:mandatory,lock.offset,v,b,usePrior?prior:null);
   const item=evaluate(ids,points,usePrior?'hybrid-refinement':'hybrid-seed');
   if(item&&(!best||item.score<best.score)){best=item;prior=item.points;feedback=item.feedback;}
  }
  if(base.seeds.length<2){
   const keys=new Set(mandatory.map(p=>JSON.stringify(p.ids)));
   const filtered={...report,geometryDiagnostics:report.geometryDiagnostics.filter(d=>pairCode(d.code)&&keys.has(JSON.stringify(d.refs.filter(x=>x.collection==='roads').map(x=>x.id).sort(riCompare))))};
   const telemetry={subsets:0,covering:0,connectedGroups:0};
   for(const trial of analyticalTrials(g,report.eligibleJunctions,positions,filtered,lock.offset,b,telemetry)){
    if(base.attempts>=48||base.seeds.length>=2)break;
    evaluate(trial.ids,trial.analyticalPoints,trial.strategy);
   }
   base.analyticalTelemetry=telemetry;
  }
  if(aresReplayJson(f.project,b)!==before)throw Error('Combined seed search mutated source.');
  aresReplayJson(base,b);
  return finish(base.seeds.length?'split-seeds-found':'no-split-seed');
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit',e.resource);throw e;}
}
