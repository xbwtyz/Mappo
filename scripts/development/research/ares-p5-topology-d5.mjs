import {createHash} from 'node:crypto';
import {materializeD4Control} from './ares-p5-topology-d4.mjs';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {iterateRoadGraph,classifyRoad} from '../../../src/core/road-graph.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
import {segmentCuts} from '../../../src/core/boundary.js';

// Independent synthetic D5 verification. Share only immutable fixture input
// and authoritative domain predicates, never constructor decisions.
class Reject extends Error{}
const need=(v,code)=>{if(!v)throw new Reject(code);};
const same=(a,c)=>a&&c&&Object.is(a.x,c.x)&&Object.is(a.y,c.y);
const fields=(r,allowed,b)=>{const k=Object.keys(r);b.spend(Math.max(1,k.length));return k.every(x=>allowed.includes(x));};
function graph(city,b){
  b.spend(Math.max(1,city.nodes.length+city.roads.length));
  const it=iterateRoadGraph(city);let paid=0;
  try{for(;;){const step=it.next();if(step.done){if(step.value.work>paid)b.spend(step.value.work-paid);return step.value;}
    if(step.value.stage==='road-graph-intersections'){b.spend(64);paid+=64;}else b.spend();
  }}finally{it.return();}
}
export function auditD4Control(id,permission,evidence){
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768}),f=materializeD4Control(id);
  const before=aresReplayJson(f,b);b.spend(Math.max(1,Math.ceil(Buffer.byteLength(before)/64)));
  const source=createHash('sha256').update(before).digest('hex');
  const finish=(status,reason,extra={})=>riFreeze({version:1,id,source,status,reason,authority:'none',cityRecovery:false,...extra,stats:b.snapshot()});
  const eq=(a,c)=>aresReplayJson(a,b)===aresReplayJson(c,b);
  try{
    const required=['mode','intersection','split','merge','overlap'];
    need(permission&&[Object.prototype,null].includes(Object.getPrototypeOf(permission))&&Reflect.ownKeys(permission).length===required.length&&
      required.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(permission,k)??{},'value'))&&
      permission.mode==='restructure'&&permission.intersection===true&&permission.merge===true&&
      typeof permission.split==='boolean'&&typeof permission.overlap==='boolean','permission');
    const original=graph(f.city,b);need(original.valid,'source-graph');
    const keep=f.intent.id,retire=f.retire,byId=new Map(f.city.nodes.map(n=>[n.id,n]));
    need(keep!==retire&&same(f.intent.point,byId.get(retire)),'not-exact-coincidence');
    need([keep,retire].every(n=>f.generatedNodes.includes(n)),'unknown-authorship');
    need([keep,retire].every(n=>fields(byId.get(n),['id','x','y'],b)),'opaque-node');
    need(!f.externalRefs.some(n=>n===keep||n===retire),'external-dependency');
    const terminal=new Set(original.terminalRoadIds),incident=[],closure=new Set([keep,retire]);
    for(const road of f.city.roads){
      b.spend();if(![road.a,road.b].some(n=>n===keep||n===retire))continue;
      incident.push(road);closure.add(road.a);closure.add(road.b);
      need(!classifyRoad(road).protected&&!terminal.has(road.id),'protected-road');
      need(f.generatedRoads.includes(road.id),'unknown-authorship');
      need(f.admittedRoads.includes(road.id),'outside-scope');
      need(fields(road,['id','a','b','kind'],b),'opaque-road');
    }
    need([...closure].every(n=>f.admittedNodes.includes(n)),'outside-scope');
    const translate=n=>n.id===keep?{...n,...f.intent.point}:{...n};
    const positions=new Map(f.city.nodes.map(n=>[n.id,translate(n)]));
    const replacement=id=>id===retire?keep:id;
    const pairs=new Set(),roads=[],lineage=[];
    for(const road of f.city.roads){
      b.spend();const next={...road,a:replacement(road.a),b:replacement(road.b)};
      need(next.a!==next.b,'would-collapse-road');
      const k=JSON.stringify([next.a,next.b].sort(riCompare));need(!pairs.has(k),'would-duplicate-edge');pairs.add(k);
      if(next.a!==road.a||next.b!==road.b)lineage.push({roadId:road.id,from:[road.a,road.b],to:[next.a,next.b]});
      roads.push(next);
    }
    // Independently enumerate all original translated road pairs. Any
    // contact beyond shared endpoints or the exact target pair is held.
    let distinct=0;
    for(let i=0;i<f.city.roads.length;i++)for(let j=i+1;j<f.city.roads.length;j++){
      b.spend(17);const x=f.city.roads[i],y=f.city.roads[j],a=[x.a,x.b],c=[y.a,y.b];
      const ab=segmentCuts(...[...a,...c].map(n=>positions.get(n))),ba=segmentCuts(...[...c,...a].map(n=>positions.get(n)));
      if(!ab.length&&!ba.length)continue;
      need(![...ab,...ba].some(t=>t>1e-9&&t<1-1e-9),'overlap-or-interior');
      if(a.some(n=>c.includes(n)))continue;
      need(ab.length&&ba.length&&((a.includes(keep)&&c.includes(retire))||(a.includes(retire)&&c.includes(keep))),'other-contact');
      distinct++;
    }
    need(distinct>0,'missing-contact');
    const city={nodes:[...positions.values()].filter(n=>n.id!==retire),roads},final=graph(city,b);
    need(final.valid&&final.components.length===1&&final.nodesById.size===original.nodesById.size-1&&final.roadsById.size===original.roadsById.size&&!final.nodesById.has(retire),'final-graph');
    for(const n of f.city.nodes){b.spend();if(n.id!==retire)need(same(final.nodesById.get(n.id),positions.get(n.id)),'node-preservation');}
    for(const road of roads){
      b.spend();const n=final.roadsById.get(road.id);
      need(n&&Object.keys(n).length===Object.keys(road).length&&Object.keys(road).every(k=>Object.is(road[k],n[k])),'road-preservation');
    }
    const expected={intent:f.intent,junctionLineage:{retired:retire,survives:keep,point:f.intent.point},roadLineage:lineage,
      retainedRoadIds:f.city.roads.map(e=>e.id),graph:{nodes:final.nodesById.size,roads:final.roadsById.size,components:final.components.length}};
    need(evidence&&evidence.id===id&&evidence.source===source&&evidence.status==='graph-control-candidate'&&evidence.authority==='none'&&evidence.independentlyVerified===false&&evidence.cityRecovery===false&&evidence.attempts===1,'witness-source');
    need(eq(evidence.witness,expected),'witness-lineage');
    need(aresReplayJson(f,b)===before,'source-mutated');
    return finish('graph-control-verified',null,{contacts:distinct,retainedRoads:roads.length,retiredJunctions:1});
  }catch(e){if(e instanceof Reject)return finish('rejected',e.message);if(e instanceof LareBudgetExceeded)return finish('unverified',e.resource);throw e;}
}
