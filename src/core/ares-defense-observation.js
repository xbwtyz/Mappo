import { createAresDependencyObservation } from './ares-dependency-observation.js';
import { createAresConstraintQueryService, matchesAresConstraintQuery } from './ares-constraint-query.js';
import { makeAresRoadConstraintQuery } from './ares-landscape-observation.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { solidWallSegments, measureWall, WALL_EDGE_WIDTH } from './fortification-geometry.js';
import { gatePosts } from './gate-geometry.js';
import { segmentDistance, STREET_WIDTHS, STREET_EDGE_WIDTH } from './placement.js';
import { distanceToSegment } from './boundary.js';
import { riFreeze, riCompare } from './road-impact-model.js';

// Detached road-impact clearance evidence; no fortification authoring,
// permission escalation, new crossings or replacement of domain validators.
export const ARES_DEFENSE_VERSION=1;
const descriptor={id:'ares-defense',version:1,capabilities:['road-defense-clearance-2d']};
const ref=(collection,id)=>createSpatialRef({collection,id});
const byId=(a,b)=>riCompare(a.id,b.id);
const key=spatialRefKey;
function finite(p){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw Error('Invalid defense geometry.');return {x:p.x,y:p.y};}
function dimension(n){if(!Number.isFinite(n)||n<0)throw Error('Invalid defense dimension.');return n;}
function defenseData(city,budget){
  const walls=new Map(),obstacles=[],anchors=[];
  const gates=[...(city.gates??[])].sort(byId);
  for(const wall of [...(city.walls??[])].sort(byId)){
    const n=wall.path.length,cutCount=2*gates.length+(wall.waterOpenings?.length??0)+(wall.terrainOpenings?.length??0);
    // Bound existing wall section construction (including arc searches).
    budget.spend(Math.max(1,4*(n+1)*(n+cutCount+1)));
    const wallRef=ref('walls',wall.id),measure=measureWall(wall.path);
    const sections=solidWallSegments(wall,gates).map(s=>({a:finite(s.a),b:finite(s.b)}));
    walls.set(wall.id,{ref:wallRef,measure});
    obstacles.push({ref:wallRef,owner:null,code:'wall-clearance',
      radius:(dimension(wall.width)+dimension(wall.edgeWidth??WALL_EDGE_WIDTH))/2+.5,sections});
  }
  for(const tower of [...(city.towers??[])].sort(byId)){
    budget.spend();
    const owner=walls.get(tower.wallId);if(!owner)throw Error('Missing defense wall owner.');
    const p=finite(tower.center);
    obstacles.push({ref:ref('towers',tower.id),owner:owner.ref,code:'tower-clearance',
      radius:dimension(tower.radius)+.5,sections:[{a:p,b:p}]});
  }
  for(const gate of gates){
    budget.spend();
    const owner=walls.get(gate.wallId);if(!owner)throw Error('Missing defense gate wall.');
    budget.spend(Math.max(1,owner.measure.path.length*2));
    const gateRef=ref('gates',gate.id);
    const sections=gatePosts(gate,owner.measure).map(p=>{const q=finite(p);return {a:q,b:q};});
    obstacles.push({ref:gateRef,owner:owner.ref,code:'gate-clearance',radius:dimension(gate.postRadius),sections});
    anchors.push({ref:gateRef,wallRef:owner.ref,nodeRef:ref('nodes',gate.connection?.cityNodeId),
      point:finite(gate.connection?.points?.[0])});
  }
  obstacles.sort((a,b)=>riCompare(key(a.ref),key(b.ref)));
  return riFreeze({obstacles,anchors});
}
function defenseBroad(bounds,section,required){
  return Math.max(section.a.x,section.b.x)+required>=bounds.x.min&&
    Math.min(section.a.x,section.b.x)-required<=bounds.x.max&&
    Math.max(section.a.y,section.b.y)+required>=bounds.y.min&&
    Math.min(section.a.y,section.b.y)-required<=bounds.y.max;
}
function defenseQuery(observation,road,phase){
  return {...makeAresRoadConstraintQuery(observation.context,observation.snapshotFingerprint,road,phase),
    capability:descriptor.capabilities[0]};
}
function defenseEvaluate(data,road,halfWidth,query,spend){
  const rows=[],measurements=[];
  const row=(id,kind,outcome,refs,anchorRefs,detail)=>({id,ruleVersion:'1',kind,outcome,refs,anchorRefs,detail});
  const distanceTo=(section,a,b)=>section.a.x===section.b.x&&section.a.y===section.b.y
    ?distanceToSegment(section.a,a,b):segmentDistance(section.a,section.b,a,b);
  const {a,b}=road.proposed;
  for(const [i,o] of data.obstacles.entries()){
    spend();
    const required=halfWidth+o.radius,refs=[road.ref,o.ref,...(o.owner?[o.owner]:[])];
    if(query.phase==='swept'){
      let possible=false;
      for(const section of o.sections){spend();if(defenseBroad(query.bounds,section,required))possible=true;}
      if(possible)rows.push(row('swept-defense-'+i,'hard-domain','unknown',refs,[],
        'Swept envelope may overlap the existing defense clearance; exact swept contact is unresolved.'));
      continue;
    }
    let nearest=Infinity,old=Infinity;
    for(const section of o.sections){
      spend();nearest=Math.min(nearest,distanceTo(section,a,b));
      old=Math.min(old,distanceTo(section,road.old.a,road.old.b));
    }
    if(nearest>=required)continue;
    const id=o.code+'-'+i;
    rows.push(row(id,'hard-domain','violated',refs,[],'Proposed street conflicts with existing '+o.code+'.'));
    measurements.push({rowId:id,code:o.code,refs,unit:'map-unit',newDistance:nearest,oldDistance:old,
      requiredDistance:required,oldRequiredDistance:required});
  }
  if(query.phase==='final')for(const [i,anchor] of data.anchors.entries()){
    spend();
    const side=road.endpointRefs.findIndex(r=>key(r)===key(anchor.nodeRef));
    if(side<0)continue;
    const p=side===0?a:b,prior=side===0?road.old.a:road.old.b;
    const distance=Math.hypot(p.x-anchor.point.x,p.y-anchor.point.y);
    if(distance<=1e-6)continue;
    const id='gate-connection-'+i,refs=[road.ref,anchor.ref,anchor.wallRef];
    rows.push(row(id,'protection','violated',refs,[anchor.nodeRef],'Existing gate approach is detached from its accepted city junction.'));
    measurements.push({rowId:id,code:'gate-connection',refs:[...refs,anchor.nodeRef],unit:'map-unit',
      newDistance:distance,oldDistance:Math.hypot(prior.x-anchor.point.x,prior.y-anchor.point.y),
      requiredDistance:1e-6,oldRequiredDistance:1e-6});
  }
  if(!rows.length)rows.push(row('defense-clear','hard-domain','satisfied',[road.ref],[],
    'No existing defense clearance conflict observed in this query.'));
  return {rows,measurements};
}
// Capture one exact persisted snapshot before any await. Provider only
// reads derived immutable geometry; no editable accepted records escape.
export async function discoverAresDefense(project,context,budget){
  if(typeof budget?.spend!=='function')throw Error('Shared ARES defense budget required.');
  const snapshot=JSON.parse(aresReplayJson(project,budget));
  const observation=await createAresDependencyObservation(snapshot,context,budget);
  const data=defenseData(snapshot.city,budget);
  const roads=new Map();
  for(const r of snapshot.city.roads){budget.spend();roads.set(r.id,r);}
  const changed=new Map(observation.discovery.changedRoads.map(r=>[r.ref.id,r])),evidence=[];
  let measured;
  const service=createAresConstraintQueryService([{descriptor,evaluate(query,spend){
    const road=changed.get(query.refs[0]?.id);
    if(!road||!matchesAresConstraintQuery({version:1,query},defenseQuery(observation,road,query.phase)))
      throw Error('Stale or unsupported defense query.');
    const half=(dimension(STREET_WIDTHS[roads.get(road.ref.id)?.kind])+STREET_EDGE_WIDTH)/2;
    const result=defenseEvaluate(data,road,half,query,spend);
    measured=result.measurements;return result.rows;
  }}]);
  for(const road of observation.discovery.changedRoads)for(const phase of ['swept','final']){
    budget.spend();measured=null;
    const result=service.query(descriptor.id,defenseQuery(observation,road,phase),budget);
    evidence.push({constraint:result,measurements:measured});
  }
  return riFreeze({version:ARES_DEFENSE_VERSION,context:observation.context,snapshotFingerprint:observation.snapshotFingerprint,
    status:observation.status,providers:service.descriptors(),anchors:data.anchors,evidence,
    diagnostics:observation.discovery.diagnostics});
}
