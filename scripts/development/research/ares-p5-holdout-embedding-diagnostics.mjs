import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {iterateRoadGraph,classifyRoad} from '../../../src/core/road-graph.js';
import {insideOrOn} from '../../../src/core/boundary.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
import {classifyP5Contact} from './ares-p5-topology-contract.mjs';
const archive=new Map();
for(const job of [140857711740,140857711749,140857711757,140857711761,140857711766,140857711770,140857711771,140857711782]){
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-reform-repair-46105648256-'+job+'.json',import.meta.url),'utf8'));
 if(e.run!==46105648256||e.source!=='908acc432ab4e1a3ccc9356829c89ad74f1e52d4'||e.attempt!==1||e.job!==job)throw Error('Embedding archive identity mismatch.');
 for(const r of e.rows){
  const lock=holdoutLockedRow(r.caseId);
  if(archive.has(r.caseId)||r.source!==lock.source||r.authority!=='none'||r.profile.cap!==8||r.profile.multiplier!==1||JSON.stringify(r.offset)!==JSON.stringify(lock.offset)||r.seeds.length||r.geometrySeeds.length)throw Error('Embedding archive row mismatch.');
  archive.set(r.caseId,riFreeze(r));
 }
}
if(archive.size!==9)throw Error('Incomplete embedding archive.');
export const EMBEDDING_CASES=Object.freeze([...archive.keys()].sort(riCompare));
const same=(a,c)=>a&&c&&Object.is(a.x,c.x)&&Object.is(a.y,c.y);
const sort=(a,b,cmp=riCompare)=>{b.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));return a.sort(cmp);};
const need=(v,msg)=>{if(!v)throw Error(msg);};
function graph(city,b){
 b.spend(city.nodes.length+city.roads.length);const it=iterateRoadGraph(city);let paid=0;
 try{for(;;){const s=it.next();if(s.done){if(s.value.work>paid)b.spend(s.value.work-paid);return s.value;}
 if(s.value.stage==='road-graph-intersections'){b.spend(64);paid+=64;}else b.spend();}}finally{it.return();}
}
// Directed half-edge permutation: a combinatorial embedding, not a city
// face constructor. Invalid/crossing geometry can still yield closed walks;
// do not describe these as valid polygons or infer parcel ownership.
export function embeddingWalks(nodes,roads,b){
 const positions=new Map(nodes.map(n=>[n.id,n])),stars=new Map(nodes.map(n=>[n.id,[]])),darts=new Map();
 b.spend(nodes.length+roads.length);
 for(const r of roads){
  need(positions.has(r.a)&&positions.has(r.b)&&r.a!==r.b,'Invalid embedding edge');
  for(const [from,to] of [[r.a,r.b],[r.b,r.a]]){
   b.spend(8);const id=JSON.stringify([r.id,from]),rev=JSON.stringify([r.id,to]),a=positions.get(from),c=positions.get(to);
   need(!darts.has(id),'Duplicate dart');
   const d={id,rev,road:r.id,from,to,angle:Math.atan2(c.y-a.y,c.x-a.x)};
   darts.set(id,d);stars.get(from).push(d);
  }
 }
 const successor=new Map(),orders=new Map();let ambiguous=0;
 for(const [id,star] of stars){
  sort(star,b,(a,c)=>a.angle-c.angle||riCompare(a.id,c.id));orders.set(id,star.map(d=>d.road));
  for(let i=0;i<star.length;i++){
   b.spend(5);const cur=star[i],prev=star[(i+star.length-1)%star.length];
   if(star.length>1&&Math.abs(Math.atan2(Math.sin(cur.angle-prev.angle),Math.cos(cur.angle-prev.angle)))<=1e-9)ambiguous++;
   successor.set(cur.rev,prev.id);
  }
 }
 const unseen=new Set(darts.keys()),walks=[];
 for(const start of sort([...darts.keys()],b)){
  if(!unseen.has(start))continue;const walk=[];let at=start;
  do{b.spend(4);need(unseen.delete(at)&&darts.has(at)&&successor.has(at),'Broken embedding permutation');walk.push(at);at=successor.get(at);}while(at!==start);
  // start is lexically smallest unseen dart, hence canonical rotation.
  walks.push({key:JSON.stringify(walk),length:walk.length,roads:sort([...new Set(walk.map(x=>darts.get(x).road))],b),nodes:sort([...new Set(walk.map(x=>darts.get(x).from))],b)});
 }
 return {orders,walks,ambiguous,darts:darts.size};
}
function cyclicEqual(a,c,b){b.spend(a.length*2+1);if(a.length!==c.length)return false;if(!a.length)return true;const i=c.indexOf(a[0]);return i>=0&&a.every((v,j)=>v===c[(i+j)%c.length]);}
export function compareEmbedding(a,c,b){
 const old=new Map(a.walks.map(w=>[w.key,w])),next=new Map(c.walks.map(w=>[w.key,w]));
 b.spend(old.size+next.size);
 const removed=a.walks.filter(w=>!next.has(w.key)),added=c.walks.filter(w=>!old.has(w.key));
 const changed=[];for(const [id,order] of a.orders){if(!cyclicEqual(order,c.orders.get(id),b))changed.push({id,before:order,after:c.orders.get(id)});}
 const affectedRoads=sort([...new Set([...removed,...added].flatMap(w=>w.roads))],b);
 return {beforeWalks:a.walks.length,afterWalks:c.walks.length,removed,added,unchanged:a.walks.length-removed.length,changed,affectedRoads,beforeAmbiguous:a.ambiguous,afterAmbiguous:c.ambiguous,darts:a.darts};
}
export async function diagnoseHoldoutEmbedding(caseId){
 const r=archive.get(caseId);if(!r)throw Error('Frozen embedding case required.');
 const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768}),base={caseId,source:r.source,authority:'none',cyclicGate:'required',observations:[]};
 const finish=(status)=>riFreeze({...base,status,stats:b.snapshot()});
 try{
  const lock=holdoutLockedRow(caseId),f=materializeLockedRtreCase(caseId),city=f.project.city,before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');
  b.spend(Math.max(1,Math.ceil(bytes.length/64)));need(createHash('sha256').update(bytes).digest('hex')===lock.source,'Source mismatch');
  const report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:10000,maxHops:6},b);
  need(report.snapshotFingerprint===lock.source&&report.status==='research-eligible','Scope mismatch');
  const g=graph(city,b);need(g.valid,'Invalid source graph');
  const prior=embeddingWalks(city.nodes,city.roads,b),exact=new Map(report.requested.map(x=>[x.ref.id,x.point]));
  const eligible=new Set(report.eligibleJunctions.map(x=>x.ref.id)),admitted=new Map(report.entries.map(x=>[x.ref.collection+':'+x.ref.id,x]));
  const fixed=new Set(city.plaza?.vertices??[]),terminal=new Set(g.terminalRoadIds);
  for(const road of city.roads){b.spend();if(classifyRoad(road).protected||terminal.has(road.id)){fixed.add(road.a);fixed.add(road.b);}}
  for(const gate of city.gates??[]){b.spend();if(gate.connection?.cityNodeId!=null)fixed.add(gate.connection.cityNodeId);}
  for(const kind of ['waterFaces','terrainFaces'])for(const row of city[kind]??[])for(const id of row.vertices??[]){b.spend();fixed.add(id);}
  for(const e of report.entries){b.spend();if(e.ref.collection==='nodes'&&e.role==='protected-anchor')fixed.add(e.ref.id);}
  const nodeKeys=new Set(['id','x','y']),roadKeys=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' ')),known=(row,keys)=>Object.keys(row).every(k=>{b.spend();return keys.has(k);});
  for(const [type,seed] of [['angular',r.bestRotation],['contact',r.best]]){
   if(!seed)continue;
   const positions=new Map(exact),neighbors=new Set();
   need(seed.neighbors.length>=1&&seed.neighbors.length<=8,'Neighbor cap mismatch');
   for(const n of seed.neighbors){
    b.spend(8+city.survey.boundary.length);const old=g.nodesById.get(n.id),p=n.point;
    need(old&&eligible.has(n.id)&&!positions.has(n.id)&&same(n.old,old)&&!same(p,old)&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x-old.x,p.y-old.y)<=Math.hypot(lock.offset.x,lock.offset.y)&&insideOrOn(p,city.survey.boundary),'Archived coordinate mismatch');
    positions.set(n.id,p);neighbors.add(n.id);
   }
   const reached=new Set(),q=[[...neighbors][0]];
   for(const id of q){b.spend();if(reached.has(id))continue;reached.add(id);for(const n of g.adjacency.get(id)){b.spend();if(!reached.has(n)&&positions.has(n))q.push(n);}}
   need([...neighbors].every(id=>reached.has(id)),'Archived cluster mismatch');
   for(const id of positions.keys()){
    b.spend();need(!fixed.has(id)&&admitted.has('nodes:'+id)&&known(g.nodesById.get(id),nodeKeys),'Archived protected node');
    for(const rid of g.incidentRoads.get(id)){b.spend();const road=g.roadsById.get(rid);need(!classifyRoad(road).protected&&!terminal.has(rid)&&admitted.has('roads:'+rid)&&known(road,roadKeys)&&[road.a,road.b].every(v=>admitted.has('nodes:'+v)&&known(g.nodesById.get(v),nodeKeys)),'Archived road closure');}
   }
   const nodes=city.nodes.map(n=>{b.spend();return positions.has(n.id)?{...n,...positions.get(n.id)}:n;});
   const next=embeddingWalks(nodes,city.roads,b),delta=compareEmbedding(prior,next,b);
   if(type==='angular')need(delta.changed.length===seed.count&&JSON.stringify(sort(delta.changed.map(x=>x.id),b))===JSON.stringify(seed.ids),'Archived angular count mismatch');
   else need(delta.changed.length===0,'Contact witness rotation mismatch');
   const cg=graph({...city,nodes},b),at=id=>positions.get(id)??g.nodesById.get(id);
   const contacts=cg.issues.filter(x=>['unnormalized-crossing','overlapping-roads'].includes(x.code)&&x.roadIds?.length===2).map(x=>{
    b.spend(16);const [a,c]=x.roadIds.map(id=>g.roadsById.get(id));
    const kind=classifyP5Contact(at(a.a),at(a.b),at(c.a),at(c.b)).kind;
    const roadOK=road=>admitted.has('roads:'+road.id)&&!classifyRoad(road).protected&&!terminal.has(road.id)&&known(road,roadKeys);
    const endpoints=[...new Set([a.a,a.b,c.a,c.b])].map(id=>({id,moved:positions.has(id),eligible:eligible.has(id),protected:fixed.has(id),admitted:admitted.has('nodes:'+id),opaque:!known(g.nodesById.get(id),nodeKeys)}));
    return {code:x.code,roads:x.roadIds,kind,roadClosure:[a,c].every(roadOK),endpoints};
   });
   base.observations.push({type,neighborCount:neighbors.size,embedding:delta,graphValid:cg.valid,issues:cg.issues,contacts,domainVerification:'not-performed',dependencyStatus:'not-mapped'});
  }
  need(aresReplayJson(f.project,b)===before,'Source mutated');aresReplayJson(base,b);return finish('diagnosed');
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit');throw e;}
}
