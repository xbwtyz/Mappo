import { createSpatialOperation, createSpatialInventory } from './spatial-recovery-contract.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from './road-intent-c1.js';
import { createLareContext } from './reconciliation-context.js';
import { occupiedAreaS10 } from './building-occupancy-s10.js';
import { validateBuildingStructureS10 } from './building-components-s10.js';
import { STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK } from './placement.js';
import { propertyLocalBounds3I } from './property-geometry.js';
import { verifyLareRigidGeometry } from './reconciliation-buildings.js';
import { verifyLarePlotDeformation } from './reconciliation-plots.js';
import { classifyRoadProvenance } from './road-provenance.js';
import { riCompare, riEqual, riFreeze } from './road-impact-model.js';

// Detached concession primitives only. No solver, candidate acceptance,
// geometry permission bypass, runtime wiring or Apply authority.
const sreConcessionEps=1e-6;
const sreConcessionWithout=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
const sreConcessionFinitePoint=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
function sreConcessionDerive(project,input,budget){
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
  return sreConcessionAdjacentFrontages(project,sreConcessionDerive(project,input,budget),propertyId,budget);
}
function sreConcessionAdjacentFrontages(project,{op,context,changed,graph},propertyId,budget){
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
  if(original<0||edges.some(e=>!e.road||!sreConcessionFinitePoint(e.a)||!sreConcessionFinitePoint(e.b)))return Object.freeze([]);
  const out=[edges[(original+edges.length-1)%edges.length],edges[(original+1)%edges.length]]
    .filter(e=>e.road.id!==entry.frontageRoadId&&Math.hypot(e.b.x-e.a.x,e.b.y-e.a.y)>sreConcessionEps)
    .map(e=>e.road.id);
  return Object.freeze([...new Set(out)].sort(riCompare));
}
// Independently infer a single positive similarity from corresponding
// canonical vertices. Caller does not supply the factor, angle or ledger.
// This local check does not authorize changing frontage or access.
export function inspectSpatialUniformSimilarity(project,input,buildingId,candidate,budget){
  return sreConcessionInspectSimilarity(project,sreConcessionDerive(project,input,budget),buildingId,candidate,budget);
}
function sreConcessionInspectSimilarity(project,{op,context,changed},buildingId,candidate,budget){
  if(!op.permissions.uniformScaling)throw Error('Uniform scaling is not permitted.');
  const entry=context.properties.find(p=>p.buildings.some(b=>b.id===buildingId));
  const policy=entry?.buildings.find(b=>b.id===buildingId);
  if(!entry||!changed.has(entry.blockId)||entry.policy.mode!=='adaptive'||
    policy?.mode!=='rigid'||policy.provenance!=='generated')throw Error('Building is not eligible for uniform scaling.');
  const original=project.city.buildings.find(b=>b.id===buildingId);
  const fail=()=>{throw Error('Uniform similarity verification refused.');};
  if(!candidate||!original||![1,3].includes(original.geometry?.version)||
    original.geometry.courtyardAccess||!riEqual(original.components,candidate.components)||
    !candidate.geometry||!riEqual(sreConcessionWithout(original.geometry,['regions']),sreConcessionWithout(candidate.geometry,['regions']))||
    !riEqual(sreConcessionWithout(original,['geometry','orientation','entrance','accessPath','plotIds','roadProvenance','area']),
      sreConcessionWithout(candidate,['geometry','orientation','entrance','accessPath','plotIds','roadProvenance','area'])))fail();
  const a=original.geometry.regions,b=candidate.geometry.regions;
  if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)fail();
  for(let i=0;i<a.length;i++){
    budget.spend();const p=a[i],q=b[i];
    if(!q||!Array.isArray(p.ring)||!Array.isArray(q.ring)||p.ring.length<3||
      p.ring.length!==q.ring.length||!riEqual(sreConcessionWithout(p,['ring']),sreConcessionWithout(q,['ring']))||
      !p.ring.every(sreConcessionFinitePoint)||!q.ring.every(sreConcessionFinitePoint))fail();
  }
  const [p,q]=a[0].ring,[r,s]=b[0].ring;
  const u={x:q.x-p.x,y:q.y-p.y},v={x:s.x-r.x,y:s.y-r.y};
  const len=Math.hypot(u.x,u.y),other=Math.hypot(v.x,v.y),factor=other/len;
  if(len<=sreConcessionEps||!Number.isFinite(factor)||factor<=0||
    factor<1-op.permissions.maxLinearReduction-sreConcessionEps||factor>1+sreConcessionEps)fail();
  const angle=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y),co=Math.cos(angle),si=Math.sin(angle);
  for(let i=0;i<a.length;i++)for(let j=0;j<a[i].ring.length;j++){
    budget.spend();const x=a[i].ring[j].x-p.x,y=a[i].ring[j].y-p.y;
    const z=b[i].ring[j];
    if(Math.hypot(r.x+factor*(x*co-y*si)-z.x,r.y+factor*(x*si+y*co)-z.y)>sreConcessionEps)fail();
  }
  const delta=candidate.orientation-original.orientation-angle;
  if(!Number.isFinite(delta)||Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))>sreConcessionEps)fail();
  const charge={charge:(n=1)=>{if(n>0)budget.spend(n);}};
  validateBuildingStructureS10(candidate.geometry,candidate.components,charge);
  const areaBefore=occupiedAreaS10(original.geometry,charge),areaAfter=occupiedAreaS10(candidate.geometry,charge);
  if(!Number.isFinite(candidate.area)||!Number.isFinite(original.area)||original.area<=0||candidate.area<=0||
    Math.abs(areaAfter-areaBefore*factor*factor)>sreConcessionEps*Math.max(1,areaBefore)||
    Math.abs(candidate.area-original.area*factor*factor)>sreConcessionEps*Math.max(1,original.area))fail();
  return riFreeze({buildingId,factor,angle,footprintLoss:Math.max(0,areaBefore-areaAfter)});
}

