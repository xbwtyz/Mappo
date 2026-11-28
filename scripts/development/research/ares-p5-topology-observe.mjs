import {createHash} from 'node:crypto';
import {materializeLockedRtreCase,lockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {classifyRoad} from '../../../src/core/road-graph.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
import {P5_LIMITS,p5Permissions,classifyP5Contact,p5PermissionReasons} from './ares-p5-topology-contract.mjs';

const nodeFields=new Set(['id','x','y']);
const roadFields=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
const opaque=(row,fields,budget)=>{let unknown=false;for(const k of Object.keys(row)){budget.spend();if(!fields.has(k))unknown=true;}return unknown;};
// Fresh generated recipe only; caller cannot supply a city, writable IDs,
// provenance claims, arbitrary coordinates or a new budget. Adaptive P4
// observation is reused solely for geometry/scope discovery, not permission.
export async function observeP5Topology(caseId,input){
  const permissions=p5Permissions(input);
  if(typeof caseId!=='string')throw Error('Frozen RTRE recipe ID required.');
  const lock=lockedRtreCase(caseId),budget=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
  const report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:P5_LIMITS.maxObjects,maxHops:P5_LIMITS.maxHops},budget);
  const f=materializeLockedRtreCase(caseId),source=aresReplayJson(f.project,budget),bytes=Buffer.from(source,'utf8');
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  const fingerprint=createHash('sha256').update(bytes).digest('hex');
  if(fingerprint!==lock.source||fingerprint!==report.snapshotFingerprint||aresReplayJson(f.context,budget)!==aresReplayJson(report.context,budget))throw Error('P5 source identity changed.');
  const city=f.project.city,nodes=new Map(),roads=new Map(),positions=new Map(),admitted=new Set(),eligible=new Set(),fixed=new Set();
  for(const n of city.nodes){budget.spend();nodes.set(n.id,n);}
  for(const r of city.roads){budget.spend();roads.set(r.id,r);}
  for(const n of report.requested){budget.spend();positions.set(n.ref.id,n.point);}
  for(const e of report.entries){budget.spend();admitted.add(e.ref.collection+':'+e.ref.id);if(e.role==='protected-anchor'&&e.ref.collection==='nodes')fixed.add(e.ref.id);}
  for(const e of report.eligibleJunctions){budget.spend();eligible.add(e.ref.id);}
  for(const id of city.plaza?.vertices??[]){budget.spend();fixed.add(id);}
  const conflicts=[],other=[],seen=new Set();
  const complete=['research-eligible','no-eligible-neighbors'].includes(report.status)&&!report.omittedRefs.length;
  for(const d of report.geometryDiagnostics){
    budget.spend();
    const ids=d.refs.filter(r=>r.collection==='roads').map(r=>r.id).sort(riCompare);
    if(!['unnormalized-crossing','overlapping-roads'].includes(d.code)||ids.length!==2||ids[0]===ids[1]||!ids.every(id=>roads.has(id))){
      other.push({code:d.code,reason:d.reason});continue;
    }
    const key=JSON.stringify(ids);
    if(seen.has(key))throw Error('Duplicate P5 pair evidence.');seen.add(key);
    const [a,b]=ids.map(id=>roads.get(id)),ends=[a.a,a.b,b.a,b.b],at=id=>positions.get(id)??nodes.get(id);
    budget.spend(16);
    const contact=classifyP5Contact(...ends.map(at)),reasons=[...p5PermissionReasons(permissions,contact)];
    if(!complete)reasons.push('incomplete-or-refused-preflight');
    for(const road of [a,b]){
      budget.spend();
      if(classifyRoad(road).protected)reasons.push('protected-road:'+road.id);
      if(opaque(road,roadFields,budget))reasons.push('opaque-road:'+road.id);
      if(!admitted.has('roads:'+road.id))reasons.push('outside-scope-road:'+road.id);
    }
    for(const id of new Set(ends)){
      budget.spend();
      if(!admitted.has('nodes:'+id))reasons.push('outside-scope-node:'+id);
      if(fixed.has(id)||(!positions.has(id)&&!eligible.has(id)))reasons.push('unqualified-node:'+id);
      if(opaque(nodes.get(id),nodeFields,budget))reasons.push('opaque-node:'+id);
    }
    conflicts.push({roadIds:ids,endpointIds:ends,code:d.code,contact,reasons:[...new Set(reasons)].sort(riCompare)});
  }
  // Any unclassified/non-pair blocker prevents candidate consideration.
  for(const c of conflicts){budget.spend();if(other.length)c.reasons.push('other-preflight-blockers');c.status=c.reasons.length?'blocked':'research-contact-only';}
  budget.spend(Math.max(1,conflicts.length*Math.ceil(Math.log2(conflicts.length+1))));
  conflicts.sort((a,b)=>riCompare(JSON.stringify(a.roadIds),JSON.stringify(b.roadIds)));
  if(aresReplayJson(f.project,budget)!==source)throw Error('P5 observation mutated source.');
  const evidence={version:1,caseId,source:fingerprint,authorship:'fresh-frozen-generator-recipe',permissions,preflight:report.status,requested:report.requested,conflicts,other,authority:'none',topologyChanged:false};
  aresReplayJson(evidence,budget);
  return riFreeze({...evidence,stats:budget.snapshot()});
}
