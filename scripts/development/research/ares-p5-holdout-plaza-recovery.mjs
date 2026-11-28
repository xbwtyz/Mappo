import {tournamentLockedRow} from './ares-p5-tournament-lock.mjs';
import {createHash} from 'node:crypto';
import {plazaExperimentCase,PLAZA_EXPERIMENT_CASES} from './ares-p5-holdout-plaza-experiment-lock.mjs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {pairsFor,reformCoverTrial} from './ares-p4x-hybrid.mjs';
import {projectCyclic,cyclicTargets} from './ares-p5-holdout-cyclic.mjs';
import {reformRotationCoverGroups,rotationTriplets,projectRotation} from './ares-p5-holdout-rotation.mjs';
import {angularLineProposals,localAngularLines} from './ares-p5-holdout-local-angular.mjs';
import {constructP5CoordinatedCandidate} from './ares-p5-topology-observe.mjs';
import {auditP5CoordinatedCandidate} from './ares-p5-topology-audit.mjs';
import {insideOrOn} from '../../../src/core/boundary.js';
import {measureConnectedMinimum} from './ares-p5-holdout-cyclic.mjs';
import {classifyP5Contact,P5_LIMITS} from './ares-p5-topology-contract.mjs';
import {classifyRoad,iterateRoadGraph} from '../../../src/core/road-graph.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
export const PLAZA_RECOVERY_CASES=PLAZA_EXPERIMENT_CASES;
const nodeFields=new Set(['id','x','y']);
const roadFields=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
const known=(r,fields,b)=>Object.keys(r).every(k=>{b.spend();return fields.has(k);});
const sort=xs=>[...xs].sort(riCompare);
function graph(city,b){
 b.spend(city.nodes.length+city.roads.length);const it=iterateRoadGraph(city);let paid=0;
 try{for(;;){const s=it.next();if(s.done){if(s.value.work>paid)b.spend(s.value.work-paid);return s.value;}if(s.value.stage==='road-graph-intersections'){b.spend(64);paid+=64;}else b.spend();}}finally{it.return();}
}
export function plazaRecoveryOrder(g,id,positions,b){
 const n=positions.get(id)??g.nodesById.get(id),ids=[...g.incidentRoads.get(id)];
 b.spend(Math.max(1,ids.length*Math.ceil(Math.log2(ids.length+1))));
 return ids.map(rid=>{b.spend();const r=g.roadsById.get(rid),p=positions.get(r.a===id?r.b:r.a)??g.nodesById.get(r.a===id?r.b:r.a);return {rid,angle:Math.atan2(p.y-n.y,p.x-n.x)};}).sort((a,c)=>a.angle-c.angle||riCompare(a.rid,c.rid)).map(x=>x.rid);
}
export function samePlazaRecoveryOrder(a,c){if(a.length!==c.length)return false;if(!a.length)return true;const i=c.indexOf(a[0]);return i>=0&&a.every((v,j)=>v===c[(i+j)%c.length]);}
// Source-bound detached preparation for the subsequent coordinated solver.
// No caller project, coordinates, writable list, or permission token.
// The single shared root belongs to the fixed experimental entry point.
async function prepare(caseId,b,tournament=false){
 const prior=tournament?tournamentLockedRow(caseId):plazaExperimentCase(caseId,'strict'),lock=tournament?prior:holdoutLockedRow(caseId),f=materializeLockedRtreCase(caseId);
 const before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');b.spend(Math.max(1,Math.ceil(bytes.length/64)));
 if(createHash('sha256').update(bytes).digest('hex')!==lock.source)throw Error('Plaza recovery source mismatch.');
 const city=f.project.city,report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:10000,maxHops:6},b);
 if(report.snapshotFingerprint!==lock.source)throw Error('Admitted plaza recovery source changed.');
 if(tournament){
  // Independently reconstruct the exact selected vertices and check the
  // immutable outline, not a search outcome or claimed refusal.
  const selected=new Set(lock.selectedRoadIds),nodes=new Map(city.nodes.map(n=>[n.id,n])),ends=new Set();
  b.spend(Math.max(1,city.nodes.length));
  for(const road of city.roads){b.spend();if(selected.has(road.id)){ends.add(road.a);ends.add(road.b);}}
  const outside=[],requested=new Map();
  for(const id of ends){b.spend(4+city.survey.boundary.length);const n=nodes.get(id),p={x:lock.offset.x===0?n.x:n.x+lock.offset.x,y:lock.offset.y===0?n.y:n.y+lock.offset.y};requested.set(id,p);if(!insideOrOn(p,city.survey.boundary))outside.push(id);}
  if(outside.length){
   const observed=new Map(report.requested.map(n=>[n.ref.id,n.point]));
   const agreement=observed.size===requested.size&&[...requested].every(([id,p])=>{b.spend();return Object.is(p.x,observed.get(id)?.x)&&Object.is(p.y,observed.get(id)?.y);})&&report.geometryDiagnostics.some(d=>d.code==='boundary-escape');
   if(aresReplayJson(f.project,b)!==before)throw Error('Tournament preflight mutated source.');
   return {early:agreement?'boundary-refused':'preflight-refused',reason:agreement?'fixed-boundary':'boundary-observer-disagreement',preflight:{status:report.status,outside:sort(outside),diagnostics:report.geometryDiagnostics.map(d=>({code:d.code,reason:d.reason}))}};
  }
  if(!['research-eligible','no-eligible-neighbors'].includes(report.status)){
   if(aresReplayJson(f.project,b)!==before)throw Error('Tournament preflight mutated source.');
   return {early:'preflight-refused',reason:report.status,preflight:{status:report.status,outside:[],diagnostics:report.geometryDiagnostics.map(d=>({code:d.code,reason:d.reason}))}};
  }
 }
 if(!['research-eligible','no-eligible-neighbors'].includes(report.status))throw Error('Admitted plaza recovery scope changed.');
 const g=graph(city,b);if(!g.valid)throw Error('Invalid source graph.');
 const positions=new Map(report.requested.map(x=>[x.ref.id,x.point])),eligible=new Set(report.eligibleJunctions.map(x=>x.ref.id)),admitted=new Set(report.entries.map(x=>x.ref.collection+':'+x.ref.id));
 const fixed=new Set(city.plaza?.vertices??[]),exceptions=new Set(fixed),terminal=new Set(g.terminalRoadIds);
 for(const r of city.roads){b.spend();const cls=classifyRoad(r);if(cls.protected||terminal.has(r.id)){fixed.add(r.a);fixed.add(r.b);}if(terminal.has(r.id)||cls.reasons.some(x=>x!=='plaza')){exceptions.delete(r.a);exceptions.delete(r.b);}}
 for(const gate of city.gates??[]){b.spend();const id=gate.connection?.cityNodeId;if(id!=null){fixed.add(id);exceptions.delete(id);}}
 for(const k of ['waterFaces','terrainFaces'])for(const row of city[k]??[])for(const id of row.vertices??[]){b.spend();fixed.add(id);exceptions.delete(id);}
 for(const e of report.entries){b.spend();if(e.role==='protected-anchor'&&e.ref.collection==='nodes')fixed.add(e.ref.id);}
 for(const id of positions.keys()){b.spend();exceptions.delete(id);}
 for(const id of [...exceptions]){b.spend();if(!admitted.has('nodes:'+id)||!known(g.nodesById.get(id),nodeFields,b))exceptions.delete(id);}
 const nodeOK=id=>admitted.has('nodes:'+id)&&!fixed.has(id)&&known(g.nodesById.get(id),nodeFields,b);
 const roadOK=r=>admitted.has('roads:'+r.id)&&!classifyRoad(r).protected&&!terminal.has(r.id)&&known(r,roadFields,b);
 const closureOK=id=>nodeOK(id)&&[...g.incidentRoads.get(id)].every(rid=>{b.spend();const r=g.roadsById.get(rid);return roadOK(r)&&[r.a,r.b].every(v=>admitted.has('nodes:'+v)&&known(g.nodesById.get(v),nodeFields,b));});
 const writable=new Set([...eligible].filter(id=>{b.spend();return !positions.has(id)&&closureOK(id);}));
 const splitOK=(road,arm)=>roadOK(road)&&[road.a,road.b].every(id=>nodeOK(id)&&(positions.has(id)||eligible.has(id))||arm==='plaza-attached'&&exceptions.has(id));
 const at=id=>positions.get(id)??g.nodesById.get(id);
 const pairs=pairsFor(g,report.geometryDiagnostics,writable,b).map(p=>{b.spend(16);const [a,c]=p.ids.map(id=>g.roadsById.get(id));return {...p,kind:classifyP5Contact(at(a.a),at(a.b),at(c.a),at(c.b)).kind};});
 const other=report.geometryDiagnostics.filter(d=>!['unnormalized-crossing','overlapping-roads'].includes(d.code)).map(d=>({code:d.code,reason:d.reason}));
 const orders=new Map(),changed=[];
 for(const id of g.nodesById.keys()){b.spend();const o=plazaRecoveryOrder(g,id,new Map(),b);orders.set(id,o);if(!samePlazaRecoveryOrder(o,plazaRecoveryOrder(g,id,positions,b)))changed.push(id);}
 const rotation=changed.map(id=>({id,eligible:sort(new Set([id,...g.adjacency.get(id)].filter(v=>writable.has(v))))}));
 const adj=new Map();
 for(const id of sort(writable)){const q=[id],seen=new Set(q),next=new Set();for(const n of q)for(const v of g.adjacency.get(n)){b.spend();if(positions.has(v)&&!seen.has(v)){seen.add(v);q.push(v);}else if(v!==id&&writable.has(v))next.add(v);}adj.set(id,sort(next));}
 const mandatoryFor=arm=>pairs.filter(p=>{b.spend(8);return !(p.kind==='interior-interior'&&p.ids.every(id=>splitOK(g.roadsById.get(id),arm)));});
 return {prior,lock,f,before,city,report,g,positions,eligible,admitted,fixed,exceptions,terminal,writable,nodeOK,roadOK,splitOK,pairs,other,orders,rotation,adj,mandatoryFor,selectedClosure:[...positions.keys()].every(closureOK)};
}
// Necessary contact/rotation coverage only. A connected witness is not a
// coordinate solution. Historical strict search APIs remain unchanged.
export async function diagnosePlazaRecovery(caseId){
 const prior=plazaExperimentCase(caseId,'strict'),b=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions}),base={caseId,source:prior.source,authority:'none',priorOutcome:prior.expandedOutcome==='unresolved'&&caseId==='h:radial-12'?'verified':prior.expandedOutcome,arms:[]};
 const finish=status=>riFreeze({...base,status,stats:b.snapshot()});
 try{
  const x=await prepare(caseId,b);
  base.selected=x.positions.size;base.eligible=x.eligible.size;base.writable=x.writable.size;base.exceptions=sort(x.exceptions);base.contacts=x.pairs.length;base.rotation=x.rotation;base.other=x.other;base.selectedClosure=x.selectedClosure;
  for(const arm of ['strict','plaza-attached']){
   const mandatory=x.mandatoryFor(arm),clauses=[...mandatory.map(p=>p.movable),...x.rotation.map(r=>r.eligible)];
   const minimum=measureConnectedMinimum(clauses,x.adj,b);
   if(minimum.witness!==null){const witness=new Set(minimum.witness);if(witness.size!==minimum.witness.length||[...witness].some(id=>!x.writable.has(id)||x.fixed.has(id))||!clauses.every(c=>c.some(id=>witness.has(id))))throw Error('Plaza cover witness invalid.');}
   const withinEight=minimum.status==='exact'?minimum.minimum<=8:minimum.status==='bounded-unknown'&&minimum.lower<=8?null:false;
   base.arms.push({arm,mandatory:mandatory.length,mandatoryPairs:mandatory.map(p=>({ids:p.ids,kind:p.kind,movable:p.movable})),clauses:clauses.length,minimum,withinEight});
  }
  if(base.arms[1].mandatory>base.arms[0].mandatory)throw Error('Nonmonotonic plaza contact restriction.');
  if(aresReplayJson(x.f.project,b)!==x.before)throw Error('Plaza recovery preparation mutated source.');
  aresReplayJson(base,b);return finish('diagnosed');
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit');throw e;}
}