// Independently sreConcessionDerive a candidate-wide concession inventory. This is a
// partial gate: the ordinary road intent, exact metadata, geometry fit,
// dependencies, access and stored-project gates still MUST be run. Never
// treat the ledger, even if empty, as acceptance or Apply authority.
export function inspectSpatialConcessionLedger(project,input,candidate,budget){
  const derived=sreConcessionDerive(project,input,budget),{op,context,changed}=derived;
  if(candidate?.schemaVersion!==project.schemaVersion||
    (candidate.id??candidate.city?.id)!==op.projectId||
    !riEqual(project.identityAllocation,candidate.identityAllocation))
    throw Error('Concession candidate identity or allocation changed.');
  const indexes=(city)=>{
    const result={};
    for(const collection of ['properties','plots','buildings']){
      const map=new Map();
      for(const row of city[collection]){
        budget.spend();
        if(map.has(row.id))throw Error('Duplicate concession candidate identity.');
        map.set(row.id,row);
      }
      result[collection]=map;
    }
    return result;
  };
  const old=indexes(project.city),next=indexes(candidate.city);
  for(const key of Object.keys(old))
    if(!riEqual([...old[key].keys()],[...next[key].keys()]))
      throw Error('Concession candidate membership changed.');
  const scope=new Map(context.properties.map(p=>[p.id,p])),frontageSwitches=[],scaledBuildings=[];
  const switched=new Set();
  for(const [id,a] of old.properties){
    budget.spend();const b=next.properties.get(id),entry=scope.get(id);
    if(!riEqual(a.plotIds,b.plotIds)||!riEqual(a.buildingIds,b.buildingIds)||a.blockId!==b.blockId||
      a.districtId!==b.districtId)throw Error('Concession property ownership changed.');
    if(a.frontageRoadId===b.frontageRoadId)continue;
    if(!sreConcessionAdjacentFrontages(project,derived,id,budget).includes(b.frontageRoadId))
      throw Error('Unauthorized alternative frontage.');
    const ap=a.plotIds.map(pid=>old.plots.get(pid)),bp=b.plotIds.map(pid=>next.plots.get(pid));
    if(!entry||ap.some(p=>!p||p.propertyId!==id||p.frontageRoadId!==a.frontageRoadId)||
      bp.some(p=>!p||p.propertyId!==id||p.frontageRoadId!==b.frontageRoadId)||
      b.buildingIds.some(bid=>old.buildings.get(bid)?.frontageRoadId!==a.frontageRoadId||
        next.buildings.get(bid)?.frontageRoadId!==b.frontageRoadId))
      throw Error('Concession frontage references are inconsistent.');
    if(classifyRoadProvenance(b,bp)!=='generated')throw Error('Concession property provenance changed.');
    verifyLarePlotDeformation(b.boundary,ap,bp,budget);
    switched.add(id);frontageSwitches.push({propertyId:id,from:a.frontageRoadId,to:b.frontageRoadId});
  }
  for(const [id,a] of old.plots){
    budget.spend();const b=next.plots.get(id),parent=next.properties.get(a.propertyId);
    if(!parent||!parent.plotIds.includes(id)||a.propertyId!==b.propertyId||a.blockId!==b.blockId)
      throw Error('Concession plot ownership changed.');
    if(a.frontageRoadId!==b.frontageRoadId&&(!switched.has(a.propertyId)||b.frontageRoadId!==parent.frontageRoadId))
      throw Error('Unauthorized plot frontage change.');
  }
  for(const [id,a] of old.buildings){
    budget.spend();const b=next.buildings.get(id),parent=next.properties.get(a.propertyId);
    if(!parent||!parent.buildingIds.includes(id)||a.propertyId!==b.propertyId||a.blockId!==b.blockId||
      a.districtId!==b.districtId||!Array.isArray(b.plotIds)||!b.plotIds.length||
      new Set(b.plotIds).size!==b.plotIds.length||b.plotIds.some(pid=>!parent.plotIds.includes(pid)))
      throw Error('Concession building ownership changed.');
    const changedFrontage=a.frontageRoadId!==b.frontageRoadId;
    if(changedFrontage&&(!switched.has(a.propertyId)||b.frontageRoadId!==parent.frontageRoadId))
      throw Error('Unauthorized building frontage change.');
    const entry=scope.get(a.propertyId),policy=entry?.buildings.find(row=>row.id===id);
    const moved=!riEqual(a.geometry,b.geometry)||a.orientation!==b.orientation||a.area!==b.area;
    if(!moved&&!changedFrontage)continue;
    if(!entry||!changed.has(entry.blockId)||entry.policy.mode!=='adaptive'||
      policy?.mode!=='rigid'||policy.provenance!=='generated'||classifyRoadProvenance(b)!=='generated')
      throw Error('Concession building is protected or outside changed scope.');
    // Frontage was checked independently above. Normalize that single
    // verified reference for the existing rigid/similarity comparison.
    // Do not rewrite the candidate or normalize any other metadata.
    const normalized=changedFrontage?{...b,frontageRoadId:a.frontageRoadId}:b;
    if(verifyLareRigidGeometry(a,normalized,budget))continue;
    const result=sreConcessionInspectSimilarity(project,derived,id,normalized,budget);
    if(result.factor>=1-sreConcessionEps)throw Error('Non-rigid geometry sreConcessionWithout positive footprint reduction.');
    scaledBuildings.push(result);
  }
  frontageSwitches.sort((a,b)=>riCompare(a.propertyId,b.propertyId));
  scaledBuildings.sort((a,b)=>riCompare(a.buildingId,b.buildingId));
  return riFreeze({frontageSwitches,scaledBuildings,
    footprintLoss:scaledBuildings.reduce((sum,row)=>sum+row.footprintLoss,0)});
}

