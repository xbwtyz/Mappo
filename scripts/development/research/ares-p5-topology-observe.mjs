import {tournamentLockedRow} from './ares-p5-tournament-lock.mjs';
import {plazaExperimentCase,plazaExperimentSeed} from './ares-p5-holdout-plaza-experiment-lock.mjs';
import {holdoutLockedRow,HOLDOUT_SPLIT_PERMISSIONS} from './ares-p5-holdout-lock.mjs';
import {holdoutPrecisionSeed} from './ares-p5-holdout-precision-audit-lock.mjs';
import {holdoutEBSeed} from './ares-p5-holdout-eb-lock.mjs';
import {g2Seed} from './ares-p5-topology-g2-lock.mjs';
import {createHash} from 'node:crypto';
import {materializeLockedRtreCase,lockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {classifyRoad,iterateRoadGraph} from '../../../src/core/road-graph.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
import {P5_LIMITS,p5Permissions,classifyP5Contact,p5PermissionReasons} from './ares-p5-topology-contract.mjs';

const nodeFields=new Set(['id','x','y']);
const roadFields=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
const opaque=(row,fields,budget)=>{let unknown=false;for(const k of Object.keys(row)){budget.spend();if(!fields.has(k))unknown=true;}return unknown;};
// Fresh generated recipe only; caller cannot supply a city, writable IDs,
// provenance claims, arbitrary coordinates or a new budget. Adaptive P4
// observation is reused solely for geometry/scope discovery, not permission.
export async function observeP5Topology(caseId,input){
  const budget=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
  return (await observeP5WithBudget(caseId,input,budget)).evidence;
}
// Only actual plaza vertices with exclusively plaza-derived protection.
function plazaStationaryEndpoints(city,positions,budget){
 const allowed=new Set(city.plaza?.vertices??[]);
 for(const road of city.roads){budget.spend();if(classifyRoad(road).reasons.some(x=>x!=='plaza')){allowed.delete(road.a);allowed.delete(road.b);}}
 // Terminal corridors are excluded separately using the source graph.
 for(const gate of city.gates??[]){budget.spend();allowed.delete(gate.connection?.cityNodeId);}
 for(const k of ['waterFaces','terrainFaces'])for(const row of city[k]??[])for(const id of row.vertices??[]){budget.spend();allowed.delete(id);}
 for(const id of positions.keys()){budget.spend();allowed.delete(id);}
 return allowed;
}
export async function observeP5PlazaExperiment(caseId,arm){
 plazaExperimentCase(caseId,arm);
 const b=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
 return (await observeP5WithBudget(caseId,HOLDOUT_SPLIT_PERMISSIONS,b,arm==='plaza-attached')).evidence;
}
async function observeP5WithBudget(caseId,input,budget,plazaException=false){
  const permissions=p5Permissions(input);
  if(typeof caseId!=='string')throw Error('Frozen RTRE recipe ID required.');
  const lock=lockedRtreCase(caseId);
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
  const plazaAllowed=plazaException?plazaStationaryEndpoints(city,positions,budget):new Set();
  if(plazaException){const original=p5Graph(city,budget);for(const rid of original.terminalRoadIds){budget.spend();const road=original.roadsById.get(rid);plazaAllowed.delete(road.a);plazaAllowed.delete(road.b);}}
  const conflicts=[],other=[],seen=new Set();
  // P4 fresh eligibility already checks all mandatory roots and selected
  // incident closure; omitted frontier observations are NOT admitted.
  // Retain the old conservative whole-neighborhood gate as evidence,
  // but separately classify each pair's local closure for research only.
  const mandatoryComplete=['research-eligible','no-eligible-neighbors'].includes(report.status);
  const complete=mandatoryComplete&&!report.omittedRefs.length;
  const excluded=new Map(report.excluded.map(e=>[e.ref.id,e.reason]));
  budget.spend(report.excluded.length+report.omittedRefs.length);
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
    if(!mandatoryComplete)reasons.push('incomplete-or-refused-preflight');
    for(const road of [a,b]){
      budget.spend();
      if(classifyRoad(road).protected)reasons.push('protected-road:'+road.id);
      if(opaque(road,roadFields,budget))reasons.push('opaque-road:'+road.id);
      if(!admitted.has('roads:'+road.id))reasons.push('outside-scope-road:'+road.id);
    }
    for(const id of new Set(ends)){
      budget.spend();
      if(!admitted.has('nodes:'+id))reasons.push('outside-scope-node:'+id);
      if(!plazaAllowed.has(id)&&(fixed.has(id)||(!positions.has(id)&&!eligible.has(id))))reasons.push('unqualified-node:'+id);
      if(opaque(nodes.get(id),nodeFields,budget))reasons.push('opaque-node:'+id);
    }
    conflicts.push({roadIds:ids,endpointIds:ends,code:d.code,contact,reasons:[...new Set(reasons)].sort(riCompare),
      endpointExclusions:[...new Set(ends)].filter(id=>excluded.has(id)).map(id=>({id,reason:excluded.get(id)})),
      wholeNeighborhoodComplete:complete});
  }
  // Any unclassified/non-pair blocker prevents candidate consideration.
  for(const c of conflicts){budget.spend();if(other.length)c.reasons.push('other-preflight-blockers');c.status=c.reasons.length?'blocked':'research-contact-only';c.originalWholeNeighborhoodGate=complete?c.status:'blocked';}
  budget.spend(Math.max(1,conflicts.length*Math.ceil(Math.log2(conflicts.length+1))));
  conflicts.sort((a,b)=>riCompare(JSON.stringify(a.roadIds),JSON.stringify(b.roadIds)));
  if(aresReplayJson(f.project,budget)!==source)throw Error('P5 observation mutated source.');
  const evidence={version:2,caseId,source:fingerprint,authorship:'fresh-frozen-generator-recipe',permissions,preflight:report.status,requested:report.requested,conflicts,other,scope:{mandatoryComplete,wholeNeighborhoodComplete:complete,admittedCount:report.entries.length,omittedRefs:report.omittedRefs},authority:'none',topologyChanged:false};
  aresReplayJson(evidence,budget);
  return {evidence:riFreeze({...evidence,stats:budget.snapshot()}),f,source,report};
}