// Batch II pilot. All proposal generation, full evaluations and the one
// construction share one root. The independent audit is a separate,
// non-search replay under its previously qualified fixed bound.
export async function searchCoordinatedPlazaRecovery(caseId){return coordinatedPlazaSearch(caseId,false);}
export async function searchDiversifiedPlazaRecovery(caseId){return coordinatedPlazaSearch(caseId,true);}
export async function searchResidualPlazaRecovery(caseId){return coordinatedPlazaSearch(caseId,true,true);}
export async function searchTournamentPlazaRecovery(caseId){tournamentLockedRow(caseId);return coordinatedPlazaSearch(caseId,true,false,true);}
async function coordinatedPlazaSearch(caseId,diversified,residual=false,tournament=false){
 const prior=tournament?tournamentLockedRow(caseId):plazaExperimentCase(caseId,'plaza-attached'),b=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
 const base={caseId,source:prior.source,authority:'none',attempts:0,localProbes:0,minimum:null,best:null,construction:null,audit:null};
 const finish=(status,reason=null)=>riFreeze({...base,status,reason,stats:b.snapshot()});
 try{
  const x=await prepare(caseId,b,tournament);
  if(x.early){base.preflight=x.preflight;return finish(x.early,x.reason);}
  const {g,positions,city,orders,writable}=x,offset=x.lock.offset,limit=Math.hypot(offset.x,offset.y);
  if(!x.selectedClosure)return finish('refused','selected-closure');
  const mandatory=x.mandatoryFor('plaza-attached'),clauses=[...mandatory.map(p=>p.movable),...x.rotation.map(r=>r.eligible)];
  const minimum=measureConnectedMinimum(clauses,x.adj,b);base.minimum=minimum;
  if(minimum.status!=='exact'||minimum.minimum>8)return finish('refused','necessary-cover-not-established');
  let ids=minimum.witness;
  if(ids.some(id=>!writable.has(id))||!clauses.every(c=>c.some(id=>ids.includes(id))))throw Error('Invalid coordinated cover.');
  const affectedFor=group=>{const affected=new Set([...positions.keys(),...group]);
   for(const id of [...affected])for(const v of g.adjacency.get(id)){b.spend();affected.add(v);}return sort(affected);};
  let affectedIds=affectedFor(ids);
  const point=n=>({x:n.x,y:n.y}),seen=new Set(),seenLocal=new Set();
  const scope=points=>ids.every(id=>{b.spend(4+city.survey.boundary.length);const old=g.nodesById.get(id),p=points.get(id);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000&&Math.hypot(p.x-old.x,p.y-old.y)<=limit&&(p.x!==old.x||p.y!==old.y)&&insideOrOn(p,city.survey.boundary);});
  const rotation=pos=>affectedIds.filter(id=>{b.spend();return !samePlazaRecoveryOrder(orders.get(id),plazaRecoveryOrder(g,id,pos,b));});
  // A continuous tie-break among equal discrete cyclic failure counts.
  // It only ranks research proposals; the full exact gate remains mandatory.
  const angularCost=(pos,changed)=>{
   let cost=0;
   for(const id of changed){
    const n=pos.get(id)??g.nodesById.get(id),prior=orders.get(id);
    const actual=prior.map(rid=>{b.spend(4);const r=g.roadsById.get(rid),v=r.a===id?r.b:r.a,p=pos.get(v)??g.nodesById.get(v);return {rid,angle:Math.atan2(p.y-n.y,p.x-n.x)};});
    for(const t of cyclicTargets(prior,actual,b)){b.spend();cost+=t.delta*t.delta;}
   }
   return cost;
  };
  const better=(a,c)=>!c||a.score<c.score||residual&&a.score===c.score&&a.angular<c.angular;
  const full=points=>{
   if(base.attempts>=47||base.attempts+base.localProbes>=255)return null;
   const key=JSON.stringify(ids.map(id=>[id,points.get(id)]));b.spend(1+ids.length);if(seen.has(key))return null;seen.add(key);b.expand();base.attempts++;
   if(!scope(points))return null;
   const pos=new Map([...positions,...points]),changed=rotation(pos);
   // Evaluate the exact graph even if angular constraints remain, so
   // the next coupled proposal can target both actual residual types.
   const candidate={...city,nodes:city.nodes.map(n=>{b.spend();return pos.has(n.id)?{...n,...pos.get(n.id)}:n;})},checked=graph(candidate,b);
   const bad=[],pairs=[],at=id=>pos.get(id)??g.nodesById.get(id);
   for(const issue of checked.issues){b.spend();
    if(!['unnormalized-crossing','overlapping-roads'].includes(issue.code)||issue.roadIds?.length!==2){bad.push(issue);continue;}
    const roadIds=sort(issue.roadIds),[a,c]=roadIds.map(id=>g.roadsById.get(id));b.spend(16);
    const kind=classifyP5Contact(at(a.a),at(a.b),at(c.a),at(c.b)).kind;
    if(kind!=='interior-interior'||!x.splitOK(a,'plaza-attached')||!x.splitOK(c,'plaza-attached')||![a.a,a.b,c.a,c.b].some(id=>pos.has(id)))bad.push(issue);
    pairs.push({code:issue.code,roadIds});
   }
   const feedback=pairsFor(g,bad.filter(i=>['unnormalized-crossing','overlapping-roads'].includes(i.code)&&i.roadIds?.length===2),writable,b);
   const score=changed.length*100000+bad.length*1000+pairs.length;
   const item={points,changed,feedback,score,angular:residual?angularCost(pos,changed):0,ready:!changed.length&&!bad.length&&(checked.valid||pairs.length>0),pairs};
   if(better(item,base.best))base.best={score,rotation:changed.length,blocking:bad.length,contacts:pairs.length,...(residual?{angular:item.angular,group:[...ids],changed:[...changed],blockedPairs:feedback.map(p=>p.ids),neighbors:ids.map(id=>({id,old:point(g.nodesById.get(id)),point:point(points.get(id))}))}:{})};
   return item;
  };
  const local=(item,quota)=>{
   const vars=ids.filter(id=>item.feedback.some(p=>p.ends.includes(id))||item.changed.some(v=>v===id||[...g.adjacency.get(v)].includes(id)));
   const at=id=>item.points.get(id)??positions.get(id)??g.nodesById.get(id);
   const streams=vars.map(variable=>{
    const lines=localAngularLines(g,positions,item.points,residual?item.changed:affectedIds,variable,b);
    for(const p of item.feedback.filter(p=>p.ends.includes(variable))){const other=[...new Set(p.ends.filter(id=>id!==variable))];for(let i=0;i<other.length;i++)for(let j=i+1;j<other.length;j++){b.spend(4);lines.push([at(other[i]),at(other[j])]);}}
    if(residual){
     // Interleave distinct event lines instead of exhausting the first line.
     // A current-point projection on each obstruction gets a fair turn.
     const iterators=lines.map(line=>angularLineProposals(item.points.get(variable),g.nodesById.get(variable),limit,[line],b));
     iterators.push(angularLineProposals(item.points.get(variable),g.nodesById.get(variable),limit,[],b));
     const interleaved=function*(){let active=iterators;while(active.length){const next=[];for(const it of active){b.spend();const step=it.next();if(!step.done){yield step.value;next.push(it);}}active=next;}};
     return {variable,it:interleaved()};
    }
    return {variable,it:angularLineProposals(item.points.get(variable),g.nodesById.get(variable),limit,lines,b)};
   });
   const ranked=[];let count=0,active=true;
   while(active&&count<quota&&base.localProbes<192){active=false;for(const stream of streams){
    if(count>=quota||base.localProbes>=192||base.attempts+base.localProbes>=255)break;
    const step=stream.it.next();if(step.done)continue;active=true;count++;base.localProbes++;b.expand();
    const points=new Map(item.points);points.set(stream.variable,step.value);
    const key=JSON.stringify(ids.map(id=>[id,points.get(id)]));b.spend(1+ids.length);if(seenLocal.has(key)||!scope(points))continue;seenLocal.add(key);
    const pos=new Map([...positions,...points]),now=id=>pos.get(id)??g.nodesById.get(id);
    let remaining=0;for(const p of item.feedback){const [a,c]=p.ids.map(id=>g.roadsById.get(id));b.spend(16);if(classifyP5Contact(now(a.a),now(a.b),now(c.a),now(c.b)).kind!=='none')remaining++;}
    const changed=rotation(pos);
    ranked.push({points,score:changed.length*100000+remaining*1000,angular:residual?angularCost(pos,changed):0});
   }}
   ranked.sort((a,c)=>a.score-c.score||a.angular-c.angular);return ranked.slice(0,3);
  };
  let best=null,ready=null;
  if(residual)base.residual={rank:'discrete-plus-angular-severity',schedule:'breadth-then-focused',focusedRounds:0};
  const take=item=>{if(!item)return;if(item.ready&&(!ready||item.score<ready.score))ready=item;if(!best||item.score<best.score)best=item;};
  if(!ids.length)take(full(new Map()));
  // Reserve work for the one construction; this is a conservative
  // scheduling reserve, not an increased ceiling or guaranteed fit.
  for(let round=0;!diversified&&ids.length&&!ready&&round<12&&base.attempts<47&&b.snapshot().remainingWork>2500000;round++){
   const points=reformCoverTrial(g,positions,ids,best?.feedback.length?best.feedback:mandatory,offset,round,b,round%3&&best?best.points:null,8);
   projectCyclic(g,positions,points,affectedIds,orders,offset,round,b);take(full(points));
   if(!ready&&best&&round%2===1&&b.snapshot().remainingWork>2500000){
    for(const p of local(best,Math.min(48,192-base.localProbes))){if(ready||base.attempts>=47||b.snapshot().remainingWork<=2500000)break;take(full(p.points));}
   }
  }
  if(diversified&&ids.length&&!ready){
   // Enumerate bounded alternatives only in the existing admitted graph.
   // Select the smallest first, then diverse alternatives by differing IDs.
   const first=[...ids],cover=reformRotationCoverGroups(clauses,x.adj,b,8);
   const pool=cover.groups.filter(group=>JSON.stringify(group)!==JSON.stringify(first));
   const groups=[first];
   while(pool.length&&groups.length<6){
    const diversity=group=>Math.min(...groups.map(g=>group.filter(id=>!g.includes(id)).length+g.filter(id=>!group.includes(id)).length));
    pool.sort((a,c)=>{b.spend(1+a.length+c.length);return a.length-c.length||diversity(c)-diversity(a)||riCompare(JSON.stringify(a),JSON.stringify(c));});
    groups.push(pool.shift());
   }
   const states=groups.map(group=>{
    if(!group.length||group.length>8||new Set(group).size!==group.length||group.some(id=>!writable.has(id))||!clauses.every(c=>c.some(id=>group.includes(id))))throw Error('Invalid alternative cover.');
    const reached=new Set([group[0]]),q=[group[0]];
    for(const id of q)for(const v of x.adj.get(id)??[]){b.spend();if(group.includes(v)&&!reached.has(v)){reached.add(v);q.push(v);}}
    if(reached.size!==group.length)throw Error('Disconnected alternative cover.');
    const affected=affectedFor(group);
    return {group,affected,triplets:rotationTriplets(g,affected,new Set(group),b),best:null,attempts:0,probes:0};
   });
   base.diversified={available:cover.groups.length,enumerationLimited:cover.limited??false,groups:states.map(t=>({ids:t.group,attempts:0,probes:0,best:null})),selected:null};
   let selected=null;
   for(let round=0;round<12&&!ready&&base.attempts<47&&b.snapshot().remainingWork>2500000;round++){
    // Fair initial breadth, then allocate by best actual residual score.
    const rankedStates=[...states].sort((a,c)=>(a.best?.score??Infinity)-(c.best?.score??Infinity)||(residual?(a.best?.angular??Infinity)-(c.best?.angular??Infinity):0)||a.group.length-c.group.length||riCompare(JSON.stringify(a.group),JSON.stringify(c.group)));
    const order=round<2?states:residual?rankedStates.slice(0,round<4?3:2):rankedStates;
    if(residual&&round>=2)base.residual.focusedRounds++;
    for(const st of order){
     if(ready||base.attempts>=47||b.snapshot().remainingWork<=2500000)break;
     ids=st.group;affectedIds=st.affected;
     const prevAttempts=base.attempts,prevProbes=base.localProbes;
     const accept=item=>{if(!item)return;if(better(item,st.best))st.best=item;if(item.ready){ready=item;selected=st;}};
     const points=reformCoverTrial(g,positions,ids,st.best?.feedback.length?st.best.feedback:mandatory,offset,round,b,round%3&&st.best?st.best.points:null,8);
     // Alternate exact-cyclic projection with conservative pairwise
     // orientation assistance, never changing the actual cyclic gate.
     if(round%3===2)projectRotation(g,positions,points,st.triplets,offset,round,b);
     if(residual&&round>=3&&st.best&&round%3===0){
      // Additional bounded seed: interpolate each independent neighbor
      // toward its original position, with deterministic mixed weights.
      // Selected requested coordinates are never modified.
      for(let i=0;i<ids.length;i++){
       const id=ids[i],p=st.best.points.get(id),old=g.nodesById.get(id),k=[.35,.65,.9][(round+i)%3];b.spend(4);
       points.set(id,{x:old.x+(p.x-old.x)*k,y:old.y+(p.y-old.y)*k});
      }
     }
     projectCyclic(g,positions,points,affectedIds,orders,offset,round,b);accept(full(points));
     if(!ready&&st.best&&round>=1&&base.localProbes<192&&b.snapshot().remainingWork>2500000){
      const quota=Math.min(residual?(round<2?4:round<4?12:24):(round<3?8:16),192-base.localProbes);
      for(const p of local(st.best,quota).slice(0,residual?3:2)){if(ready||base.attempts>=47||b.snapshot().remainingWork<=2500000)break;accept(full(p.points));}
     }
     st.attempts+=base.attempts-prevAttempts;st.probes+=base.localProbes-prevProbes;
     const info=base.diversified.groups[states.indexOf(st)];info.attempts=st.attempts;info.probes=st.probes;info.best=st.best?.score??null;
    }
   }
   if(selected){ids=selected.group;affectedIds=selected.affected;base.diversified.selected=ids;}
  }
  if(aresReplayJson(x.f.project,b)!==x.before)throw Error('Coordinated source mutated.');
  if(!ready)return finish('refused','no-geometric-seed');
  const neighbors=ids.map(id=>({id,old:point(g.nodesById.get(id)),point:point(ready.points.get(id))}));
  const c=await constructP5CoordinatedCandidate(caseId,neighbors,ready.pairs,b);base.construction=c;
  if(c.status!=='graph-candidate')return finish('refused',c.reason);
  const audit=await auditP5CoordinatedCandidate(caseId,c);base.audit=audit;
  return finish(audit.status==='topology-final-verified'&&!audit.sweptUnresolved.length?'verified':'unverified',audit.reason);
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit',e.resource);throw e;}
}
