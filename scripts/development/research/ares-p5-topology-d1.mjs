import {createHash} from 'node:crypto';
import {enumerateGSlots} from './ares-p4-g-corpus.mjs';
import {G_LOCKED_INVENTORY,lockedRtreCase,materializeLockedRtreCase} from './ares-rtre-locked-recipes.mjs';
import {classifyP5Contact,p5Permissions,p5PermissionReasons,P5_LIMITS} from './ares-p5-topology-contract.mjs';
import {inspectFreshRtreNeighborhood} from './ares-rtre-fresh-neighborhood.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {classifyRoad} from '../../../src/core/road-graph.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';

// D1 census only, no node/road identity changes or candidate dispatch.
// Frozen intent slots, including explicit unavailable rows. The same
// existing root meters pair enumeration and conditional closure inspection.
export const D1_SLOTS=riFreeze(enumerateGSlots().map(s=>{
  const group=G_LOCKED_INVENTORY.rows.find(r=>r.id===s.city)?.groups.find(g=>g.id===s.group);
  if(!group)throw Error('Missing frozen D1 group.');
  return {id:'g:'+s.id,city:s.city,selection:group.status};
}));
const inventory=new Map(D1_SLOTS.map(s=>[s.id,s]));
const order=(a,b)=>riCompare(a.id,b.id);
const identical=(a,b)=>a&&b&&Object.is(a.x,b.x)&&Object.is(a.y,b.y);
const nodeFields=new Set(['id','x','y']);
const roadFields=new Set('id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary'.split(' '));
const known=(row,fields,b)=>{for(const k of Object.keys(row)){b.spend();if(!fields.has(k))return false;}return true;};
export async function censusP5SpecialContacts(caseId,input){
  const permissions=p5Permissions(input),slot=inventory.get(caseId);
  if(!slot)throw Error('Frozen P5 D1 slot required.');
  const b=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
  const r={version:1,caseId,selection:slot.selection,status:'unverified',source:null,
    authority:'none',topologyChanged:false,permissions,requestedCount:0,comparisons:0,
    counts:{'interior-interior':0,'endpoint-interior':0,'endpoint-endpoint':0,overlap:0,indeterminate:0},
    special:[]};
  const finish=()=>riFreeze({...r,stats:b.snapshot()});
  if(slot.selection!=='selected'){r.status=slot.selection;return finish();}
  try{
    const lock=lockedRtreCase(caseId),f=materializeLockedRtreCase(caseId),city=f.project.city;
    const before=aresReplayJson(f.project,b),bytes=Buffer.from(before,'utf8');
    b.spend(Math.max(1,Math.ceil(bytes.length/64)));r.source=createHash('sha256').update(bytes).digest('hex');
    if(r.source!==lock.source)throw Error('D1 source identity changed.');
    const nodes=new Map(city.nodes.map(n=>[n.id,n])),roads=[...city.roads].sort(order),
      byRoad=new Map(roads.map(e=>[e.id,e])),incident=new Map(city.nodes.map(n=>[n.id,[]]));
    b.spend(Math.max(1,nodes.size+roads.length*Math.ceil(Math.log2(roads.length+1))));
    const selected=new Set(f.context.operation.editedRefs.map(x=>x.id)),requested=new Map(),offset=f.context.operation.geometry.offset;
    for(const road of roads){
      b.spend();incident.get(road.a).push(road.id);incident.get(road.b).push(road.id);
      if(selected.has(road.id))for(const id of [road.a,road.b]){
        b.spend();const n=nodes.get(id);requested.set(id,{x:offset.x===0?n.x:n.x+offset.x,y:offset.y===0?n.y:n.y+offset.y});
      }
    }
    r.requestedCount=requested.size;
    const at=id=>requested.get(id)??nodes.get(id),changed=roads.filter(e=>requested.has(e.a)||requested.has(e.b));
    b.spend(Math.max(1,roads.length));
    const moved=new Set(changed.map(e=>e.id));
    for(const a of changed)for(const c of roads){
      b.spend();if(a.id===c.id||moved.has(c.id)&&riCompare(a.id,c.id)>0)continue;
      r.comparisons++;
      const [x,y,z,w]=[at(a.a),at(a.b),at(c.a),at(c.b)];
      if(Math.max(x.x,y.x)+1e-6<Math.min(z.x,w.x)||Math.max(z.x,w.x)+1e-6<Math.min(x.x,y.x)||
        Math.max(x.y,y.y)+1e-6<Math.min(z.y,w.y)||Math.max(z.y,w.y)+1e-6<Math.min(x.y,y.y))continue;
      b.spend(16);
      const pair=riCompare(a.id,c.id)<0?[a,c]:[c,a],endpoints=pair.flatMap(e=>[e.a,e.b]);
      const contact=classifyP5Contact(...endpoints.map(at));
      if(contact.kind==='none')continue;
      const shared=[a.a,a.b].some(id=>id===c.a||id===c.b);
      // A normal shared endpoint already has one identity. It is not
      // a request for consolidation. Overlap/indeterminate remain visible.
      if(shared&&contact.kind==='endpoint-endpoint')continue;
      r.counts[contact.kind]++;
      if(contact.kind==='interior-interior')continue;
      const exactPairs=[];
      for(const i of endpoints.slice(0,2))for(const j of endpoints.slice(2)){
        b.spend();if(i!==j&&identical(at(i),at(j)))exactPairs.push([i,j].sort(riCompare));
      }
      const reasons=[...p5PermissionReasons(permissions,contact)];
      if(contact.kind==='endpoint-endpoint'&&exactPairs.length!==1)reasons.push('distinct-exact-identity-required');
      const closureNodes=new Set(endpoints),closureRoads=new Set(pair.map(e=>e.id));
      // Full incident inventory for distinct coincident identities. Detect
      // prospective self-loops/parallel duplicate edges without editing.
      let collapse=[],duplicate=[];
      if(exactPairs.length===1){
        const [keep,retire]=exactPairs[0];
        for(const id of [keep,retire])for(const rid of incident.get(id)){
          b.spend();closureRoads.add(rid);const e=byRoad.get(rid);closureNodes.add(e.a);closureNodes.add(e.b);
        }
        const edges=new Map();
        for(const rid of closureRoads){
          b.spend();const e=byRoad.get(rid),ids=[e.a===retire?keep:e.a,e.b===retire?keep:e.b].sort(riCompare);
          if(ids[0]===ids[1])collapse.push(rid);
          const key=JSON.stringify(ids);if(edges.has(key))duplicate.push([edges.get(key),rid]);else edges.set(key,rid);
        }
        if(collapse.length)reasons.push('would-collapse-road');
        if(duplicate.length)reasons.push('would-duplicate-edge');
      }
      r.special.push({roadIds:pair.map(e=>e.id),contact,exactPairs,closureNodes:[...closureNodes].sort(riCompare),
        closureRoads:[...closureRoads].sort(riCompare),collapse,duplicate,reasons});
    }
    if(r.special.length){
      const report=await inspectFreshRtreNeighborhood(caseId,{mode:'adaptive',maxObjects:P5_LIMITS.maxObjects,maxHops:P5_LIMITS.maxHops},b);
      if(report.snapshotFingerprint!==r.source||aresReplayJson(report.context,b)!==aresReplayJson(f.context,b))throw Error('D1 closure source mismatch.');
      const admitted=new Map(report.entries.map(e=>[e.ref.collection+':'+e.ref.id,e]));
      const eligible=new Set(report.eligibleJunctions.map(e=>e.ref.id));
      b.spend(Math.max(1,admitted.size+eligible.size));
      for(const s of r.special){
        b.spend();
        if(!['research-eligible','no-eligible-neighbors'].includes(report.status))s.reasons.push('mandatory-preflight-refused');
        for(const id of s.closureRoads){
          b.spend();const e=byRoad.get(id),scope=admitted.get('roads:'+id);
          if(!scope||scope.depth>P5_LIMITS.maxHops)s.reasons.push('outside-scope-road:'+id);
          if(classifyRoad(e).protected)s.reasons.push('protected-road:'+id);
          if(!known(e,roadFields,b))s.reasons.push('opaque-road:'+id);
        }
        for(const id of s.closureNodes){
          b.spend();const scope=admitted.get('nodes:'+id);
          if(!scope||scope.depth>P5_LIMITS.maxHops)s.reasons.push('outside-scope-node:'+id);
          if(scope?.role==='protected-anchor'||(!requested.has(id)&&!eligible.has(id))||(city.plaza?.vertices??[]).includes(id))s.reasons.push('unqualified-node:'+id);
          if(!known(nodes.get(id),nodeFields,b))s.reasons.push('opaque-node:'+id);
        }
        s.reasons=[...new Set(s.reasons)].sort(riCompare);
      }
    }
    if(aresReplayJson(f.project,b)!==before)throw Error('D1 source mutated.');
    r.status='observed';aresReplayJson(r,b);
  }catch(e){
    if(e instanceof LareBudgetExceeded){r.status='work-limit';r.special=[];}
    else throw e;
  }
  return finish();
}
