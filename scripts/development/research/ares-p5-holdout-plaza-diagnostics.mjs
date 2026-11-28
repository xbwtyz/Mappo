import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HOLDOUT_MANIFEST} from './ares-p5-holdout-inventory.mjs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {iterateRoadGraph,classifyRoad} from '../../../src/core/road-graph.js';
import {insideOrOn,distanceToSegment} from '../../../src/core/boundary.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';
const archive=new Map();
for(const job of [140838411129,140838411150,140838411151,140838411152,140838411153,140838411154,140838411165,140838411171,140838411196,140838411198,140838411202,140838411204,140838411217,140838411336,140838411365,140838411437]){
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-constraints-46099461897-'+job+'.json',import.meta.url),'utf8'));
 if(e.run!==46099461897||e.attempt!==1||e.source!=='2706daaec197228defc68cbf352b588546cac47f'||e.job!==job)throw Error('Plaza archive identity mismatch.');
 for(const r of e.rows){const lock=holdoutLockedRow(r.caseId);if(archive.has(r.caseId)||r.source!==lock.source||r.authority!=='none'||r.category!=='diagnosed'||r.morphology!==lock.options.morphology||JSON.stringify(r.offset)!==JSON.stringify(lock.offset))throw Error('Plaza archive row mismatch.');archive.set(r.caseId,riFreeze(r));}
}
if(archive.size!==100)throw Error('Incomplete plaza study archive.');
export const PLAZA_CASES=Object.freeze(HOLDOUT_MANIFEST.rows.map(x=>'h:'+x.id));
const extraVerified=new Set(['h:radial-24','h:linear-09','h:radial-16']);
const ordered=s=>[...s].sort(riCompare);
function graph(city,b){
 b.spend(city.nodes.length+city.roads.length);const it=iterateRoadGraph(city);let paid=0;
 try{for(;;){const s=it.next();if(s.done){if(s.value.work>paid)b.spend(s.value.work-paid);return s.value;}if(s.value.stage==='road-graph-intersections'){b.spend(64);paid+=64;}else b.spend();}}finally{it.return();}
}
// Attribute all applicable causes, not just the generic protected-road flag.
// A plaza-adjacent ordinary road is distinct from a protected plaza edge.
export function plazaAnchorReasons(city,g,b){
 const reasons=new Map(),plaza=new Set(city.plaza?.vertices??[]),terminal=new Set(g.terminalRoadIds);
 const add=(id,reason)=>{b.spend();if(!g.nodesById.has(id))throw Error('Missing fixed anchor');if(!reasons.has(id))reasons.set(id,new Set());reasons.get(id).add(reason);};
 for(const id of plaza)add(id,'plaza-vertex');
 for(const road of city.roads){
  b.spend();const c=classifyRoad(road);
  for(const reason of c.reasons){add(road.a,'road:'+reason);add(road.b,'road:'+reason);}
  if(terminal.has(road.id)){add(road.a,'terminal-corridor');add(road.b,'terminal-corridor');}
 }
 for(const gate of city.gates??[]){b.spend();if(gate.connection?.cityNodeId!=null)add(gate.connection.cityNodeId,'gate-approach');}
 for(const [kind,reason] of [['waterFaces','water-face'],['terrainFaces','terrain-face']])for(const face of city[kind]??[])for(const id of face.vertices??[])add(id,reason);
 return {reasons,plaza};
}
const plazaRelated=reasons=>reasons.includes('plaza-vertex')||reasons.includes('road:plaza');
function hopsFromPlaza(g,plaza,b){
 const q=ordered(plaza),dist=new Map(q.map(id=>[id,0]));
 for(const id of q){b.spend();for(const v of g.adjacency.get(id)){b.spend();if(!dist.has(v)){dist.set(v,dist.get(id)+1);q.push(v);}}}
 return dist;
}
function nearestDistance(p,polygon,b){
 if(polygon.length<3)return null;b.spend(polygon.length);
 if(insideOrOn(p,polygon))return 0;
 let d=Infinity;for(let i=0;i<polygon.length;i++){b.spend(4);d=Math.min(d,distanceToSegment(p,polygon[i],polygon[(i+1)%polygon.length]));}return d;
}
function boundsDiagonal(points,b){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const p of points){b.spend(4);minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
 return Math.hypot(maxX-minX,maxY-minY);
}
export function describePlazaContact(roadIds,g,anchorReasons,b){
 const roads=roadIds.map(id=>{b.spend();const road=g.roadsById.get(id);if(!road)throw Error('Missing contact road');return road;});
 const endpoints=ordered(new Set(roads.flatMap(r=>[r.a,r.b]))).map(id=>({id,reasons:ordered(anchorReasons.get(id)??[])}));
 return {roadIds,plazaEdge:roads.some(r=>r.plaza===true),plazaAnchor:endpoints.some(x=>plazaRelated(x.reasons)),protectedEndpoints:endpoints.filter(x=>x.reasons.length),ordinaryAttachedRoads:roads.filter(r=>!classifyRoad(r).protected&&[r.a,r.b].some(id=>plazaRelated(ordered(anchorReasons.get(id)??[])))).map(r=>r.id)};
}
export async function diagnoseHoldoutPlaza(caseId){
 const row=archive.get(caseId);if(!row)throw Error('Frozen plaza case required.');
 const lock=holdoutLockedRow(caseId),b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
 const base={caseId,source:lock.source,morphology:lock.options.morphology,size:lock.options.size,group:lock.group,offset:lock.offset,authority:'none',originalOutcome:row.hybridCategory,expandedOutcome:row.hybridCategory==='preflight-refused'?'boundary-refused':row.hybridCategory==='baseline-valid'||row.hybridCategory==='geometry-recovered'||extraVerified.has(caseId)?'verified':'unresolved'};
 const finish=status=>riFreeze({...base,status,stats:b.snapshot()});
 try{
  const f=materializeLockedRtreCase(caseId),before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');b.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(createHash('sha256').update(bytes).digest('hex')!==lock.source)throw Error('Plaza source mismatch.');
  const city=f.project.city,g=graph(city,b);if(!g.valid)throw Error('Invalid plaza source graph');
  const {reasons,plaza}=plazaAnchorReasons(city,g,b),polygon=(city.plaza?.vertices??[]).map(id=>g.nodesById.get(id)),hops=hopsFromPlaza(g,plaza,b),scale=boundsDiagonal(city.survey.boundary,b);
  if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid plaza distance scale.');
  const selected=new Set(),affectedRoads=new Set();
  for(const id of lock.selectedRoadIds){b.spend();const r=g.roadsById.get(id);selected.add(r.a);selected.add(r.b);}
  for(const id of selected)for(const rid of g.incidentRoads.get(id)){b.spend();affectedRoads.add(rid);}
  const distances=ordered(selected).map(id=>{
   const p=g.nodesById.get(id),target={x:p.x+lock.offset.x,y:p.y+lock.offset.y},d=nearestDistance(p,polygon,b),t=nearestDistance(target,polygon,b);
   return {id,distance:d,normalizedDistance:d===null?null:d/scale,targetDistance:t,hops:hops.get(id)??null,reasons:ordered(reasons.get(id)??[])};
  });
  const values=distances.map(x=>x.distance).filter(x=>x!==null),hopValues=distances.map(x=>x.hops).filter(x=>x!==null),targetValues=distances.map(x=>x.targetDistance).filter(x=>x!==null);
  base.plaza={present:polygon.length>=3,vertices:polygon.length,scale,selectedCount:selected.size,selectedDistances:distances,minDistance:values.length?Math.min(...values):null,meanDistance:values.length?values.reduce((a,c)=>a+c,0)/values.length:null,minNormalized:values.length?Math.min(...values)/scale:null,minTargetDistance:targetValues.length?Math.min(...targetValues):null,minHops:hopValues.length?Math.min(...hopValues):null,affectedRoads:affectedRoads.size,affectedAttached:[...affectedRoads].filter(id=>{b.spend();const r=g.roadsById.get(id);return [r.a,r.b].some(n=>plazaRelated(ordered(reasons.get(n)??[])));}).length};
  const pairs=(row.constraints?.pairs??[]).map(p=>({...describePlazaContact(p.roadIds,g,reasons,b),status:p.status,kind:p.kind,exclusions:p.endpointExclusions}));
  const blocked=pairs.filter(p=>p.status==='blocked'),plazaBlocked=blocked.filter(p=>p.plazaAnchor),otherBlocked=blocked.filter(p=>!p.plazaAnchor&&p.protectedEndpoints.length);
  base.contacts={total:pairs.length,blocked:blocked.length,plazaBlocked:plazaBlocked.length,plazaEdgeBlocked:blocked.filter(p=>p.plazaEdge).length,ordinaryAttachedBlocked:blocked.filter(p=>p.ordinaryAttachedRoads.length>0).length,otherProtectedBlocked:otherBlocked.length,plazaExcludedEndpoints:ordered(new Set(plazaBlocked.flatMap(p=>p.protectedEndpoints.filter(n=>plazaRelated(n.reasons)).map(n=>n.id)))),pairs};
  // Independently identify the anchors from the actual frozen source,
  // including the newest Radial-12 blocker; no guessed ID semantics.
  const focus=caseId==='h:radial-12'?{anchors:['N-0108','N-0109'],pairs:[['RD-0278','RD-0286']]}:caseId==='h:radial-16'?{anchors:['N-0089'],pairs:[['RD-0099','RD-0221']]}:null;
  if(focus)base.focus={anchors:focus.anchors.map(id=>{
   const n=g.nodesById.get(id);if(!n)throw Error('Focus anchor missing.');
   return {id,plazaVertex:plaza.has(id),reasons:ordered(reasons.get(id)??[]),distance:nearestDistance(n,polygon,b),hops:hops.get(id)??null,incidentRoads:[...g.incidentRoads.get(id)].map(rid=>{b.spend();const road=g.roadsById.get(rid);return {id:rid,kind:road.kind,reasons:classifyRoad(road).reasons};})};
  }),pairs:focus.pairs.map(ids=>describePlazaContact(ids,g,reasons,b))};
  if(aresReplayJson(f.project,b)!==before)throw Error('Plaza source mutated.');
  aresReplayJson(base,b);return finish('diagnosed');
 }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit');throw e;}
}