// Verify geometry of each independently identified switched street frontage.
// This is in addition to, not instead of, whole-project and access checks.
export function verifySpatialFrontageAlignment(project,input,candidate,ledger,budget){
  const {changed,graph}=sreConcessionDerive(project,input,budget);
  const properties=new Map(candidate.city.properties.map(p=>[p.id,p]));
  const originals=new Map(project.city.properties.map(p=>[p.id,p]));
  const roads=new Map(project.city.roads.map(r=>[r.id,r]));
  budget.spend(properties.size+originals.size+roads.size);
  const near=(a,b)=>sreConcessionFinitePoint(a)&&sreConcessionFinitePoint(b)&&Math.hypot(a.x-b.x,a.y-b.y)<=1e-5;
  for(const row of ledger.frontageSwitches){
    budget.spend();const old=originals.get(row.propertyId),p=properties.get(row.propertyId);
    if(!old||!p||p.frontageRoadId!==row.to||old.frontageRoadId!==row.from)
      throw Error('Concession frontage witness mismatch.');
    const block=changed.get(old.blockId),road=roads.get(row.to);
    if(!block||!road||road.waterBoundary||road.terrainBoundary||!Number.isFinite(STREET_WIDTHS[road.kind]))
      throw Error('Concession frontage is not a usable street.');
    const index=block.vertices.findIndex((v,i)=>[road.a,road.b].includes(v)&&
      [road.a,road.b].includes(block.vertices[(i+1)%block.vertices.length]));
    if(index<0)throw Error('Concession frontage is outside the block.');
    const a=graph.nodesById.get(block.vertices[index]),b=graph.nodesById.get(block.vertices[(index+1)%block.vertices.length]);
    const length=Math.hypot(b.x-a.x,b.y-a.y),tangent={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
    const inward={x:-tangent.y,y:tangent.x};
    if(!Number.isFinite(length)||length<=sreConcessionEps||!p.frame||!near(p.frame.origin,a)||
      !near(p.frame.tangent,tangent)||!near(p.frame.inward,inward)||
      !Array.isArray(p.frontage)||p.frontage.length!==2||!near(p.frontage[0],p.boundary[0])||
      !near(p.frontage[1],p.boundary[1]))throw Error('Concession frontage frame or edge mismatch.');
    const uv=q=>({u:(q.x-a.x)*tangent.x+(q.y-a.y)*tangent.y,v:(q.x-a.x)*inward.x+(q.y-a.y)*inward.y});
    const l=uv(p.frontage[0]),r=uv(p.frontage[1]);
    const width=Math.hypot(old.boundary[1].x-old.boundary[0].x,old.boundary[1].y-old.boundary[0].y);
    const setback=(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
    if(![l.u,l.v,r.u,r.v,width].every(Number.isFinite)||l.u< -sreConcessionEps||r.u>length+sreConcessionEps||
      r.u-l.u<Math.min(7,width)-sreConcessionEps||Math.abs(l.v-r.v)>1e-5||l.v<setback-sreConcessionEps)
      throw Error('Concession frontage alignment or setback refused.');
    const local=propertyLocalBounds3I(p,p.boundary);
    if(!p.local||Object.keys(local).some(k=>!Number.isFinite(p.local[k])||Math.abs(local[k]-p.local[k])>1e-5))
      throw Error('Concession frontage local bounds mismatch.');
  }
}
