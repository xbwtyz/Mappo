import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { WaterEditor } from '../src/editor/water.js';
import { TerrainEditor } from '../src/editor/terrain.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../src/core/road-group-b1.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget, spatialRefKey } from '../src/core/spatial-recovery-contract.js';
import { discoverAresIntegratedScope, verifyAresOutsideScope } from '../src/core/ares-adaptation-scope.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
import { APP_VERSION } from '../src/core/version.js';

const base=createProject({seed:'mountains',morphology:'organic'});
const water=new WaterEditor();
water.generateCoastline(base.options.boundary,base.options.center,{seed:'mountains',direction:'east'});
water.generate(base.options.boundary,base.options.center,{seed:'mountains',width:24});
water.generateLakeDraft(base.options.boundary,base.options.center,{seed:'mountains',radius:18});
const wet=createProject({...base.options,seed:base.seed,water:water.definition()});
const terrain=new TerrainEditor();
terrain.generate(base.options.boundary,base.options.center,{seed:'mixed-mountains',placement:'inside',size:40,
  water:{features:wet.city.waterFeatures,bridges:wet.city.bridges}});
const mixed=createProject({...wet.options,seed:wet.seed,water:water.definition(),terrain:terrain.definition(),fortifications:{enabled:true}});
validateStoredProject(mixed);
const dry=createProject({seed:'ares-p2-planned',size:'small',morphology:'planned'});
function fixture(p){
  const graph=buildRoadGraph(p.city);
  for(const incident of graph.incidentRoads.values())for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
    const ids=[incident[i],incident[j]];
    if(resolveRoadGroupB1(graph,ids).eligible){
      const road=graph.roadsById.get(ids[0]),a=graph.nodesById.get(road.a),b=graph.nodesById.get(road.b);
      return {p,ids,mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
    }
  }
  throw Error('No eligible roads.');
}
const f=fixture(mixed),d=fixture(dry),limits={maxObjects:10000,maxHops:8};
const budget=()=>createSpatialPreservationBudget();
const ctx=(f,offset,permissions={})=>({version:1,sourceVersion:APP_VERSION,sessionId:'p2-d3',
  operation:normalizeSpatialRoadGroup(f.p,7,f.ids,offset,permissions)});
const run=(f,offset,permissions={},l=limits,b=budget())=>discoverAresIntegratedScope(f.p,ctx(f,offset,permissions),l,b);
const offsetTo=(f,p)=>({x:p.x-f.mid.x,y:p.y-f.mid.y});
const river=mixed.city.waterFeatures.find(f=>f.kind==='river');
const intoRiver=offsetTo(f,river.path[Math.floor(river.path.length/2)]);
test('P2 integrated mixed-landscape contacts bind exact source and count protected roots without write rights',async()=>{
  const before=aresReplayJson(mixed),s=await run(f,intoRiver,{destruction:true,regeneration:true}),feedback=s.constraintFeedback;
  assert.ok(['constraint-blocked','protected-blocker'].includes(s.status));
  assert.deepEqual(s.reviewRefs,[]);
  assert.equal(feedback.providers.length,3);
  assert.ok(feedback.finalViolations.some(e=>e.provider==='ares-water'&&e.refs.some(r=>r.id===river.id)));
  for(const r of feedback.contactRefs)assert.ok(s.entries.some(e=>spatialRefKey(e.ref)===spatialRefKey(r)));
  assert.ok(s.entries.some(e=>e.ref.id===river.id&&e.role==='protected'));
  assert.ok(feedback.finalViolations.every(e=>e.query.snapshotFingerprint===s.snapshotFingerprint));
  assert.ok(feedback.sweptCandidates.every(e=>e.query.phase==='swept'&&e.row.outcome==='unknown'));
  assert.equal(aresReplayJson(mixed),before);
  assert.ok(Object.isFrozen(feedback.finalViolations));
  assert.deepEqual(s,await run(f,intoRiver,{destruction:true,regeneration:true}));
});
test('P2 integrated defense contact preserves measurements, wall ownership and no automatic escalation',async()=>{
  const tower=mixed.city.towers[0],offset=offsetTo(f,tower.center),s=await run(f,offset,{destruction:true});
  const found=s.constraintFeedback.finalViolations.find(e=>e.provider==='ares-defense'&&e.refs.some(r=>r.id===tower.id));
  assert.ok(found);assert.ok(found.measurements.some(m=>m.code==='tower-clearance'&&m.newDistance<m.requiredDistance));
  assert.ok(s.entries.some(e=>e.ref.id===tower.id&&e.role==='protected'));
  assert.ok(s.entries.some(e=>e.ref.id===tower.wallId&&e.role==='protected'));
  assert.deepEqual(s.reviewRefs,[]);
});
test('P2 integrated contact scope limits retain unresolved refs and refuse preservation qualification',async()=>{
  const s=await run(f,intoRiver,{}, {maxObjects:1,maxHops:0});
  assert.equal(s.status,'scope-limited');assert.ok(s.entries.length<=1);
  assert.deepEqual(s.reviewRefs,[]);assert.ok(s.unresolvedRefs.length);
  assert.ok(s.constraintFeedback.finalViolations.length);
  await assert.rejects(()=>verifyAresOutsideScope(mixed,JSON.parse(aresReplayJson(mixed)),s,ctx(f,intoRiver),budget()),/scope required/);
});
test('P2 integrated dry control permits scope-only verification but rejects unrelated persisted changes',async()=>{
  const offset={x:.001,y:0},s=await run(d,offset),c=ctx(d,offset);
  assert.equal(s.status,'observed');assert.deepEqual(s.constraintFeedback.finalViolations,[]);
  const candidate=JSON.parse(aresReplayJson(dry));
  assert.equal((await verifyAresOutsideScope(dry,candidate,s,c,budget())).status,'outside-scope-preserved');
  candidate.city.name+=' altered';
  assert.equal((await verifyAresOutsideScope(dry,candidate,s,c,budget())).status,'outside-scope-changed');
  await assert.rejects(()=>verifyAresOutsideScope(dry,candidate,s,ctx(d,{x:.002,y:0}),budget()),/Stale/);
});
test('P2 integration uses one shared budget and refuses protected preflight without evidence leakage',async()=>{
  await assert.rejects(()=>run(f,intoRiver,{},limits,createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
  const bridge=mixed.city.roads.find(r=>r.bridgeId);
  const blocked=await run({...f,ids:[bridge.id,...f.ids]},{x:1,y:0},{destruction:true});
  assert.equal(blocked.status,'preflight-refused');assert.deepEqual(blocked.reviewRefs,[]);
  assert.deepEqual(blocked.constraintFeedback.finalViolations,[]);
});
