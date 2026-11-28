import {createHash} from 'node:crypto';
import {plazaExperimentCase,PLAZA_EXPERIMENT_CASES} from './ares-p5-holdout-plaza-experiment-lock.mjs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {pairsFor} from './ares-p4x-hybrid.mjs';
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
async function prepare(caseId,b){
 const prior=plazaExperimentCase(caseId,'strict'),lock=holdoutLockedRow(caseId),f=materializeLockedRtreCase(caseId);
 const before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');b.spend(Math.max(1,Math.ceil(bytes.length/64)));
 if(createHash('sha256').update(bytes).digest('hex')!==lock.source)throw Error('Plaza recovery source mismatch.');
 const city=f.project.city,report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:10000,maxHops:6},b);
 if(report.snapshotFingerprint!==lock.source||!['research-eligible','no-eligible-neighbors'].includes(report.status))throw Error('Admitted plaza recovery scope changed.');
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
