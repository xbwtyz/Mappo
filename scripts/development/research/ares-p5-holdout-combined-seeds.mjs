import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {holdoutLockedRow,HOLDOUT_OPTIONS} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {combinedCoverTrial,reformCoverTrial,pairsFor} from './ares-p4x-hybrid.mjs';
import {analyticalTrials} from './ares-p4x-analytical.mjs';
import {rotationCoverGroups,reformRotationCoverGroups,rotationTriplets,projectRotation} from './ares-p5-holdout-rotation.mjs';
import {measureConnectedMinimum,projectCyclic} from './ares-p5-holdout-cyclic.mjs';
import {angularLineProposals,localAngularLines} from './ares-p5-holdout-local-angular.mjs';
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
const cyclicArchive=new Map();
function readCyclicArchive(){
 if(cyclicArchive.size===11)return cyclicArchive;
 for(const job of [140852546473,140852546475,140852546493,140852546497,140852546500,140852546538,140852546541,140852546547]){
  const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-cyclic-46103970615-'+job+'.json',import.meta.url),'utf8'));
  if(e.run!==46103970615||e.attempt!==1||e.source!=='9196399817f64c065f5a2957ed573a12b13d023c'||e.job!==job)throw Error('Cyclic archive identity changed.');
  for(const r of e.rows){const lock=holdoutLockedRow(r.caseId);if(cyclicArchive.has(r.caseId)||!COMBINED_CASES.includes(r.caseId)||r.source!==lock.source||r.authority!=='none'||JSON.stringify(r.offset)!==JSON.stringify(lock.offset)||r.seeds.length)throw Error('Cyclic archive mismatch.');cyclicArchive.set(r.caseId,riFreeze(r));}
 }
 if(cyclicArchive.size!==11)throw Error('Incomplete cyclic archive.');
 return cyclicArchive;
}
export const LOCAL_ANGULAR_CASES=Object.freeze(["h:linear-10","h:linear-25","h:organic-10","h:planned-10","h:radial-24"]);
const localArchive=new Map();
function readLocalArchive(){
 if(localArchive.size===5)return localArchive;
 for(const job of [140853267618,140853267634,140853267650,140853267660,140853267663,140853267667,140853267680,140853267686]){
  const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-local-angular-46104206507-'+job+'.json',import.meta.url),'utf8'));
  if(e.run!==46104206507||e.attempt!==1||e.source!=='b1e9ab1501e07741573f0db79833db98e0f33cc6'||e.job!==job)throw Error('Local angular archive identity changed.');
  for(const r of e.rows){const lock=holdoutLockedRow(r.caseId);if(localArchive.has(r.caseId)||!LOCAL_ANGULAR_CASES.includes(r.caseId)||r.source!==lock.source||r.authority!=='none'||JSON.stringify(r.offset)!==JSON.stringify(lock.offset)||r.seeds.length||r.geometrySeeds.length)throw Error('Local angular archive mismatch.');localArchive.set(r.caseId,riFreeze(r));}
 }
 if(localArchive.size!==5)throw Error('Incomplete local angular archive.');
 return localArchive;
}
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
export async function searchHoldoutLocalAngular(caseId){return searchCombined(caseId,true,true,true);}
export async function searchHoldoutCoupledAngular(caseId){return searchCombined(caseId,true,true,true,true);}
// The six matched arms are immutable; no caller-supplied numeric bounds.
export const REFORM_ARMS=riFreeze([
 {id:'c4-d100',cap:4,multiplier:1},{id:'c8-d100',cap:8,multiplier:1},
 {id:'c4-d125',cap:4,multiplier:1.25},{id:'c4-d150',cap:4,multiplier:1.5},
 {id:'c8-d125',cap:8,multiplier:1.25},{id:'c8-d150',cap:8,multiplier:1.5}
]);
export async function searchHoldoutNumericalReform(caseId,arm){
 const profile=REFORM_ARMS.find(x=>x.id===arm);
 if(!profile)throw Error('Frozen reform arm required.');
 return searchCombined(caseId,true,true,false,false,profile);
}
export const REFORM_REPAIR_CASES=Object.freeze(COMBINED_CASES.filter(id=>!['h:linear-09','h:radial-24'].includes(id)));
export async function searchHoldoutReformRepair(caseId){
 if(!REFORM_REPAIR_CASES.includes(caseId))throw Error('Frozen reform repair case required.');
 return searchCombined(caseId,true,true,false,false,REFORM_ARMS.find(x=>x.id==='c8-d100'),true);
}
const reformRepairArchive=new Map();
function readReformRepairArchive(){
 if(reformRepairArchive.size===11)return reformRepairArchive;
 for(const job of [140855972403,140855972435,140855972451,140855972454,140855972462,140855972463,140855972464,140855972471,140855972477,140855972480,140855972483,140855972484,140855972487,140855972495,140855972505,140855972511]){
  const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-reform-46105076686-'+job+'.json',import.meta.url),'utf8'));
  if(e.run!==46105076686||e.attempt!==1||e.source!=='26de6242316fa78a545375ed15c83f384bf8909c'||e.job!==job)throw Error('Reform repair archive identity mismatch.');
  for(const r of e.rows.filter(x=>x.profile.id==='c8-d100')){
   const lock=holdoutLockedRow(r.caseId);
   if(reformRepairArchive.has(r.caseId)||!COMBINED_CASES.includes(r.caseId)||r.authority!=='none'||r.source!==lock.source||JSON.stringify(r.offset)!==JSON.stringify(lock.offset)||r.profile.cap!==8||r.profile.multiplier!==1)throw Error('Reform repair row mismatch.');
   reformRepairArchive.set(r.caseId,riFreeze(r));
  }
 }
 if(reformRepairArchive.size!==11)throw Error('Incomplete reform repair archive.');
 return reformRepairArchive;
}
// Frozen one-blocker radial pilot, no new movement permission.
export async function searchHoldoutPrecisionContact(caseId){
 if(caseId!=='h:radial-16')throw Error('Frozen precision contact case required.');
 return searchCombined(caseId,true,true,false,false,REFORM_ARMS.find(x=>x.id==='c8-d100'),false,true);
}
async function searchCombined(caseId,rotationAware,cyclicAware=false,localAware=false,coupledAware=false,reform=null,repair=false,precision=false){
 const lock=holdoutLockedRow(caseId);
 if(!COMBINED_CASES.includes(caseId))throw Error('Frozen combined holdout case required.');
 if(localAware&&!LOCAL_ANGULAR_CASES.includes(caseId))throw Error('Frozen local angular case required.');
 const cap=reform?.cap??4,proposalOffset=reform?{x:lock.offset.x*reform.multiplier,y:lock.offset.y*reform.multiplier}:lock.offset;
 const displacementLimit=Math.hypot(lock.offset.x,lock.offset.y)*(reform?.multiplier??1);
 const r=archive.get(caseId),b=root(),base={caseId,source:lock.source,morphology:lock.options.morphology,offset:lock.offset,authority:'none',attempts:0,rotationRefused:0,scopeRefused:0,contactRefused:0,duplicates:0,geometryOnly:0,seeds:[],best:null};
 if(reform){base.strategy='numerical-reform';base.profile=reform;base.geometrySeeds=[];base.bestEvaluatedDistortion=null;}
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
   const pos=new Map(positions),limit=displacementLimit,neighbors=[];
   if(group.length<1||group.length>cap||!connected(group)){base.scopeRefused++;return null;}
   for(const id of group){b.spend(8);const old=g.nodesById.get(id),p=points.get(id);
    if(!eligible.has(id)||positions.has(id)||!nodeOK(id)||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000||Math.hypot(p.x-old.x,p.y-old.y)>limit||p.x===old.x&&p.y===old.y){base.scopeRefused++;return null;}
    b.spend(city.survey.boundary.length);if(!insideOrOn(p,city.survey.boundary)){base.scopeRefused++;return null;}
    pos.set(id,p);neighbors.push({id,old:point(old),point:point(p)});
   }
   const moved=new Set(),affected=new Set(pos.keys());
   for(const id of pos.keys()){b.spend();if(!nodeOK(id)){base.scopeRefused++;return null;}for(const rid of g.incidentRoads.get(id)){b.spend();const road=g.roadsById.get(rid);if(!roadOK(road)||![road.a,road.b].every(v=>admitted.has('nodes:'+v)&&known(g.nodesById.get(v),nodeFields,b))){base.scopeRefused++;return null;}moved.add(rid);affected.add(road.a);affected.add(road.b);}}
   const changed=[];for(const id of affected){b.spend();if(!cyclicEqual(oldOrders.get(id),order(g,id,pos,b)))changed.push(id);}
   if(reform){
    const distances=neighbors.map(n=>{b.spend(4);return Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y);});
    const row={count:changed.length,neighbors:neighbors.length,max:Math.max(...distances),total:distances.reduce((a,c)=>a+c,0),affected:affected.size,roads:moved.size,
      rotation:changed.map(id=>({id,degree:g.incidentRoads.get(id).size??g.incidentRoads.get(id).length,role:positions.has(id)?'selected':group.includes(id)?'adjusted':'stationary'}))};
    if(!base.bestEvaluatedDistortion||row.count<base.bestEvaluatedDistortion.count||row.count===base.bestEvaluatedDistortion.count&&row.total<base.bestEvaluatedDistortion.total)base.bestEvaluatedDistortion=row;
   }
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
   const clauses=[...mandatoryClauses,...rotationClauses.map(c=>c.eligible)];
   const cover=base.earlyScope.selectedClosure.length?{status:'selected-closure-held',groups:[],states:0}:reform?reformRotationCoverGroups(clauses,adj,b,cap):rotationCoverGroups(clauses,adj,b);
   base.rotationCover={status:cover.status,groups:cover.groups,states:cover.states,limited:cover.limited??false,emptyMandatory:mandatoryClauses.filter(c=>!c.length).length,emptyRotation:rotationClauses.filter(c=>!c.eligible.length).length};
   if(reform){
    base.strategy=repair?'reform-coupled-contact':'numerical-reform';
    const historical=readCyclicArchive().get(caseId);
    if(JSON.stringify(historical.baselineRotation)!==JSON.stringify(rotationClauses))throw Error('Reform baseline changed.');
    // Minimum is diagnostic, not proof of geometric feasibility.
    // The minimum witness is tried first where known and within the arm cap.
    base.minimum=base.earlyScope.selectedClosure.length?null:measureConnectedMinimum(clauses,adj,b);
    const groups=[...cover.groups];
    const witness=base.minimum?.witness;
    if(witness?.length&&witness.length<=cap&&!groups.some(g=>JSON.stringify(g)===JSON.stringify(witness)))groups.unshift(witness);
    groups.sort((a,c)=>a.length-c.length||riCompare(JSON.stringify(a),JSON.stringify(c)));
    const retained=historical.bestRotation?.neighbors??[];
    const residual=LOCAL_ANGULAR_CASES.includes(caseId)?readLocalArchive().get(caseId).bestRotation?.neighbors??[]:[];
    if(precision){
     base.strategy='precision-contact';base.localProbes=0;base.precision={localClear:0,rotationClear:0,scopeLocal:0,variables:[],blockingPair:['RD-0099','RD-0221'],protectedAnchor:'N-0089'};
     const locked=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-reform-repair-46105648256-140857711740.json',import.meta.url),'utf8'));
     if(locked.run!==46105648256||locked.attempt!==1||locked.source!=='908acc432ab4e1a3ccc9356829c89ad74f1e52d4'||locked.job!==140857711740)throw Error('Precision archive identity mismatch.');
     const archived=locked.rows.find(x=>x.caseId===caseId),seed=archived?.best;
     if(!seed||archived.source!==lock.source||archived.authority!=='none'||seed.blocking!==1||seed.contacts!==19||seed.neighbors.length!==8)throw Error('Precision witness mismatch.');
     const group=seed.neighbors.map(n=>n.id).sort(riCompare),points=new Map();
     for(const n of seed.neighbors){b.spend(8);const old=g.nodesById.get(n.id);if(!old||old.x!==n.old.x||old.y!==n.old.y||!eligible.has(n.id)||positions.has(n.id)||!nodeOK(n.id)||Math.hypot(n.point.x-old.x,n.point.y-old.y)>displacementLimit)throw Error('Precision coordinates changed.');points.set(n.id,n.point);}
     const oldItem=evaluate(group,points,'precision-control');
     if(!oldItem||oldItem.score!==1019||oldItem.feedback.length!==1||JSON.stringify(oldItem.feedback[0].ids)!==JSON.stringify(base.precision.blockingPair))throw Error('Precision blocker changed.');
     const [ra,rb]=base.precision.blockingPair.map(id=>g.roadsById.get(id)),ends=[ra.a,ra.b,rb.a,rb.b];
     if(!ends.includes('N-0089')||!fixed.has('N-0089')||positions.has('N-0089')||points.has('N-0089'))throw Error('Protected anchor mismatch.');
     const vars=group.filter(id=>ends.includes(id));base.precision.variables=vars;
     const affected=new Set([...positions.keys(),...group]);
     for(const id of [...affected])for(const v of g.adjacency.get(id)){b.spend();affected.add(v);}
     const rank=(a,c)=>a.cross-c.cross||a.rotation-c.rotation||a.cost-c.cost;
     const now=(state,id)=>state.get(id)??positions.get(id)??g.nodesById.get(id);
     const probes=[],seenProbe=new Set();
     function sample(state,variable,quota){
      const others=ends.filter(id=>id!==variable),lines=[];
      for(let i=0;i<others.length;i++)for(let j=i+1;j<others.length;j++){b.spend(4);lines.push([now(state,others[i]),now(state,others[j])]);}
      // Include cyclic event lines at all affected stars for this variable.
      lines.push(...localAngularLines(g,positions,state,[...affected],variable,b));
      let taken=0;
      for(const point of angularLineProposals(state.get(variable),g.nodesById.get(variable),displacementLimit,lines,b)){
       if(taken>=quota||base.localProbes>=192)break;
       taken++;base.localProbes++;b.expand();b.spend(city.survey.boundary.length);
       if(!insideOrOn(point,city.survey.boundary)){base.precision.scopeLocal++;continue;}
       const next=new Map(state);next.set(variable,point);
       const key=JSON.stringify(group.map(id=>next.get(id)));if(seenProbe.has(key))continue;seenProbe.add(key);
       b.spend(16);const contact=classifyP5Contact(now(next,ra.a),now(next,ra.b),now(next,rb.a),now(next,rb.b));
       const cross=contact.kind==='none'?0:1,pos=new Map([...positions,...next]);
       let rotation=0;for(const id of affected){b.spend();if(!cyclicEqual(oldOrders.get(id),order(g,id,pos,b)))rotation++;}
       if(!cross)base.precision.localClear++;if(!rotation)base.precision.rotationClear++;
       const cost=group.reduce((sum,id)=>{b.spend(4);const p=next.get(id),o=points.get(id);return sum+Math.hypot(p.x-o.x,p.y-o.y);},0);
       probes.push({points:next,variable,cross,rotation,cost});
      }
     }
     for(const v of vars)sample(points,v,Math.floor(96/Math.max(1,vars.length)));
     probes.sort(rank);const first=probes.slice(0,8);
     for(let i=0;i<first.length;i++){
      const t=first[i],other=vars.filter(v=>v!==t.variable);
      for(const v of other)sample(t.points,v,Math.floor((192-base.localProbes)/Math.max(1,(first.length-i)*other.length)));
     }
     probes.sort(rank);
     for(const t of probes){if(base.attempts>=48||base.seeds.length>=2)break;if(t.cross||t.rotation)continue;const item=evaluate(group,t.points,'precision-contact-event');
      if(item?.score===0&&base.geometrySeeds.length<2)base.geometrySeeds.push({neighbors:group.map(id=>({id,old:point(g.nodesById.get(id)),point:point(t.points.get(id))})),attempt:base.attempts});}
     base.precision.localBoth=probes.filter(x=>!x.cross&&!x.rotation).length;
     if(aresReplayJson(f.project,b)!==before)throw Error('Precision source mutated.');aresReplayJson(base,b);
     return finish(base.seeds.length?'split-seeds-found':base.geometrySeeds.length?'geometry-seeds-found':'no-split-seed');
    }
    if(repair){
     const old=readReformRepairArchive().get(caseId);
     if(JSON.stringify(old.baselineRotation)!==JSON.stringify(rotationClauses))throw Error('Repair baseline changed.');
     base.localProbes=0;base.repair={firstProbes:0,secondProbes:0,pairs:0,contactTrials:0,archivedStarts:0,bestLocal:null,scopeLocal:0};
     const starts=[],keys=new Set(),ranked=[];
     function addStart(neighbors){
      if(!neighbors?.length)return;
      const group=neighbors.map(n=>n.id).sort(riCompare);
      if(!groups.some(g=>JSON.stringify(g)===JSON.stringify(group)))return;
      const points=new Map();
      for(const n of neighbors){b.spend(8);const orig=g.nodesById.get(n.id);if(!orig||orig.x!==n.old.x||orig.y!==n.old.y||!Number.isFinite(n.point.x)||!Number.isFinite(n.point.y)||Math.hypot(n.point.x-orig.x,n.point.y-orig.y)>displacementLimit)throw Error('Repair archive coordinate mismatch.');points.set(n.id,n.point);}
      const key=JSON.stringify(group.map(id=>[id,points.get(id)]));if(keys.has(key))return;keys.add(key);
      starts.push({group,points,cost:0});base.repair.archivedStarts++;
     }
     addStart(old.best?.neighbors);addStart(old.bestRotation?.neighbors);addStart(residual);addStart(retained);
     const affected=group=>{const out=new Set([...positions.keys(),...group]);for(const id of [...out])for(const v of g.adjacency.get(id)){b.spend();out.add(v);}return [...out].sort(riCompare);};
     const changes=(group,points)=>{const pos=new Map([...positions,...points]);return affected(group).filter(id=>{b.spend();return !cyclicEqual(oldOrders.get(id),order(g,id,pos,b));});};
     const queue=[];
     function trial(state,arm){
      if(base.attempts>=48||base.seeds.length>=2)return;
      const item=evaluate(state.group,state.points,arm);
      if(item&&item.score===0&&base.geometrySeeds.length<2)base.geometrySeeds.push({neighbors:state.group.map(id=>({id,old:point(g.nodesById.get(id)),point:point(state.points.get(id))})),attempt:base.attempts});
      if(item&&item.score>0&&item.feedback?.length)queue.push({...state,item});
      return item;
     }
     // Replay the bounded archived candidates first, including the contact near misses.
     for(const state of starts)trial(state,'repair-archived');
     // Add at most eight fresh starts at the smallest structural covers.
     for(const group of groups.slice(0,8)){
      if(base.attempts>=12||base.seeds.length>=2)break;
      const points=reformCoverTrial(g,positions,group,mandatory,proposalOffset,0,b,null,cap);
      projectCyclic(g,positions,points,affected(group),oldOrders,proposalOffset,0,b);
      const state={group,points,cost:0};starts.push(state);trial(state,'repair-minimum-cover');
     }
     // Select best distinct starting groups and preserve contact-cleared starts.
     for(const state of starts)state.changed=changes(state.group,state.points);
     starts.sort((a,c)=>a.changed.length-c.changed.length||a.group.length-c.group.length);
     const selected=starts.slice(0,4),seenLocal=new Set();
     const rank=(a,c)=>a.changed.length-c.changed.length||a.cost-c.cost;
     function probe(state,vars,targets,quota,stage,out){
      const streams=vars.map(id=>({id,it:angularLineProposals(state.points.get(id),g.nodesById.get(id),displacementLimit,localAngularLines(g,positions,state.points,targets,id,b),b)}));
      let taken=0,active=true;
      while(active&&taken<quota&&base.localProbes<192){
       active=false;
       for(const stream of streams){
        if(taken>=quota||base.localProbes>=192)break;
        const p=stream.it.next();if(p.done)continue;active=true;taken++;b.expand();base.localProbes++;base.repair[stage+'Probes']++;
        const orig=g.nodesById.get(stream.id);b.spend(city.survey.boundary.length+4);
        if(!insideOrOn(p.value,city.survey.boundary)||Math.hypot(p.value.x-orig.x,p.value.y-orig.y)>displacementLimit||p.value.x===orig.x&&p.value.y===orig.y){base.repair.scopeLocal++;continue;}
        const points=new Map(state.points);points.set(stream.id,p.value);
        const key=JSON.stringify(state.group.map(id=>[id,points.get(id)]));if(seenLocal.has(key))continue;seenLocal.add(key);
        const changed=changes(state.group,points);
        if(stage==='first'&&changed.length>state.changed.length+1)continue;
        const next={group:state.group,points,changed,firstId:state.firstId??stream.id,original:state.original??state.changed,cost:state.cost+Math.hypot(p.value.x-state.points.get(stream.id).x,p.value.y-state.points.get(stream.id).y)};
        if(stage==='second')base.repair.pairs++;
        if(base.repair.bestLocal===null||changed.length<base.repair.bestLocal)base.repair.bestLocal=changed.length;
        out.push(next);
       }
      }
     }
     const first=[];
     for(const state of selected){
      if(!state.changed.length)continue;
      const vars=state.group.filter(v=>state.changed.some(id=>id===v||[...g.adjacency.get(id)].includes(v)));
      const local=[];probe(state,vars,state.changed,Math.floor(96/Math.max(1,selected.length)),'first',local);local.sort(rank);
      for(const id of vars){const own=local.filter(x=>x.firstId===id);if(own.length)first.push(own[0]);const plateau=own.find(x=>x.changed.length===state.changed.length&&x!==own[0]);if(plateau)first.push(plateau);}
     }
     first.sort(rank);const second=[],diverse=[],used=new Set();
     for(const t of first){const k=JSON.stringify([t.group,t.firstId]);if(used.has(k))continue;used.add(k);diverse.push(t);if(diverse.length===8)break;}
     for(let i=0;i<diverse.length;i++){
      const t=diverse[i],targets=[...new Set([...t.original,...t.changed])].sort(riCompare);
      const vars=t.group.filter(v=>v!==t.firstId&&targets.some(id=>id===v||[...g.adjacency.get(id)].includes(v)));
      probe(t,vars,targets,Math.floor((192-base.localProbes)/(diverse.length-i)),'second',second);
     }
     ranked.push(...first,...second);ranked.sort(rank);
     for(const state of ranked){if(base.attempts>=32||base.seeds.length>=2)break;trial(state,'repair-coupled-angular');}
     // Use actual blocking contact pairs when available, not just baseline pairs.
     // Prioritize candidates already passing cyclic order; exact full gate remains mandatory.
     let iterations=0;
     while(queue.length&&base.attempts<48&&base.seeds.length<2&&iterations<48){
      queue.sort((a,c)=>a.item.score-c.item.score||a.group.length-c.group.length);
      const state=queue.shift(),{group,item}=state;
      const points=reformCoverTrial(g,positions,group,item.feedback,proposalOffset,iterations++,b,item.points,cap);
      projectCyclic(g,positions,points,affected(group),oldOrders,proposalOffset,iterations,b);
      base.repair.contactTrials++;trial({group,points,cost:0},'repair-residual-contact');
     }
     if(aresReplayJson(f.project,b)!==before)throw Error('Repair search mutated source.');
     aresReplayJson(base,b);
     return finish(base.seeds.length?'split-seeds-found':base.geometrySeeds.length?'geometry-seeds-found':'no-split-seed');
    }
    const states=groups.slice(0,16).map(group=>{
     const affected=new Set(exactChanged);
     for(const id of [...positions.keys(),...group]){b.spend();affected.add(id);for(const v of g.adjacency.get(id)){b.spend();affected.add(v);}}
     let prior=null;
     for(const seed of [residual,retained]){
      if(JSON.stringify(seed.map(n=>n.id).sort(riCompare))!==JSON.stringify(group))continue;
      const points=new Map();
      for(const n of seed){b.spend(8);const old=g.nodesById.get(n.id);if(!old||old.x!==n.old.x||old.y!==n.old.y||!Number.isFinite(n.point.x)||!Number.isFinite(n.point.y)||Math.hypot(n.point.x-old.x,n.point.y-old.y)>displacementLimit)throw Error('Reform archived coordinate mismatch.');points.set(n.id,n.point);}
      prior=points;break;
     }
     return {group,affected:[...affected].sort(riCompare),prior,best:null,feedback:mandatory};
    });
    base.triedGroups=states.map(x=>x.group);
    for(let round=0;round<48&&base.attempts<48&&base.seeds.length<2;round++)for(const state of states){
     if(base.attempts>=48||base.seeds.length>=2)break;
     const {group,affected}=state,usePrior=state.prior&&round%4!==3;
     const points=usePrior&&round%2===0?new Map(state.prior):reformCoverTrial(g,positions,group,state.feedback.length?state.feedback:mandatory,proposalOffset,round,b,usePrior?state.prior:null,cap);
     projectCyclic(g,positions,points,affected,oldOrders,proposalOffset,round,b);
     // Exact selected coordinates are never taken from the scaled proposal vector.
     const item=evaluate(group,points,'numerical-cyclic');
     if(item&&item.score===0&&base.geometrySeeds.length<2)base.geometrySeeds.push({neighbors:group.map(id=>({id,old:point(g.nodesById.get(id)),point:point(points.get(id))})),attempt:base.attempts});
     if(item&&(!state.best||item.score<state.best.score)){state.best=item;state.prior=item.points;state.feedback=item.feedback;}
    }
    if(aresReplayJson(f.project,b)!==before)throw Error('Reform search mutated source.');
    aresReplayJson(base,b);
    return finish(base.seeds.length?'split-seeds-found':base.geometrySeeds.length?'geometry-seeds-found':groups.length?'no-split-seed':'structural-held');
   }
   if(localAware){
    base.strategy='local-angular';base.localProbes=0;base.localScope={outside:0,unchanged:0,displacement:0};base.geometrySeeds=[];
    const historical=readCyclicArchive().get(caseId),previous=readRotationArchive().get(caseId);
    if(historical.category!=='no-split-seed'||!cover.groups.length||JSON.stringify(historical.baselineRotation)!==JSON.stringify(rotationClauses))throw Error('Local angular cohort mismatch.');
    const fresh=coupledAware?readLocalArchive().get(caseId):null;
    if(fresh&&JSON.stringify(fresh.baselineRotation)!==JSON.stringify(rotationClauses))throw Error('Coupled angular baseline changed.');
    const limit=Math.hypot(lock.offset.x,lock.offset.y),seeds=[fresh?.bestRotation,historical.bestRotation,previous.bestRotation].filter(Boolean),starts=[],keys=new Set();
    for(const seed of seeds){
     const group=seed.neighbors.map(n=>n.id).sort(riCompare),key=JSON.stringify(seed.neighbors);
     if(keys.has(key))continue;keys.add(key);
     if(!cover.groups.some(g=>JSON.stringify(g)===JSON.stringify(group)))throw Error('Residual cluster changed.');
     const points=new Map();for(const n of seed.neighbors){b.spend(8);const old=g.nodesById.get(n.id);if(!old||old.x!==n.old.x||old.y!==n.old.y||!Number.isFinite(n.point.x)||!Number.isFinite(n.point.y)||Math.hypot(n.point.x-old.x,n.point.y-old.y)>limit)throw Error('Residual coordinate changed.');points.set(n.id,n.point);}
     starts.push({group,points,changed:seed.ids});
    }
    function changes(group,points){
     const pos=new Map([...positions,...points]),affected=new Set([...pos.keys()]);
     for(const id of pos.keys())for(const v of g.adjacency.get(id)){b.spend();affected.add(v);}
     const changed=[];for(const id of affected){b.spend();if(!cyclicEqual(oldOrders.get(id),order(g,id,pos,b)))changed.push(id);}
     return changed.sort(riCompare);
    }
    function admissible(id,p){
     const old=g.nodesById.get(id);b.spend(city.survey.boundary.length+4);
     if(p.x===old.x&&p.y===old.y){base.localScope.unchanged++;return false;}
     if(Math.hypot(p.x-old.x,p.y-old.y)>limit){base.localScope.displacement++;return false;}
     if(!insideOrOn(p,city.survey.boundary)){base.localScope.outside++;return false;}
     return true;
    }
    if(coupledAware){
     base.strategy='coupled-angular';base.coupled={starts:starts.length,firstProbes:0,secondProbes:0,plateauIntermediate:0,uphillIntermediate:0,pairCandidates:0,bestLocal:null};
     const seenLocal=new Set(),first=[],pairs=[];
     const rank=(a,c)=>a.changed.length-c.changed.length||a.cost-c.cost;
     function streams(state,variables,changed){
      return variables.map(id=>({id,it:angularLineProposals(state.points.get(id),g.nodesById.get(id),limit,localAngularLines(g,positions,state.points,changed,id,b),b)}));
     }
     function sample(state,vars,targets,cap,stage,collector){
      const iter=streams(state,vars,targets);let taken=0,active=true;
      while(active&&taken<cap&&base.localProbes<192){
       active=false;
       for(const stream of iter){
        if(taken>=cap||base.localProbes>=192)break;
        const step=stream.it.next();if(step.done)continue;active=true;b.expand();taken++;base.localProbes++;base.coupled[stage+'Probes']++;
        if(!admissible(stream.id,step.value))continue;
        const next=new Map(state.points);next.set(stream.id,step.value);
        const key=JSON.stringify(state.group.map(id=>[id,next.get(id)]));
        if(seenLocal.has(key))continue;seenLocal.add(key);
        const delta=changes(state.group,next);
        const trial={group:state.group,points:next,changed:delta,firstId:state.firstId??stream.id,cost:(state.cost??0)+Math.hypot(step.value.x-state.points.get(stream.id).x,step.value.y-state.points.get(stream.id).y),original:state.original??state.changed};
        if(stage==='first'){
         if(delta.length===state.changed.length)base.coupled.plateauIntermediate++;
         if(delta.length>state.changed.length)base.coupled.uphillIntermediate++;
        }else base.coupled.pairCandidates++;
        if(base.coupled.bestLocal===null||delta.length<base.coupled.bestLocal)base.coupled.bestLocal=delta.length;
        collector.push(trial);
       }
      }
     }
     // Half the probe ceiling explores first moves across archived starts.
     // Retain equal-score and bounded uphill intermediates: neither is a seed.
     for(const start of starts){
      const state={...start,changed:changes(start.group,start.points)};
      const vars=state.group.filter(v=>state.changed.some(id=>id===v||[...g.adjacency.get(id)].includes(v)));
      const local=[];sample(state,vars,state.changed,Math.floor(96/starts.length),'first',local);
      local.sort(rank);
      // Diversity by first moved variable, with both plateau and improving starts.
      for(const v of vars){
       const own=local.filter(t=>t.firstId===v);
       if(own.length)first.push(own[0]);
       const plateau=own.find(t=>t.changed.length===state.changed.length&&t!==own[0]);
       if(plateau)first.push(plateau);
       const uphill=own.find(t=>t.changed.length===state.changed.length+1);
       if(uphill&&uphill!==own[0])first.push(uphill);
      }
     }
     first.sort(rank);
     const selected=[],covered=new Set();
     for(const t of first){
      const k=JSON.stringify([t.group,t.firstId]);if(covered.has(k))continue;covered.add(k);selected.push(t);if(selected.length===8)break;
     }
     for(const t of first){if(selected.length===8)break;if(!selected.includes(t))selected.push(t);}
     // Recompute event lines after the first move, with a distinct second
     // variable. No added neighbors, no mutation, no relaxed final gate.
     for(let i=0;i<selected.length;i++){
      const t=selected[i],targets=[...new Set([...t.original,...t.changed])].sort(riCompare);
      const vars=t.group.filter(v=>v!==t.firstId&&targets.some(id=>id===v||[...g.adjacency.get(id)].includes(v)));
      sample(t,vars,targets,Math.floor((192-base.localProbes)/(selected.length-i)),'second',pairs);
     }
     const ranked=[...first,...pairs].sort(rank);
     for(const trial of ranked){
      if(base.attempts>=48||base.seeds.length>=2)break;
      const item=evaluate(trial.group,trial.points,'coupled-angular-event');
      if(item&&item.score===0&&base.geometrySeeds.length<2)base.geometrySeeds.push({neighbors:trial.group.map(id=>({id,old:point(g.nodesById.get(id)),point:point(trial.points.get(id))})),attempt:base.attempts});
     }
     if(aresReplayJson(f.project,b)!==before)throw Error('Coupled angular search mutated source.');
     aresReplayJson(base,b);
     return finish(base.seeds.length?'split-seeds-found':base.geometrySeeds.length?'geometry-seeds-found':'no-split-seed');
    }
    // Interleave the historical near misses; each local proposal uses only
    // one existing group variable, all selected endpoints stay exact.
    const candidateKeys=new Set(),queue=[...starts];
    for(let round=0;round<8&&queue.length&&base.attempts<48&&base.localProbes<192&&base.seeds.length<2;round++){
     const current=queue.shift(),{group,points}=current,changed=changes(group,points);
     const variables=group.filter(v=>changed.some(id=>v===id||[...g.adjacency.get(id)].includes(v)));
     const ranked=[],streams=variables.map(id=>({id,it:angularLineProposals(points.get(id),g.nodesById.get(id),limit,localAngularLines(g,positions,points,changed,id,b),b)}));
     let exhausted=false;
     // Round-robin across variables to avoid a single high-degree star
     // monopolizing the bounded proposal count.
     for(let i=0;i<48&&!exhausted&&base.localProbes<192;i++){
      exhausted=true;
      for(const stream of streams){
       if(base.localProbes>=192)break;const p=stream.it.next();if(p.done)continue;exhausted=false;b.expand();base.localProbes++;
       if(!admissible(stream.id,p.value))continue;
       const next=new Map(points);next.set(stream.id,p.value);
       const key=JSON.stringify(group.map(id=>next.get(id)));if(candidateKeys.has(key))continue;candidateKeys.add(key);
       const delta=changes(group,next);if(delta.length>changed.length)continue;
       ranked.push({group,points:next,changed:delta,move:Math.hypot(p.value.x-points.get(stream.id).x,p.value.y-points.get(stream.id).y)});
      }
      if(ranked.length>=16)break;
     }
     ranked.sort((a,c)=>a.changed.length-c.changed.length||a.move-c.move);
     for(const trial of ranked.slice(0,6)){
      if(base.attempts>=48||base.seeds.length>=2)break;
      const item=evaluate(trial.group,trial.points,'local-angular-event');
      if(item&&item.score===0&&base.geometrySeeds.length<2)base.geometrySeeds.push({neighbors:trial.group.map(id=>({id,old:point(g.nodesById.get(id)),point:point(trial.points.get(id))})),attempt:base.attempts});
      if(item&&trial.changed.length<changed.length)queue.push(trial);
     }
    }
    if(aresReplayJson(f.project,b)!==before)throw Error('Local angular search mutated source.');
    aresReplayJson(base,b);
    return finish(base.seeds.length?'split-seeds-found':base.geometrySeeds.length?'geometry-seeds-found':'no-split-seed');
   }
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
