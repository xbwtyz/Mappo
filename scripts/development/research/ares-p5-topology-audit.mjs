import {auditAdaptiveHub} from './square-trial-hub-audit.mjs';
import {squareRecoveryLockedRow} from './square-trial-recovery-lock.mjs';
import {tournamentLockedRow} from './ares-p5-tournament-lock.mjs';
import {plazaExperimentCase,plazaExperimentSeed} from './ares-p5-holdout-plaza-experiment-lock.mjs';
import {holdoutLockedRow,HOLDOUT_SPLIT_PERMISSIONS} from './ares-p5-holdout-lock.mjs';
import {holdoutPrecisionSeed} from './ares-p5-holdout-precision-audit-lock.mjs';
import {holdoutEBSeed} from './ares-p5-holdout-eb-lock.mjs';
import {g2Seed} from './ares-p5-topology-g2-lock.mjs';
import {inspectP5IdentityLedger} from './ares-p5-topology-lineage.mjs';
import {createHash} from 'node:crypto';
import {materializeLockedRtreCase,lockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {iterateRoadGraph,classifyRoad} from '../../../src/core/road-graph.js';
import {segmentCuts,insideOrOn,lerpPoint} from '../../../src/core/boundary.js';
import {createAresLandscapeSegmentObserver} from '../../../src/core/ares-landscape-observation.js';
import {createAresDefenseSegmentObserver} from '../../../src/core/ares-defense-observation.js';
import {createSpatialRef,createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';

// C2 independent reconstruction: no import of P5 construction or contact
// classifier. Shared graph/domain predicates and fresh P4 scope observer are
// intentional; independent pair enumeration, lineage and authority checks.
const cases=new Set(['g:radial-small:eight-loop:100:x','g:linear-medium:eight-chain:100:diagonal']);
const nodeKeys=new Set(['id','x','y']);
const roadKeys=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
class Rejected extends Error{}
const need=(v,code)=>{if(!v)throw new Rejected(code);};
const point=n=>({x:n.x,y:n.y});
const same=(a,b)=>a&&b&&Object.is(a.x,b.x)&&Object.is(a.y,b.y);
const compare=(a,b)=>riCompare(a.id,b.id);
const sortCharge=(n,b)=>b.spend(Math.max(1,n*Math.ceil(Math.log2(n+1))));
const known=(row,keys,b)=>{for(const k of Object.keys(row)){b.spend();if(!keys.has(k))return false;}return true;};
// The graph oracle copies records with sorted object keys. Compare record
// contents independently of key insertion order, preserving signed zero,
// every own enumerable field and array order. Keep exact source/witness
// serialization checks unchanged; this is only graph-record equivalence.
export function equalP5GraphRecord(a,c,b){
  b.spend();
  if(Object.is(a,c))return true;
  if(!a||!c||typeof a!=='object'||typeof c!=='object'||Array.isArray(a)!==Array.isArray(c))return false;
  const ak=Object.keys(a),ck=Object.keys(c);
  b.spend(Math.max(1,ak.length+ck.length));
  if(ak.length!==ck.length)return false;
  if(Array.isArray(a)&&a.length!==c.length)return false;
  return ak.every(k=>Object.hasOwn(c,k)&&equalP5GraphRecord(a[k],c[k],b));
}
function graph(city,b){
  b.spend(Math.max(1,city.nodes.length+city.roads.length));
  const it=iterateRoadGraph(city);let paid=0;
  try{for(;;){
    const s=it.next();
    if(s.done){if(s.value.work>paid)b.spend(s.value.work-paid);return s.value;}
    if(s.value.stage==='road-graph-intersections'){b.spend(64);paid+=64;}else b.spend();
  }}finally{it.return();}
}
function contained(a,c,outline,b){
  const cuts=[0,1];
  for(let i=0;i<outline.length;i++){b.spend();cuts.push(...segmentCuts(a,c,outline[i],outline[(i+1)%outline.length]));}
  sortCharge(cuts.length,b);cuts.sort((x,y)=>x-y);
  for(let i=0;i<cuts.length;i++){
    b.spend(outline.length);if(!insideOrOn(lerpPoint(a,c,cuts[i]),outline))return false;
    if(i){b.spend(outline.length);if(!insideOrOn(lerpPoint(a,c,(cuts[i-1]+cuts[i])/2),outline))return false;}
  }
  return true;
}
export async function auditP5SplitPilot(caseId,permissions,evidence){
  if(!cases.has(caseId))throw Error('Frozen P5 C2 pilot ID required.');
  return auditSplit(caseId,permissions,evidence,null);
}
export async function auditP5CombinedPilot(caseId,permissions,evidence){
  return auditSplit(caseId,permissions,evidence,g2Seed(caseId));
}
// Holdout keeps the C reconstruction but requires the G2 rotation gate.
export async function auditP5HoldoutSplit(caseId,evidence){
  holdoutLockedRow(caseId);
  return auditSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,evidence,null,true);
}
export async function auditP5HoldoutCombinedSplit(caseId,evidence){
 return auditSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,evidence,holdoutEBSeed(caseId),true);
}
export async function auditP5HoldoutPrecisionSplit(caseId,evidence){
 return auditSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,evidence,holdoutPrecisionSeed(caseId),true);
}
export async function auditP5PlazaExperiment(caseId,arm,evidence,precision=false){
 plazaExperimentCase(caseId,arm);
 return auditSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,evidence,precision?plazaExperimentSeed(caseId):null,true,arm==='plaza-attached');
}
// Independent replay: coordinates are untrusted claims. No search feedback,
// no caller budget or permission, no reliance on the search contact inventory.
export async function auditP5CoordinatedCandidate(caseId,evidence){
 if(typeof caseId==='string'&&caseId.startsWith('sq:'))squareRecoveryLockedRow(caseId);else if(typeof caseId==='string'&&caseId.startsWith('t:'))tournamentLockedRow(caseId);else plazaExperimentCase(caseId,'plaza-attached');
 return auditSplit(caseId,HOLDOUT_SPLIT_PERMISSIONS,evidence,null,true,true,true);
}
async function auditSplit(caseId,permissions,evidence,combined,holdout=false,plazaException=false,coordinated=false){
  // No caller-supplied budget or scope, no search retry. This root is
  // independent evidence only, never a continuation of construction.
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
  const result={version:1,caseId,source:null,status:'unverified',reason:null,authority:'none',
    pairComparisons:0,contacts:0,splitParents:0,finalChecks:0,sweptChecks:0,finalBlockers:[],sweptUnresolved:[]};
  const finish=()=>riFreeze({...result,stats:b.snapshot()});
  const eq=(x,y)=>aresReplayJson(x,b)===aresReplayJson(y,b);
  try{
    const required=['mode','intersection','split','merge','overlap'];
    need(permissions&&[Object.prototype,null].includes(Object.getPrototypeOf(permissions))&&Reflect.ownKeys(permissions).length===required.length&&
      required.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(permissions,k)??{},'value'))&&
      permissions.mode==='restructure'&&permissions.intersection===true&&permissions.split===true&&permissions.merge===false&&permissions.overlap===false,'permission');
    const lock=lockedRtreCase(caseId),f=materializeLockedRtreCase(caseId),city=f.project.city;
    const before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');
    b.spend(Math.max(1,Math.ceil(bytes.length/64)));result.source=createHash('sha256').update(bytes).digest('hex');
    need(result.source===lock.source,'source-lock');
    const report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:10000,maxHops:6},b);
    need(report.snapshotFingerprint===result.source&&eq(report.context,f.context)&&
      ['research-eligible','no-eligible-neighbors'].includes(report.status),'scope-source');
    need(evidence&&evidence.caseId===caseId&&evidence.source===result.source&&evidence.status==='graph-candidate'&&
      evidence.authority==='none'&&evidence.independentlyVerified===false&&evidence.attempts===1&&evidence.witness,'witness-source');
    const w=evidence.witness;
    need(Array.isArray(w.requested)&&Array.isArray(w.contacts)&&Array.isArray(w.lineage)&&Array.isArray(w.reservedNodeIds)&&Array.isArray(w.reservedRoadIds)&&Array.isArray(w.translatedRoadIds),'witness-shape');
    // Check accepted graph, rebuild exact requested node positions solely
    // from frozen operation road IDs and offset, not witness coordinates.
    const original=graph(city,b);need(original.valid&&original.components.length===1,'source-graph');
    const selected=new Set(f.context.operation.editedRefs.map(r=>r.id)),offset=f.context.operation.geometry.offset;
    const requested=new Map(),fixed=new Set(city.plaza?.vertices??[]),terminal=new Set(original.terminalRoadIds);
    for(const road of city.roads){
      b.spend();
      if(classifyRoad(road).protected||terminal.has(road.id)){fixed.add(road.a);fixed.add(road.b);}
      if(selected.has(road.id))for(const id of [road.a,road.b]){
        b.spend();const n=original.nodesById.get(id);
        requested.set(id,{x:offset.x===0?n.x:n.x+offset.x,y:offset.y===0?n.y:n.y+offset.y});
      }
    }
    for(const gate of city.gates??[]){b.spend();if(gate.connection?.cityNodeId!=null)fixed.add(gate.connection.cityNodeId);}
    for(const k of ['waterFaces','terrainFaces'])for(const row of city[k]??[])for(const id of row.vertices??[]){b.spend();fixed.add(id);}
    const admitted=new Map(report.entries.map(e=>[e.ref.collection+':'+e.ref.id,e]));
    const qualified=new Set(report.eligibleJunctions.map(e=>e.ref.id));
    b.spend(Math.max(1,admitted.size+qualified.size+requested.size));
    const inScope=(k,id)=>{const e=admitted.get(k+':'+id);return e&&e.depth<=6;};
    need(requested.size===w.requested.length&&requested.size===report.requested.length,'exact-intent-count');
    const observed=new Set();
    for(const entry of w.requested){
      b.spend();const id=entry.ref?.id;
      need(entry.ref.collection==='nodes'&&!observed.has(id)&&same(requested.get(id),entry.point),'exact-intent');
      observed.add(id);
    }
    for(const n of report.requested){b.spend();need(same(requested.get(n.ref.id),n.point),'observer-intent');}
    for(const id of requested.keys()){b.spend();need(inScope('nodes',id)&&!fixed.has(id)&&known(original.nodesById.get(id),nodeKeys,b),'protected-node');}
    if(combined||coordinated){
      const recipe=combined?.recipe??{source:lock.source,cap:8},seed=combined?.seed,neighbors=coordinated?w.neighbors:seed.best.neighbors;
      need(Array.isArray(neighbors)&&result.source===recipe.source&&(report.status==='research-eligible'||coordinated&&!neighbors.length&&report.status==='no-eligible-neighbors')&&w.seedArm===(coordinated?'coordinated':seed.arm)&&(coordinated||eq(w.neighbors,neighbors)),'seed-evidence');
      need(neighbors.length>=(coordinated?0:2)&&neighbors.length<=recipe.cap&&(!recipe.minimum||neighbors.length===recipe.minimum),'neighbor-cap');
      const seen=new Set();
      for(const n of neighbors){
        b.spend(8);const old=original.nodesById.get(n.id),p=n.point;
        need(old&&qualified.has(n.id)&&!requested.has(n.id)&&!seen.has(n.id)&&inScope('nodes',n.id)&&!fixed.has(n.id)&&
          admitted.get('nodes:'+n.id)?.role!=='protected-anchor'&&known(old,nodeKeys,b)&&same(n.old,old)&&!same(p,old)&&
          Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=100000&&Math.abs(p.y)<=100000&&
          Math.hypot(p.x-old.x,p.y-old.y)<=Math.hypot(offset.x,offset.y),'neighbor-authority');
        seen.add(n.id);requested.set(n.id,p);
      }
      const reached=new Set(),queue=neighbors.length?[neighbors[0].id]:[];
      for(let i=0;i<queue.length;i++){b.spend();const id=queue[i];if(reached.has(id))continue;reached.add(id);
        for(const n of original.adjacency.get(id)){b.spend();if(!reached.has(n)&&requested.has(n))queue.push(n);}}
      need(neighbors.every(n=>reached.has(n.id)),'disconnected-neighbor-cluster');
    }else need(!Object.hasOwn(w,'neighbors')&&!Object.hasOwn(w,'seedArm'),'unexpected-neighbor-evidence');
    const nodes=city.nodes.map(n=>{b.spend();return requested.has(n.id)?{...n,...requested.get(n.id)}:{...n};});
    const positions=new Map(nodes.map(n=>[n.id,n]));
    const roads=[...city.roads].sort(compare),byRoad=new Map(roads.map(r=>[r.id,r]));
    sortCharge(roads.length,b);
    const moved=new Set();
    for(const road of roads){b.spend();if(requested.has(road.a)||requested.has(road.b))moved.add(road.id);}
    // Independently derive the narrowly excepted vertices. No construction
    // helper or claimed anchor set is used. All other fixed reasons veto.
    const square=new Set(city.plaza?.vertices??[]),exceptions=new Set();
    if(plazaException)for(const id of square){
      b.spend();if(requested.has(id)||!fixed.has(id)||!inScope('nodes',id)||!known(original.nodesById.get(id),nodeKeys,b))continue;
      let allowed=true;
      for(const rid of original.incidentRoads.get(id)){b.spend();const r=original.roadsById.get(rid);if(terminal.has(rid)||classifyRoad(r).reasons.some(x=>x!=='plaza'))allowed=false;}
      for(const gate of city.gates??[]){b.spend();if(gate.connection?.cityNodeId===id)allowed=false;}
      for(const k of ['waterFaces','terrainFaces'])for(const face of city[k]??[]){b.spend(face.vertices?.length??1);if(face.vertices?.includes(id))allowed=false;}
      if(allowed)exceptions.add(id);
    }
    const usedExceptions=new Set();
    const scopeRoad=(road,split)=>{
      b.spend();
      need(inScope('roads',road.id)&&!classifyRoad(road).protected&&!terminal.has(road.id)&&known(road,roadKeys,b),'protected-or-unadmitted-road');
      for(const id of [road.a,road.b]){
        b.spend();need(inScope('nodes',id)&&known(original.nodesById.get(id),nodeKeys,b),'endpoint-scope');
        if(split){
          need((!fixed.has(id)&&(requested.has(id)||qualified.has(id)))||exceptions.has(id),'split-protected-or-unqualified-endpoint');
          if(exceptions.has(id))usedExceptions.add(id);
        }
      }
    };
    for(const id of moved)scopeRoad(byRoad.get(id),false);
    need(eq([...moved].sort(riCompare),w.translatedRoadIds),'translated-inventory');
    // Independent all-pairs traversal over every moved/other road pair;
    // no candidate contact list or graph diagnostic is used to seed pairs.
    const contacts=[];
    for(let i=0;i<roads.length;i++)for(let j=i+1;j<roads.length;j++){
      b.spend();const r=roads[i],s=roads[j];if(!moved.has(r.id)&&!moved.has(s.id))continue;
      result.pairComparisons++;
      const a=positions.get(r.a),c=positions.get(r.b),d=positions.get(s.a),e=positions.get(s.b);
      if(Math.max(a.x,c.x)+1e-6<Math.min(d.x,e.x)||Math.max(d.x,e.x)+1e-6<Math.min(a.x,c.x)||
        Math.max(a.y,c.y)+1e-6<Math.min(d.y,e.y)||Math.max(d.y,e.y)+1e-6<Math.min(a.y,c.y))continue;
      b.spend(16);const ab=segmentCuts(a,c,d,e),ba=segmentCuts(d,e,a,c),shared=[r.a,r.b].filter(id=>id===s.a||id===s.b);
      if(!ab.length&&!ba.length)continue;
      const interior=t=>t>1e-9&&t<1-1e-9;
      if(shared.length===1&&![...ab,...ba].some(interior))continue;
      need(!shared.length&&ab.length===1&&ba.length===1&&interior(ab[0])&&interior(ba[0]),'unsupported-contact');
      const cross=(c.x-a.x)*(e.y-d.y)-(c.y-a.y)*(e.x-d.x);
      need(Math.abs(cross)>1e-9,'collinear-contact');
      const p={x:a.x+(c.x-a.x)*ab[0],y:a.y+(c.y-a.y)*ab[0]},q={x:d.x+(e.x-d.x)*ba[0],y:d.y+(e.y-d.y)*ba[0]};
      need(Math.hypot(p.x-q.x,p.y-q.y)<=1e-7,'intersection-coordinate');
      scopeRoad(r,true);scopeRoad(s,true);
      contacts.push({roadIds:[r.id,s.id],point:p,parameters:[ab[0],ba[0]]});
    }
    sortCharge(contacts.length,b);contacts.sort((a,c)=>riCompare(JSON.stringify(a.roadIds),JSON.stringify(c.roadIds)));
    result.contacts=contacts.length;need((coordinated||contacts.length>0)&&contacts.length===w.contacts.length,'contact-inventory');
    if(combined&&!combined.seed.best.pairs){
      need(contacts.length===combined.seed.best.expectedContactCount&&contacts.some(x=>eq(x.roadIds,combined.seed.best.requiredPair)),'frozen-precision-contact-inventory');
    }
    if(combined&&combined.seed.best.pairs){
      const expectedPairs=combined.seed.best.pairs.map(x=>{b.spend(4);return JSON.stringify([x.code,[...x.roadIds].sort(riCompare)]);}).sort(riCompare);
      const actualPairs=contacts.map(x=>{b.spend(4);return JSON.stringify(['unnormalized-crossing',x.roadIds]);}).sort(riCompare);
      need(eq(expectedPairs,actualPairs),'frozen-contact-inventory');
    }
    const occupied=new Set([...original.nodesById.keys(),...original.roadsById.keys()]);
    b.spend(Math.max(1,occupied.size));
    function reserve(prefix,serial){
      let id=prefix+serial,suffix=1;
      while(occupied.has(id)){b.spend();id=prefix+serial+'-'+suffix++;}
      b.spend();occupied.add(id);return id;
    }
    const additions=[],cutLists=new Map();
    for(let i=0;i<contacts.length;i++){
      b.spend();const c=contacts[i],claimed=w.contacts[i],id=reserve('N-P5-',i+1);
      const node={id,...c.point};
      need(eq(claimed,{roadIds:c.roadIds,node,parameters:c.parameters}),'contact-witness');
      for(const n of [...nodes,...additions]){b.spend();need(Math.hypot(n.x-node.x,n.y-node.y)>1e-7,'coincident-contact');}
      additions.push(node);
      c.roadIds.forEach((rid,k)=>{b.spend();if(!cutLists.has(rid))cutLists.set(rid,[]);cutLists.get(rid).push({id,t:c.parameters[k]});});
    }
    need(eq(w.reservedNodeIds,additions.map(n=>n.id)),'node-reservations');
    const expected=[],newIds=[],parts=new Map();let serial=0;
    for(const road of roads){
      b.spend();const cuts=cutLists.get(road.id);
      if(!cuts)continue;
      sortCharge(cuts.length,b);cuts.sort((x,y)=>x.t-y.t||riCompare(x.id,y.id));
      need(cuts.every((c,i)=>i===0||c.t-cuts[i-1].t>1e-9),'cut-order');
      const ids=[road.a,...cuts.map(c=>c.id),road.b],children=[];
      for(let i=0;i<ids.length-1;i++){
        b.spend();const id=i?reserve('RD-P5-',++serial):road.id;
        if(i)newIds.push(id);children.push({...road,id,a:ids[i],b:ids[i+1]});
      }
      expected.push({parent:road.id,originalEndpoints:[road.a,road.b],children});parts.set(road.id,children);
    }
    result.splitParents=expected.length;
    need(eq(w.lineage,expected)&&eq(w.reservedRoadIds,newIds),'road-lineage-or-reservation');
    const candidate={...city,nodes:[...nodes,...additions],roads:city.roads.flatMap(r=>{b.spend();return parts.get(r.id)??[{...r}];})};
    const rebuilt=graph(candidate,b);
    need(rebuilt.valid&&rebuilt.components.length===1&&rebuilt.nodesById.size===original.nodesById.size+additions.length&&
      rebuilt.roadsById.size===original.roadsById.size+newIds.length,'final-graph');
    need(eq(w.graph,{nodes:rebuilt.nodesById.size,roads:rebuilt.roadsById.size,components:1}),'graph-evidence');
    for(const [id,n] of original.nodesById){b.spend();need(equalP5GraphRecord(rebuilt.nodesById.get(id),requested.has(id)?{...n,...requested.get(id)}:n,b),'node-preservation');}
    for(const [id,road] of original.roadsById){b.spend();need(equalP5GraphRecord(rebuilt.roadsById.get(id),parts.get(id)?.[0]??road,b),'road-preservation');}
    for(const n of additions){b.spend();need(equalP5GraphRecord(rebuilt.nodesById.get(n.id),n,b),'new-node-preservation');}
    for(const children of parts.values())for(const child of children){b.spend();need(equalP5GraphRecord(rebuilt.roadsById.get(child.id),child,b),'child-road-preservation');}
    // G2D: inspect all original junctions under the SAME gate, without
    // changing coordinates, permissions or candidate selection. Compare
    // original -> proposed unsplit -> normalized parent-bearing orders.
    // C controls are observation-only: their original gate is unchanged.
    const parentByChild=new Map();
    for(const [parent,children] of parts)for(const child of children){b.spend();parentByChild.set(child.id,parent);}
    const cyclic=(g,id,coords,parents)=>{
      const n=coords.get(id),ids=[...g.incidentRoads.get(id)];sortCharge(ids.length,b);
      const bearings=ids.map(rid=>{
        b.spend();const r=g.roadsById.get(rid),other=r.a===id?r.b:r.a,p=coords.get(other);
        return {roadId:rid,parent:parents.get(rid)??rid,other,angle:Math.atan2(p.y-n.y,p.x-n.x)};
      });
      return bearings.sort((a,c)=>a.angle-c.angle||riCompare(a.roadId,c.roadId));
    };
    const equalOrder=(a,c)=>{
      b.spend(Math.max(1,a.length*2));
      if(a.length!==c.length)return false;
      if(!a.length)return true;
      const start=c.findIndex(x=>x.parent===a[0].parent);
      return start>=0&&a.every((x,i)=>x.parent===c[(start+i)%c.length].parent);
    };
    const noParents=new Map(),changes=[];
    const selectedNodes=new Set(report.requested.map(x=>x.ref.id));
    let checked=0,geometryChanged=0,splitChanged=0,finalChanged=0;
    for(const id of original.nodesById.keys()){
      b.spend();checked++;
      const prior=cyclic(original,id,original.nodesById,noParents);
      const proposed=cyclic(original,id,positions,noParents);
      const normalized=cyclic(rebuilt,id,rebuilt.nodesById,parentByChild);
      const geometry=!equalOrder(prior,proposed),split=!equalOrder(proposed,normalized),final=!equalOrder(prior,normalized);
      if(geometry)geometryChanged++;
      if(split)splitChanged++;
      if(final)finalChanged++;
      if(geometry||split||final){
        b.spend();changes.push({nodeId:id,role:selectedNodes.has(id)?'selected':requested.has(id)?'adaptive-neighbor':fixed.has(id)?'protected-anchor':'stationary',
          degree:prior.length,geometry,split,final,prior,proposed,normalized,
          originalPoint:point(original.nodesById.get(id)),proposedPoint:point(positions.get(id))});
      }
    }
    result.rotationDiagnostic={authority:'none',policy:combined||holdout?'required':'observation-only',checked,geometryChanged,splitChanged,finalChanged,changes};
    aresReplayJson(result.rotationDiagnostic,b);
    if(combined||holdout)need(finalChanged===0,'cyclic-parent-order-changed');
    if(plazaException){
      // Plaza geometry/edge records and original parent-bearing incidence
      // must remain identical; existing frontage/access ownership is not
      // certified by a road-only candidate.
      for(const id of square){b.spend();need(equalP5GraphRecord(original.nodesById.get(id),rebuilt.nodesById.get(id),b),'plaza-vertex-changed');
        need(equalOrder(cyclic(original,id,original.nodesById,noParents),cyclic(rebuilt,id,rebuilt.nodesById,parentByChild)),'plaza-parent-incidence-changed');}
      let protectedRoads=0;
      for(const r of roads){b.spend();if(!r.plaza)continue;protectedRoads++;need(!parts.has(r.id)&&equalP5GraphRecord(r,rebuilt.roadsById.get(r.id),b),'plaza-road-changed');}
      result.plazaPreservation={vertices:square.size,protectedRoads,exceptedAnchors:[...usedExceptions].sort(riCompare),geometry:'unchanged',parentIncidence:'unchanged',landAccess:'not-verified'};
    }
    if(lock.hub){result.hub=auditAdaptiveHub(city,candidate,lock.hub,b);need(result.hub.status==='hub-verified','adaptive-hub:'+result.hub.reason);}
    const identityLedger=inspectP5IdentityLedger({kind:coordinated&&!expected.length?'translation':'split',original:city,candidate,
      splitChains:expected.map(l=>({parent:l.parent,children:l.children.map(x=>x.id)}))},b);
    need(identityLedger.status==='complete','identity-ledger:'+identityLedger.reason);
    // All non-road/non-node collections remain identical by construction.
    for(const k of Object.keys(city)){b.spend();if(k!=='nodes'&&k!=='roads')need(candidate[k]===city[k],'outside-graph-change');}
    const landscape=createAresLandscapeSegmentObserver(city,b),defense=createAresDefenseSegmentObserver(city,b);
    const affected=roads.filter(r=>moved.has(r.id)||parts.has(r.id));b.spend(Math.max(1,roads.length));
    for(const road of affected){
      b.spend();const a=point(original.nodesById.get(road.a)),c=point(original.nodesById.get(road.b)),p=point(positions.get(road.a)),q=point(positions.get(road.b));
      need(contained(p,q,city.survey.boundary,b),'boundary-escape');
      const segment={ref:createSpatialRef({collection:'roads',id:road.id}),endpointRefs:[road.a,road.b].map(id=>createSpatialRef({collection:'nodes',id})),old:{a,b:c},proposed:{a:p,b:q}};
      // Original parent corridor spans the union of all split children.
      // Recheck each child's outline too; preserve road kind/width by lineage.
      for(const child of parts.get(road.id)??[]){b.spend();need(contained(rebuilt.nodesById.get(child.a),rebuilt.nodesById.get(child.b),city.survey.boundary,b),'child-boundary');}
      for(const phase of moved.has(road.id)?['final','swept']:['final']){
        b.spend();const items=[...landscape.observe(f.context,result.source,segment,phase,b),defense.observe(f.context,result.source,segment,phase,b).constraint];
        need(items.length===3,'constraint-inventory');
        for(const item of items){
          b.spend();if(phase==='final')result.finalChecks++;else result.sweptChecks++;
          if(item.summary!=='observed-satisfied')(phase==='final'?result.finalBlockers:result.sweptUnresolved).push(item);
        }
      }
    }
    need(result.finalChecks===3*affected.length&&result.sweptChecks===3*moved.size,'constraint-coverage');
    need(aresReplayJson(f.project,b)===before,'source-mutated');
    aresReplayJson(result,b);
    if(result.finalBlockers.length){result.status='rejected';result.reason='final-constraint-blocked';}
    else{result.status='topology-final-verified';result.reason=result.sweptUnresolved.length?'swept-unresolved':null;result.identityLedger=identityLedger;}
  }catch(e){
    if(e instanceof Rejected){result.status='rejected';result.reason=e.message;}
    else if(e instanceof LareBudgetExceeded){result.status='unverified';result.reason='work-limit';}
    else throw e;
  }
  return finish();
}