// C1 is deliberately limited to the two predeclared frozen interior-crossing
// pilots. One shared root, no fallback, no arbitrary project or editable list.
// A graph-valid construction is NOT an independently verified recovery.
const c1Cases=new Set(['g:radial-small:eight-loop:100:x','g:linear-medium:eight-chain:100:diagonal']);
const p5Point=n=>({x:n.x,y:n.y});
const samePoint=(a,b)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y);
const p5Sort=(n,b)=>b.spend(Math.max(1,n*Math.ceil(Math.log2(n+1))));
function p5Graph(city,budget){
  budget.spend(Math.max(1,city.nodes.length+city.roads.length));
  const it=iterateRoadGraph(city);let charged=0;
  try{for(;;){
    const step=it.next();
    if(step.done){if(step.value.work>charged)budget.spend(step.value.work-charged);return step.value;}
    if(step.value.stage==='road-graph-intersections'){budget.spend(64);charged+=64;}else budget.spend();
  }}finally{it.return();}
}
export async function constructP5SplitPilot(caseId,input){
  if(!c1Cases.has(caseId))throw Error('Frozen P5 C1 pilot ID required.');
  return constructSplit(caseId,input,null);
}
export async function constructP5CombinedPilot(caseId,input){
  return constructSplit(caseId,input,g2Seed(caseId));
}
// Holdout: same exact-translation constructor, with fixed permissions.
export async function constructP5HoldoutSplit(caseId){
  holdoutLockedRow(caseId);
  return constructSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,null);
}
export async function constructP5HoldoutCombinedSplit(caseId){
 return constructSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,holdoutEBSeed(caseId));
}
export async function constructP5HoldoutPrecisionSplit(caseId){
 return constructSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,holdoutPrecisionSeed(caseId));
}
export async function constructP5PlazaExperiment(caseId,arm,precision=false){
 plazaExperimentCase(caseId,arm);
 const seed=precision?plazaExperimentSeed(caseId):null;
 return constructSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,seed,arm==='plaza-attached');
}
// Detached coordinated search only. The caller's existing root charges construction;
// this is not an authority token or a live editing API.
export async function constructP5CoordinatedCandidate(caseId,neighbors,pairs,budget){
 const row=typeof caseId==='string'&&caseId.startsWith('t:')?tournamentLockedRow(caseId):(plazaExperimentCase(caseId,'plaza-attached'),holdoutLockedRow(caseId));
 return constructSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,{recipe:{source:row.source,cap:8},seed:{arm:'coordinated',best:{neighbors,pairs}}},true,budget,true);
}
async function constructSplit(caseId,input,combined,plazaException=false,sharedBudget=null,coordinated=false){
  const permissions=p5Permissions(input),budget=sharedBudget??createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
  let sourceHash=null,attempts=0,translationEvidence=null;
  const finish=(status,reason,extra={})=>riFreeze({version:1,caseId,source:sourceHash,status,reason,attempts,
    authority:'none',independentlyVerified:false,...(translationEvidence?{translationEvidence}:{}),...extra,stats:budget.snapshot()});
  try{
    const {evidence,f,source,report}=await observeP5WithBudget(caseId,permissions,budget,plazaException);
    sourceHash=evidence.source;
    if(!evidence.scope.mandatoryComplete||(!combined&&(evidence.other.length||!evidence.conflicts.length||
      evidence.conflicts.some(c=>c.status!=='research-contact-only'||c.contact.kind!=='interior-interior'))))
      return finish('preflight-refused','contact-closure');
    if(combined&&(permissions.mode!=='restructure'||!permissions.intersection||!permissions.split||permissions.merge||permissions.overlap))
      return finish('preflight-refused','permission');
    const city=f.project.city,accepted=p5Graph(city,budget);
    if(!accepted.valid)return finish('preflight-refused','invalid-source-graph');
    const admitted=new Set(report.entries.map(e=>e.ref.collection+':'+e.ref.id));
    const terminal=new Set(accepted.terminalRoadIds),protectedNodes=new Set(city.plaza?.vertices??[]);
    for(const gate of city.gates??[]){budget.spend();if(gate.connection?.cityNodeId!=null)protectedNodes.add(gate.connection.cityNodeId);}
    for(const k of ['waterFaces','terrainFaces'])for(const row of city[k]??[])for(const id of row.vertices??[]){budget.spend();protectedNodes.add(id);}
    for(const road of city.roads){budget.spend();if(classifyRoad(road).protected||terminal.has(road.id)){protectedNodes.add(road.a);protectedNodes.add(road.b);}}
    const requested=new Map(report.requested.map(r=>[r.ref.id,r.point]));
    const neighbors=combined?combined.seed.best.neighbors:[];
    const eligible=new Set(report.eligibleJunctions.map(e=>e.ref.id));
    budget.spend(Math.max(1,eligible.size));
    if(combined){
      const {recipe,seed}=combined,offset=f.context.operation.geometry.offset;
      if((report.status!=='research-eligible'&&!(coordinated&&!neighbors.length&&report.status==='no-eligible-neighbors'))||sourceHash!==recipe.source||neighbors.length<(coordinated?0:2)||neighbors.length>recipe.cap||new Set(neighbors.map(n=>n.id)).size!==neighbors.length||
        (recipe.minimum&&neighbors.length!==recipe.minimum))return finish('preflight-refused','neighbor-cap-or-source');
      const exactIds=new Set(f.context.operation.editedRefs.map(x=>x.id)),exact=new Map();
      for(const road of city.roads){budget.spend();if(exactIds.has(road.id))for(const id of [road.a,road.b]){
        budget.spend();const n=accepted.nodesById.get(id);exact.set(id,{x:offset.x===0?n.x:n.x+offset.x,y:offset.y===0?n.y:n.y+offset.y});}}
      if(exact.size!==requested.size||[...exact].some(([id,p])=>!requested.has(id)||!samePoint(p,requested.get(id))))
        return finish('preflight-refused','exact-intent');
      for(const entry of report.entries){budget.spend();if(entry.ref.collection==='nodes'&&entry.role==='protected-anchor')protectedNodes.add(entry.ref.id);}
      for(const n of neighbors){
        budget.spend(8);const old=accepted.nodesById.get(n.id),p=n.point;
        if(!old||!eligible.has(n.id)||requested.has(n.id)||protectedNodes.has(n.id)||!admitted.has('nodes:'+n.id)||
          opaque(old,nodeFields,budget)||!samePoint(old,n.old)||samePoint(old,p)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||
          Math.abs(p.x)>100000||Math.abs(p.y)>100000||Math.hypot(p.x-old.x,p.y-old.y)>Math.hypot(offset.x,offset.y))
          return finish('preflight-refused','neighbor-authority');
        requested.set(n.id,p);
      }
      const seen=new Set(),queue=neighbors.length?[neighbors[0].id]:[];
      for(let i=0;i<queue.length;i++){budget.spend();const id=queue[i];if(seen.has(id))continue;seen.add(id);
        for(const n of accepted.adjacency.get(id)){budget.spend();if(!seen.has(n)&&requested.has(n))queue.push(n);}}
      if(!neighbors.every(n=>seen.has(n.id)))return finish('preflight-refused','disconnected-neighbor-cluster');
    }
    const nodes=city.nodes.map(n=>{budget.spend();return requested.has(n.id)?{...n,...requested.get(n.id)}:{...n};});
    const byId=new Map(nodes.map(n=>[n.id,n])),roads=new Map(city.roads.map(r=>[r.id,r]));
    const used=new Set([...byId.keys(),...roads.keys()]);budget.spend(Math.max(1,used.size+admitted.size+requested.size));
    const plazaAllowed=plazaException?plazaStationaryEndpoints(city,requested,budget):new Set();
    for(const rid of terminal){budget.spend();const r=accepted.roadsById.get(rid);plazaAllowed.delete(r.a);plazaAllowed.delete(r.b);}
    const admissible=road=>[road.a,road.b].every(id=>admitted.has('nodes:'+id)&&(!protectedNodes.has(id)||plazaAllowed.has(id))&&!opaque(byId.get(id),nodeFields,budget))&&
      admitted.has('roads:'+road.id)&&!classifyRoad(road).protected&&!terminal.has(road.id)&&!opaque(road,roadFields,budget);
    // Geometry-only changes may retain a stationary protected endpoint,
    // as in the qualified P4 verifier. Never move it, split its incident
    // protected infrastructure, or relax the separate split-road guard.
    const translated=[],translatedBlockers=[],stationaryAnchors=[];
    for(const road of city.roads){
      budget.spend();if(!requested.has(road.a)&&!requested.has(road.b))continue;
      const reasons=[];
      if(!admitted.has('roads:'+road.id))reasons.push('outside-scope-road');
      if(classifyRoad(road).protected)reasons.push('protected-road');
      if(terminal.has(road.id))reasons.push('terminal-road');
      if(opaque(road,roadFields,budget))reasons.push('opaque-road');
      for(const id of [road.a,road.b]){
        budget.spend();
        const prior=accepted.nodesById.get(id),next=byId.get(id);
        if(!admitted.has('nodes:'+id))reasons.push('outside-scope-node:'+id);
        if(opaque(next,nodeFields,budget))reasons.push('opaque-node:'+id);
        if(protectedNodes.has(id)){
          if(requested.has(id)||!samePoint(prior,next))reasons.push('protected-node-motion:'+id);
          else stationaryAnchors.push({roadId:road.id,nodeId:id,point:p5Point(prior)});
        }
      }
      if(reasons.length)translatedBlockers.push({roadId:road.id,reasons});
      translated.push(road.id);
    }
    translationEvidence={translatedRoadIds:[...translated].sort(riCompare),stationaryAnchors,translatedBlockers};
    aresReplayJson(translationEvidence,budget);
    if(translatedBlockers.length)return finish('preflight-refused','translated-road-closure',{translationEvidence});
    // Reserve typed IDs deterministically from sorted contact pairs and
    // original road order. All existing IDs remain occupied throughout.
    const reserve=(prefix,i)=>{let id=prefix+i;for(let n=1;used.has(id);n++){budget.spend();id=prefix+i+'-'+n;}budget.spend();used.add(id);return id;};
    let conflicts=evidence.conflicts;
    if(combined){
      const replay=p5Graph({...city,nodes},budget),pairs=replay.issues.map(i=>({code:i.code,roadIds:[...(i.roadIds??[])].sort(riCompare)}));
      const keys=rows=>rows.map(x=>JSON.stringify([x.code,[...x.roadIds].sort(riCompare)])).sort(riCompare);
      budget.spend(Math.max(1,pairs.length*8));p5Sort(pairs.length,budget);
      if((replay.valid&&!coordinated)||pairs.some(p=>p.code!=='unnormalized-crossing'||p.roadIds.length!==2)||
        (combined.seed.best.pairs?aresReplayJson(keys(pairs),budget)!==aresReplayJson(keys(combined.seed.best.pairs),budget):
          pairs.length!==combined.seed.best.expectedContactCount||!pairs.some(p=>aresReplayJson(p.roadIds,budget)===aresReplayJson(combined.seed.best.requiredPair,budget))))
        return finish('preflight-refused','frozen-conflict-replay-mismatch');
      conflicts=pairs.map(p=>{budget.spend(16);const [a,b]=p.roadIds.map(id=>roads.get(id));
        return {roadIds:p.roadIds,contact:classifyP5Contact(byId.get(a.a),byId.get(a.b),byId.get(b.a),byId.get(b.b))};});
      conflicts.sort((a,b)=>riCompare(JSON.stringify(a.roadIds),JSON.stringify(b.roadIds)));
    }
    budget.expand();attempts=1;
    const cuts=new Map(),added=[],contacts=[];
    for(const c of conflicts){
      budget.spend(16);
      const [a,b]=c.roadIds.map(id=>roads.get(id));
      if(!admissible(a)||!admissible(b)||(combined&&[a.a,a.b,b.a,b.b].some(id=>!requested.has(id)&&!eligible.has(id)&&!plazaAllowed.has(id))))return finish('candidate-refused','split-road-closure');
      const fresh=classifyP5Contact(byId.get(a.a),byId.get(a.b),byId.get(b.a),byId.get(b.b));
      if(fresh.kind!=='interior-interior'||aresReplayJson(fresh,budget)!==aresReplayJson(c.contact,budget))
        return finish('candidate-refused','contact-mismatch');
      // No proximity snapping or multi-contact merge in C1.
      for(const n of [...nodes,...added]){budget.spend();if(Math.hypot(n.x-fresh.point.x,n.y-fresh.point.y)<=1e-7)return finish('candidate-refused','coincident-or-near-contact');}
      const node={id:reserve('N-P5-',added.length+1),...fresh.point};
      added.push(node);contacts.push({roadIds:[a.id,b.id],node:{...node},parameters:[fresh.ab[0],fresh.ba[0]]});
      for(const [road,t] of [[a,fresh.ab[0]],[b,fresh.ba[0]]]){
        budget.spend();if(!cuts.has(road.id))cuts.set(road.id,[]);
        cuts.get(road.id).push({id:node.id,t});
      }
    }
    const lineage=[],nextRoads=[];let serial=0;
    const sorted=[...city.roads].sort((a,b)=>riCompare(a.id,b.id));p5Sort(sorted.length,budget);
    for(const road of sorted){
      budget.spend();const list=cuts.get(road.id);
      if(!list){nextRoads.push({...road});continue;}
      p5Sort(list.length,budget);list.sort((a,b)=>a.t-b.t||riCompare(a.id,b.id));
      if(list.some((c,i)=>i&&c.t-list[i-1].t<=1e-9))return finish('candidate-refused','ambiguous-cut-order');
      const chain=[road.a,...list.map(c=>c.id),road.b],children=[];
      for(let i=0;i<chain.length-1;i++){
        budget.spend();const child={...road,id:i===0?road.id:reserve('RD-P5-',++serial),a:chain[i],b:chain[i+1]};
        nextRoads.push(child);children.push({...child});
      }
      lineage.push({parent:road.id,originalEndpoints:[road.a,road.b],children});
    }
    // Preserve original ordering for unsplit records and the first child.
    const byParent=new Map(lineage.map(l=>[l.parent,l.children]));
    const ordered=city.roads.flatMap(r=>{budget.spend();return byParent.get(r.id)??[{...r}];});
    const candidate={...city,nodes:[...nodes,...added],roads:ordered};
    const final=p5Graph(candidate,budget);
    if(aresReplayJson(f.project,budget)!==source)throw Error('P5 C1 source mutated.');
    if(!final.valid)return finish('candidate-refused','invalid-final-graph',{issues:final.issues});
    if(final.components.length!==1||accepted.components.length!==1||
      final.nodesById.size!==accepted.nodesById.size+added.length||
      final.roadsById.size!==accepted.roadsById.size+serial||
      [...accepted.nodesById.keys()].some(id=>!final.nodesById.has(id))||
      [...accepted.roadsById.keys()].some(id=>!final.roadsById.has(id)))
      return finish('candidate-refused','identity-or-connectivity');
    for(const [id,n] of accepted.nodesById){budget.spend();if(!samePoint(final.nodesById.get(id),requested.get(id)??n))return finish('candidate-refused','exact-intent');}
    const witness={requested:report.requested,...(combined?{seedArm:combined.seed.arm,neighbors:neighbors.map(n=>({id:n.id,old:{...n.old},point:{...n.point}}))}:{}),translatedRoadIds:translated.sort(riCompare),contacts,lineage,
      reservedNodeIds:added.map(n=>n.id),reservedRoadIds:lineage.flatMap(l=>l.children.slice(1).map(c=>c.id)),
      graph:{nodes:final.nodesById.size,roads:final.roadsById.size,components:final.components.length}};
    aresReplayJson(witness,budget);
    return finish('graph-candidate','independent-audit-pending',{witness});
  }catch(e){
    if(e instanceof LareBudgetExceeded)return finish('work-limit',e.resource);
    throw e;
  }
}
