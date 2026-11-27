import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { WaterEditor } from '../src/editor/water.js';
import { TerrainEditor } from '../src/editor/terrain.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../src/core/road-group-b1.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { discoverAresLandscape } from '../src/core/ares-landscape-observation.js';
import { waterSetContains, waterSetBoundary, waterSetIntervals } from '../src/core/water-geometry.js';
import { APP_VERSION } from '../src/core/version.js';
const base=createProject({seed:'mountains',morphology:'organic'});
function mixed(){
  const water=new WaterEditor();
  water.generateCoastline(base.options.boundary,base.options.center,{seed:'mountains',direction:'east'});
  water.generate(base.options.boundary,base.options.center,{seed:'mountains',width:24});
  water.generateLakeDraft(base.options.boundary,base.options.center,{seed:'mountains',radius:18});
  const wet=createProject({...base.options,seed:base.seed,water:water.definition()});
  const terrain=new TerrainEditor();
  terrain.generate(base.options.boundary,base.options.center,{seed:'mixed-mountains',placement:'inside',size:40,
    water:{features:wet.city.waterFeatures,bridges:wet.city.bridges}});
  const p=createProject({...wet.options,seed:wet.seed,water:water.definition(),terrain:terrain.definition(),fortifications:{enabled:true}});
  validateStoredProject(p);return p;
}
const p=mixed(),g=buildRoadGraph(p.city);
let ids;
outer:for(const incident of g.incidentRoads.values())for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
  const pair=[incident[i],incident[j]];if(resolveRoadGroupB1(g,pair).eligible){ids=pair;break outer;}
}
const context=(project,selected,offset,permissions={})=>({version:1,sessionId:'p2-d1',sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(project,7,selected,offset,permissions)});
const budget=()=>createSpatialPreservationBudget();
const run=(project,selected,offset,permissions={})=>discoverAresLandscape(project,context(project,selected,offset,permissions),budget());
function offsetTo(target){
  const road=g.roadsById.get(ids[0]),a=g.nodesById.get(road.a),b=g.nodesById.get(road.b);
  return {x:target.x-(a.x+b.x)/2,y:target.y-(a.y+b.y)/2};
}
test('P2 real mixed water and terrain providers retain typed crossing ownership and do not mutate city',async()=>{
  const before=JSON.stringify(p),o=await run(p,ids,{x:1,y:0});
  assert.equal(o.status,'observed');assert.equal(o.providers.length,2);
  assert.deepEqual(new Set(p.city.waterFeatures.map(f=>f.kind)),new Set(['river','coast','lake']));
  assert.ok(p.city.terrainFeatures.length);
  for(const bridge of p.city.bridges)assert.ok(o.crossings.some(c=>c.ref.id===bridge.id&&c.featureRef.id===bridge.waterId));
  for(const pass of p.city.terrainPasses)assert.ok(o.crossings.some(c=>c.ref.id===pass.id&&c.featureRef.id===pass.terrainId));
  assert.equal(o.verticalCapability,'unsupported');assert.equal(JSON.stringify(p),before);
  assert.ok(Object.isFrozen(o.evidence));
});
test('P2 exact selected-road requests into real river, lake and mountain corridors report blockers',async()=>{
  for(const f of [p.city.waterFeatures.find(f=>f.kind==='river'),p.city.waterFeatures.find(f=>f.kind==='lake'),p.city.terrainFeatures[0]]){
    const target=f.kind==='river'?f.path[Math.floor(f.path.length/2)]:f.center;
    assert.ok(target);
    const offset=offsetTo(target),o=await run(p,ids,offset,{destruction:true,regeneration:true});
    assert.equal(o.status,'observed');
    const rows=o.evidence.filter(e=>e.query.phase==='final'&&e.query.refs[0].id===ids[0]).flatMap(e=>e.rows);
    assert.ok(rows.some(r=>r.outcome==='violated'&&r.refs.some(r=>r.id===f.id)),f.kind);
    assert.ok(o.evidence.filter(e=>e.query.phase==='swept').every(e=>e.rows.every(r=>r.outcome!=='violated')));
  }
});
test('P2 selected ordinary road midpoint union observations agree with existing landscape validator rules',async()=>{
  const target=p.city.waterFeatures.find(f=>f.kind==='coast').path[2];
  const offset=offsetTo(target),o=await run(p,ids,offset);
  const road=g.roadsById.get(ids[0]),a=g.nodesById.get(road.a),b=g.nodesById.get(road.b);
  const moved=v=>({x:v.x+offset.x,y:v.y+offset.y}),u=moved(a),v=moved(b);
  for(const [provider,features] of [['ares-water',p.city.waterFeatures],['ares-terrain',p.city.terrainFeatures]]){
    const e=o.evidence.find(e=>e.provider.id===provider&&e.query.phase==='final'&&e.query.refs[0].id===ids[0]);
    const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    const expected=waterSetIntervals(u,v,features).some(s=>s.inside&&!waterSetBoundary(mid(s.a,s.b),features))||
      (waterSetContains(mid(u,v),features)&&!waterSetBoundary(mid(u,v),features));
    assert.equal(e.summary==='blocked',expected);
  }
});
test('P2 protected bridge selection is refused; no ordinary crossing exception or automatic authority',async()=>{
  const bridge=p.city.roads.find(r=>r.bridgeId);
  assert.ok(bridge);
  const o=await run(p,[bridge.id,...ids],{x:1,y:0},{destruction:true});
  assert.equal(o.status,'preflight-refused');assert.deepEqual(o.evidence,[]);assert.ok(o.diagnostics.length);
});
test('P2 dry city reports no reserved-corridor overlap; shared budget failure does not publish evidence',async()=>{
  const dry=createProject({seed:'ares-p2-planned',size:'small',morphology:'planned'}),graph=buildRoadGraph(dry.city);
  let pair;
  outer:for(const incident of graph.incidentRoads.values())for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
    if(resolveRoadGroupB1(graph,[incident[i],incident[j]]).eligible){pair=[incident[i],incident[j]];break outer;}
  }
  const o=await run(dry,pair,{x:1,y:0});
  assert.ok(o.evidence.length);assert.ok(o.evidence.every(e=>e.summary==='observed-satisfied'));
  await assert.rejects(()=>discoverAresLandscape(dry,context(dry,pair,{x:1,y:0}),
    createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
});
