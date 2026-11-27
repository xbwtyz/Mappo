import { observeAresRtreGeometry } from './ares-rtre-geometry.js';
import { createAresDiagnostic } from './ares-diagnostic-contract.js';
import { createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { classifyRoadProvenance } from './road-provenance.js';
import { classifyRoad } from './road-graph.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { hydrateProjectS10 } from './building-project-s10.js';
import { riCompare, riFreeze } from './road-impact-model.js';

// P4-B1: observation ONLY. Existing road/node records lack authoritative
// authorship history. Even a matching generator stamp is not permission.
export const ARES_RTRE_NEIGHBORHOOD_VERSION=1;
const ref=(collection,id)=>createSpatialRef({collection,id});
const key=spatialRefKey;
const ordered=(a,b)=>riCompare(key(a),key(b));
function limitsOf(value){
  if(!value||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==2||
    !['maxObjects','maxHops'].every(k=>Object.hasOwn(value,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))||
    !Number.isSafeInteger(value.maxObjects)||value.maxObjects<1||
    !Number.isSafeInteger(value.maxHops)||value.maxHops<0)
    throw Error('Explicit bounded RTRE observation limits required.');
  return {maxObjects:value.maxObjects,maxHops:value.maxHops};
}
function evidence(context,reason,code,message,refs){
  return createAresDiagnostic(context,{reason,code,stage:'rtre-neighborhood-observation',message,refs,
    source:{id:'ares-rtre-neighborhood',version:'1'}});
}
export async function observeAresRtreNeighborhood(project,context,options,limitsInput,budget){
  const limits=limitsOf(limitsInput);
  // Recompute trusted geometry observation against the same detached source;
  // never accept caller-provided blocker lists or authority claims.
  const source=hydrateProjectS10(JSON.parse(aresReplayJson(project,budget)));
  const geometry=await observeAresRtreGeometry(source,context,options,budget);
  const result={version:ARES_RTRE_NEIGHBORHOOD_VERSION,context:geometry.context,mode:geometry.mode,
    snapshotFingerprint:geometry.snapshotFingerprint,limits,status:'selection-refused',roots:[],
    entries:[],omittedRefs:[],writableRefs:[],diagnostics:[]};
  if(geometry.status!=='observed'){
    result.diagnostics=geometry.diagnostics;
    return riFreeze(result);
  }
  const nodes=new Map(),roads=new Map(),incident=new Map();
  for(const row of geometry.junctions){
    budget.spend();nodes.set(row.ref.id,row);incident.set(row.ref.id,[]);
  }
  for(const road of source.city.roads){
    budget.spend();roads.set(road.id,road);
    incident.get(road.a).push(road.id);incident.get(road.b).push(road.id);
  }
  const roots=new Map(),selected=new Set(geometry.context.operation.editedRefs.map(key));
  const addRoot=(r,reason)=>{
    budget.spend();const k=key(r);
    if(!roots.has(k))roots.set(k,{ref:r,reasons:new Set()});
    roots.get(k).reasons.add(reason);
  };
  for(const r of geometry.context.operation.editedRefs)addRoot(r,'selected-road');
  for(const n of geometry.requested)addRoot(n.ref,'exact-requested-junction');
  // Only graph-reported obstruction identities may independently seed the
  // observation, even when geometrically distant in the accepted graph.
  for(const d of geometry.diagnostics){
    budget.spend();
    if(!['unnormalized-crossing','overlapping-roads','degenerate-road','duplicate-edge','boundary-escape'].includes(d.code))continue;
    for(const r of d.refs)if(r.collection==='roads'||r.collection==='nodes')addRoot(r,d.code);
  }
  result.roots=[...roots.values()].sort((a,b)=>ordered(a.ref,b.ref)).map(r=>({ref:r.ref,reasons:[...r.reasons].sort(riCompare)}));
  const admitted=new Map(),omitted=new Map(),queue=[];
  function mark(r,depth){
    budget.spend();const k=key(r);
    if(admitted.has(k))return;
    if(depth>limits.maxHops||admitted.size>=limits.maxObjects){
      omitted.set(k,r);return;
    }
    let role,provenance,reasons;
    if(r.collection==='nodes'){
      const row=nodes.get(r.id);if(!row)throw Error('Unknown RTRE neighborhood junction.');
      // Coordinates alone have no persistent provenance. Do not infer
      // generation from the ID, lack of metadata, or ordinary road class.
      const record=nodeRecords.get(r.id);
      aresReplayJson(record,budget);
      provenance=classifyRoadProvenance(record);
      role=row.role==='protected-anchor'?'protected-anchor':row.role==='exact-requested'?'exact-requested':'observe-only';
      reasons=[...row.reasons];
    }else if(r.collection==='roads'){
      const record=roads.get(r.id);if(!record)throw Error('Unknown RTRE neighborhood road.');
      aresReplayJson(record,budget);
      provenance=classifyRoadProvenance(record);
      const c=classifyRoad(record);
      role=c.protected?'protected-anchor':selected.has(k)?'exact-requested':'observe-only';
      reasons=[...c.reasons];
    }else throw Error('Unsupported RTRE neighborhood reference.');
    if(role==='observe-only')reasons.push(geometry.mode==='strict'?'strict-no-neighbor-adjustment':'neighbor-authority-unestablished');
    if(provenance!=='generated')reasons.push('provenance-'+provenance);
    admitted.set(k,{ref:r,depth,role,provenance,reasons:reasons.sort(riCompare)});
    if(role!=='protected-anchor')queue.push(k);
  }
  const nodeRecords=new Map();
  for(const n of source.city.nodes){budget.spend();nodeRecords.set(n.id,n);}
  // All roots admitted (or omitted) before BFS. Unit typed-edge distance,
  // node->incident road or road->endpoint, first shortest admission wins.
  // There is NO observe-only promotion or writable set in this contract.
  for(const row of result.roots)mark(row.ref,0);
  for(let i=0;i<queue.length;i++){
    budget.spend();const entry=admitted.get(queue[i]);
    const adjacent=entry.ref.collection==='nodes'?
      incident.get(entry.ref.id).map(id=>ref('roads',id)):
      [roads.get(entry.ref.id).a,roads.get(entry.ref.id).b].map(id=>ref('nodes',id));
    budget.spend(Math.max(1,adjacent.length));
    adjacent.sort(ordered);
    for(const r of adjacent)mark(r,entry.depth+1);
  }
  for(const k of admitted.keys()){budget.spend();omitted.delete(k);}
  result.entries=[...admitted.values()].sort((a,b)=>ordered(a.ref,b.ref));
  result.omittedRefs=[...omitted.values()].sort(ordered);
  const unknown=result.entries.filter(r=>r.role==='observe-only'&&r.provenance!=='generated').map(r=>r.ref);
  if(result.omittedRefs.length)result.diagnostics.push(evidence(geometry.context,'scope-limited','rtre-observation-limit',
    'Neighborhood observation reaches the explicit object or hop limit.',result.omittedRefs));
  if(unknown.length)result.diagnostics.push(evidence(geometry.context,'unknown-data','rtre-neighbor-provenance',
    'Unselected road or junction authorship cannot be established from existing records.',unknown));
  result.status=result.omittedRefs.length?'scope-limited':geometry.mode==='strict'?'observed-strict':'authority-unestablished';
  aresReplayJson(result,budget);
  return riFreeze(result);
}
