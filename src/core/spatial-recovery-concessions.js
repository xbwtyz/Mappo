import { createSpatialOperation, createSpatialInventory } from './spatial-recovery-contract.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from './road-intent-c1.js';
import { createLareContext } from './reconciliation-context.js';
import { occupiedAreaS10 } from './building-occupancy-s10.js';
import { validateBuildingStructureS10 } from './building-components-s10.js';
import { riCompare, riEqual, riFreeze } from './road-impact-model.js';

// Detached concession primitives only. No solver, candidate acceptance,
// geometry permission bypass, runtime wiring or Apply authority.
const eps=1e-6;
const without=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
const finitePoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
function derive(project,input,budget){
  const op=createSpatialOperation(input);
  if(op.family!=='road'||op.operation!=='translate-road-group'||!op.geometry||
    op.editedRefs.some(r=>r.collection!=='roads')||op.permissions.destruction||op.permissions.regeneration)
    throw Error('Unsupported detached nondestructive concession intent.');
  createSpatialInventory(project,op,budget);
  const draft=prepareRoadGroupIntentB1(project,op.editedRefs.map(r=>r.id),op.geometry.offset);
  const topology=readRoadGroupTopologyB1(project,draft),identity=topology?.identity;
  if(!identity?.valid||identity.requiresReview||identity.issues.length||
    identity.added.length||identity.removed.length||identity.split.length||identity.merged.length||identity.ambiguous.length)
    throw Error('Unsupported concession topology.');
  const context=createLareContext(project,draft,new Map(),budget);
  const changed=new Map(identity.changed.filter(f=>f.kind==='block').map(f=>[f.id,f.record]));
  return {op,context,changed,graph:topology.graph};
}
// Only possible adjacent same-block frontage IDs, not a geometry witness.
// The future full verifier must also prove authorized scope, fit, plot
// topology, reciprocal references, generated provenance and access.
export function listSpatialAdjacentFrontages(project,input,propertyId,budget){
  const {op,context,changed,graph}=derive(project,input,budget);
  if(!op.permissions.alternativeFrontage)return Object.freeze([]);
  const entry=context.properties.find(p=>p.id===propertyId);
  if(!entry||entry.policy.mode!=='adaptive'||entry.policy.provenance!=='generated'||
    entry.buildings.some(b=>b.mode!=='rigid'||b.provenance!=='generated'))return Object.freeze([]);
  const block=changed.get(entry.blockId);
  if(!block)return Object.freeze([]);
  const roads=new Map();
  for(const r of project.city.roads){budget.spend();roads.set([r.a,r.b].sort(riCompare).join(':'),r);}
  const edges=block.vertices.map((id,i)=>{
    budget.spend();const other=block.vertices[(i+1)%block.vertices.length];
    return {road:roads.get([id,other].sort(riCompare).join(':')),a:graph.nodesById.get(id),b:graph.nodesById.get(other)};
  });
  const original=edges.findIndex(e=>e.road?.id===entry.frontageRoadId);
  if(original<0||edges.some(e=>!e.road||!finitePoint(e.a)||!finitePoint(e.b)))return Object.freeze([]);
  const out=[edges[(original+edges.length-1)%edges.length],edges[(original+1)%edges.length]]
    .filter(e=>e.road.id!==entry.frontageRoadId&&Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y)>eps)
    .map(e=>e.road.id);
  return Object.freeze([...new Set(out)].sort(riCompare));
}
// Independently infer a single positive similarity from corresponding
// canonical vertices. Caller does not supply the factor, angle or ledger.
// This local check does not authorize changing frontage or access.
export function inspectSpatialUniformSimilarity(project,input,buildingId,candidate,budget){
  const {op,context,changed}=derive(project,input,budget);
  if(!op.permissions.uniformScaling)throw Error('Uniform scaling is not permitted.');
  const entry=context.properties.find(p=>p.buildings.some(b=>b.id===buildingId));
  const policy=entry?.buildings.find(b=>b.id===buildingId);
  if(!entry||!changed.has(entry.blockId)||entry.policy.mode!=='adaptive'||
    policy?.mode!=='rigid'||policy.provenance!=='generated')throw Error('Building is not eligible for uniform scaling.');
  const original=project.city.buildings.find(b=>b.id===buildingId);
  const fail=()=>{throw Error('Uniform similarity verification refused.');};
  if(!candidate||!original||![1,3].includes(original.geometry?.version)||
    original.geometry.courtyardAccess||!riEqual(original.components,candidate.components)||
    !candidate.geometry||!riEqual(without(original.geometry,['regions']),without(candidate.geometry,['regions']))||
    !riEqual(without(original,['geometry','orientation','entrance','accessPath','plotIds','roadProvenance','area']),
      without(candidate,['geometry','orientation','entrance','accessPath','plotIds','roadProvenance','area'])))fail();
  const a=original.geometry.regions,b=candidate.geometry.regions;
  if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)fail();
  for(let i=0;i<a.length;i++){
    budget.spend();const p=a[i],q=b[i];
    if(!q||!Array.isArray(p.ring)||!Array.isArray(q.ring)||p.ring.length<3||
      p.ring.length!==q.ring.length||!riEqual(without(p,['ring']),without(q,['ring']))||
      !p.ring.every(finitePoint)||!q.ring.every(finitePoint))fail();
  }
  const [p,q]=a[0].ring,[r,s]=b[0].ring;
  const u={x:q.x-p.x,y:q.y-p.y},v={x:s.x-r.x,y:s.y-r.y};
  const len=Math.hypot(u.x,u.y),other=Math.hypot(v.x,v.y),factor=other/len;
  if(len<=eps||!Number.isFinite(factor)||factor<=0||
    factor<1-op.permissions.maxLinearReduction-eps||factor>1+eps)fail();
  const angle=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y),co=Math.cos(angle),si=Math.sin(angle);
  for(let i=0;i<a.length;i++)for(let j=0;j<a[i].ring.length;j++){
    budget.spend();const x=a[i].ring[j].x-p.x,y=a[i].ring[j].y-p.y;
    const z=b[i].ring[j];
    if(Math.hypot(r.x+factor*(x*co-y*si)-z.x,r.y+factor*(x*si+y*co)-z.y)>eps)fail();
  }
  const delta=candidate.orientation-original.orientation-angle;
  if(!Number.isFinite(delta)||Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))>eps)fail();
  const charge={charge:(n=1)=>{if(n>0)budget.spend(n);}};
  validateBuildingStructureS10(candidate.geometry,candidate.components,charge);
  const areaBefore=occupiedAreaS10(original.geometry,charge),areaAfter=occupiedAreaS10(candidate.geometry,charge);
  if(!Number.isFinite(candidate.area)||!Number.isFinite(original.area)||original.area<=0||candidate.area<=0||
    Math.abs(areaAfter-areaBefore*factor*factor)>eps*Math.max(1,areaBefore)||
    Math.abs(candidate.area-original.area*factor*factor)>eps*Math.max(1,original.area))fail();
  return riFreeze({buildingId,factor,angle,footprintLoss:Math.max(0,areaBefore-areaAfter)});
}
