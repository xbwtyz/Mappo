import {createHash} from 'node:crypto';
import {iterateRoadGraph,classifyRoad} from '../../../src/core/road-graph.js';
import {segmentCuts} from '../../../src/core/boundary.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
import {p5Permissions,P5_LIMITS} from './ares-p5-topology-contract.mjs';

// D3/D4 synthetic generated graph controls ONLY. These are not city
// fixtures, persistence, provenance for user records or recovery evidence.
// No caller-provided graph, coordinates, identities or scope.
export const D4_IDS=Object.freeze(['exact','exact-reversed','near','protected','unknown','opaque','collapse','duplicate','dependency','scope']);
const point=(id,x,y)=>({id,x,y});
const road=(id,a,b)=>({id,a,b,kind:'lane'});
const same=(a,b)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y);
export function materializeD4Control(id){
  if(!D4_IDS.includes(id))throw Error('Frozen D4 control required.');
  const keep=id==='exact-reversed'?'A':'B',retire=keep==='A'?'B':'A';
  const nodes=[point('A',0,0),point('B',2,0),point('L',-4,0),point('U',-2,4),point('R',6,0),point('V',4,4)];
  let roads=[road('R1','A','L'),road('R2','L','U'),road('R3','U','A'),road('R4','B','R'),road('R5','R','V'),road('R6','V','B'),road('R7','U','V')];
  if(id==='collapse')roads.push(road('R8','A','B'));
  if(id==='duplicate'){
    // Two triangles sharing U; a merge would duplicate A-U/B-U.
    nodes.splice(nodes.findIndex(n=>n.id==='V'),1);
    roads=roads.filter(r=>r.id!=='R7').map(r=>({...r,a:r.a==='V'?'U':r.a,b:r.b==='V'?'U':r.b}));
  }
  if(id==='protected')roads[0].boundary=true;
  if(id==='opaque')nodes.find(n=>n.id===retire).custom='keep';
  const target=nodes.find(n=>n.id===retire);
  const intent={id:keep,point:{x:target.x+(id==='near'?1e-8:0),y:target.y}};
  return riFreeze({version:1,id,city:{nodes,roads},intent,retire,
    // Fixture-owned identity inventory; never a claim about saved cities.
    generatedNodes:nodes.map(n=>n.id).filter(n=>id!=='unknown'||n!==retire),
    generatedRoads:roads.map(r=>r.id),
    admittedNodes:nodes.map(n=>n.id),admittedRoads:roads.map(r=>r.id).filter(n=>id!=='scope'||n!=='R1'),
    externalRefs:id==='dependency'?[retire]:[]});
}
function graph(city,b){
  b.spend(Math.max(1,city.nodes.length+city.roads.length));const it=iterateRoadGraph(city);let paid=0;
  try{for(;;){const step=it.next();if(step.done){if(step.value.work>paid)b.spend(step.value.work-paid);return step.value;}
    if(step.value.stage==='road-graph-intersections'){b.spend(64);paid+=64;}else b.spend();
  }}finally{it.return();}
}
const keys=(r,allowed,b)=>{for(const k of Object.keys(r)){b.spend();if(!allowed.includes(k))return false;}return true;};
export function constructD4Control(id,input){
  const permissions=p5Permissions(input),b=createSpatialPreservationBudget({work:P5_LIMITS.work,stateExpansions:P5_LIMITS.stateExpansions});
  const f=materializeD4Control(id),before=aresReplayJson(f,b);b.spend(Math.max(1,Math.ceil(Buffer.byteLength(before)/64)));
  const source=createHash('sha256').update(before).digest('hex');
  let attempts=0;
  const finish=(status,reason,extra={})=>riFreeze({version:1,id,source,status,reason,attempts,authority:'none',
    independentlyVerified:false,cityRecovery:false,...extra,stats:b.snapshot()});
  try{
    if(permissions.mode!=='restructure'||!permissions.intersection||!permissions.merge)return finish('refused','permission');
    const original=graph(f.city,b);
    if(!original.valid)return finish('refused','source-graph',{issues:original.issues});
    const keep=f.intent.id,retire=f.retire,retired=original.nodesById.get(retire),kept=original.nodesById.get(keep);
    if(!same(f.intent.point,retired))return finish('refused','not-exact-coincidence');
    if(![keep,retire].every(n=>f.generatedNodes.includes(n)))return finish('refused','unknown-authorship');
    if(![kept,retired].every(n=>keys(n,['id','x','y'],b)))return finish('refused','opaque-node');
    if(f.externalRefs.some(n=>n===keep||n===retire))return finish('refused','external-dependency');
    const incident=new Set([...original.incidentRoads.get(keep),...original.incidentRoads.get(retire)]);
    const terminal=new Set(original.terminalRoadIds),closure=new Set([keep,retire]);
    for(const rid of incident){
      b.spend();const e=original.roadsById.get(rid);closure.add(e.a);closure.add(e.b);
      if(classifyRoad(e).protected||terminal.has(rid))return finish('refused','protected-road');
      if(!f.generatedRoads.includes(rid))return finish('refused','unknown-authorship');
      if(!f.admittedRoads.includes(rid))return finish('refused','outside-scope');
      if(!keys(e,['id','a','b','kind'],b))return finish('refused','opaque-road');
    }
    if([...closure].some(n=>!f.admittedNodes.includes(n)))return finish('refused','outside-scope');
    const translated=f.city.nodes.map(n=>{b.spend();return n.id===keep?{...n,...f.intent.point}:{...n};});
    const draft={nodes:translated,roads:f.city.roads},positions=new Map(translated.map(n=>[n.id,n]));
    const edgeKeys=new Set(),lineage=[],next=[];
    // Complete prospective edge inventory BEFORE any candidate attempt.
    for(const e of f.city.roads){
      b.spend();const a=e.a===retire?keep:e.a,c=e.b===retire?keep:e.b;
      if(a===c)return finish('refused','would-collapse-road');
      const k=JSON.stringify([a,c].sort(riCompare));
      if(edgeKeys.has(k))return finish('refused','would-duplicate-edge');
      edgeKeys.add(k);const record={...e,a,b:c};next.push(record);
      if(a!==e.a||c!==e.b)lineage.push({roadId:e.id,from:[e.a,e.b],to:[a,c]});
    }
    // Refuse all non-target contacts in the translated graph.
    const g=graph(draft,b);
    if(!g.issues.length)return finish('refused','missing-contact');
    for(const issue of g.issues){
      b.spend();
      if(issue.code!=='unnormalized-crossing'||issue.roadIds.length!==2)return finish('refused','other-contact',{issues:g.issues});
      const [x,y]=issue.roadIds.map(r=>original.roadsById.get(r));
      const xe=[x.a,x.b],ye=[y.a,y.b];
      if(!((xe.includes(keep)&&ye.includes(retire))||(xe.includes(retire)&&ye.includes(keep))))return finish('refused','other-contact');
      const ab=segmentCuts(...[...xe,...ye].map(n=>positions.get(n))),ba=segmentCuts(...[...ye,...xe].map(n=>positions.get(n)));
      if(!ab.length||!ba.length||[...ab,...ba].some(t=>t>1e-9&&t<1-1e-9))return finish('refused','overlap-or-interior');
    }
    b.expand();attempts=1;
    const candidate={nodes:translated.filter(n=>n.id!==retire),roads:next},final=graph(candidate,b);
    if(!final.valid)return finish('refused','final-graph',{issues:final.issues});
    if(final.nodesById.size!==original.nodesById.size-1||final.roadsById.size!==original.roadsById.size||
      final.nodesById.has(retire)||!same(final.nodesById.get(keep),f.intent.point))return finish('refused','identity-inventory');
    for(const e of f.city.roads){
      b.spend();const n=final.roadsById.get(e.id);
      if(!n||n.kind!==e.kind||n.a!==(e.a===retire?keep:e.a)||n.b!==(e.b===retire?keep:e.b))return finish('refused','road-preservation');
    }
    for(const n of f.city.nodes){
      b.spend();if(n.id!==retire&&!same(final.nodesById.get(n.id),n.id===keep?f.intent.point:n))return finish('refused','node-preservation');
    }
    if(aresReplayJson(f,b)!==before)throw Error('D4 control mutated.');
    const witness={intent:f.intent,junctionLineage:{retired:retire,survives:keep,point:f.intent.point},roadLineage:lineage,
      retainedRoadIds:f.city.roads.map(e=>e.id),graph:{nodes:final.nodesById.size,roads:final.roadsById.size,components:final.components.length}};
    aresReplayJson(witness,b);
    return finish('graph-control-candidate','independent-audit-pending',{witness});
  }catch(e){if(e instanceof LareBudgetExceeded)return finish('work-limit',e.resource);throw e;}
}
