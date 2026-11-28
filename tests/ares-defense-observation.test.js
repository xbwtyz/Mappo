import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../src/core/road-group-b1.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { discoverAresDefense } from '../src/core/ares-defense-observation.js';
import { solidWallSegments, measureWall, WALL_EDGE_WIDTH } from '../src/core/fortification-geometry.js';
import { gatePosts } from '../src/core/gate-geometry.js';
import { segmentDistance, STREET_WIDTHS, STREET_EDGE_WIDTH } from '../src/core/placement.js';
import { distanceToSegment } from '../src/core/boundary.js';
import { APP_VERSION } from '../src/core/version.js';
const p=createProject({seed:'wall-settings',morphology:'planned',fortifications:{enabled:true}});
validateStoredProject(p);
const g=buildRoadGraph(p.city);
function eligible(graph){
  for(const incident of graph.incidentRoads.values())for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
    const pair=[incident[i],incident[j]];
    if(resolveRoadGroupB1(graph,pair).eligible)return pair;
  }
  throw Error('No eligible roads.');
}
const ids=eligible(g),wall=p.city.walls[0],tower=p.city.towers[0],gate=p.city.gates[0];
const budget=()=>createSpatialPreservationBudget();
const ctx=(project,selected,offset,permissions={})=>({version:1,sessionId:'p2-d2',sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(project,7,selected,offset,permissions)});
const run=(project=p,selected=ids,offset={x:1,y:0},permissions={})=>discoverAresDefense(project,ctx(project,selected,offset,permissions),budget());
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const road=g.roadsById.get(ids[0]),a=g.nodesById.get(road.a),b=g.nodesById.get(road.b);
function offsetTo(target){const m=mid(a,b);return {x:target.x-m.x,y:target.y-m.y};}
function resultFor(o,phase='final'){return o.evidence.find(e=>e.constraint.query.phase===phase&&e.constraint.query.refs[0].id===ids[0]);}
test('P2 defense provider captures actual gate approach anchors and exact detached source',async()=>{
  const before=JSON.stringify(p),o=await run();
  assert.equal(o.status,'observed');assert.equal(o.providers[0].id,'ares-defense');
  assert.equal(o.anchors.length,p.city.gates.length);
  for(const a of o.anchors){
    const gate=p.city.gates.find(g=>g.id===a.ref.id);
    assert.equal(a.wallRef.id,gate.wallId);assert.equal(a.nodeRef.id,gate.connection.cityNodeId);
    assert.deepEqual(a.point,gate.connection.points[0]);
  }
  assert.match(o.snapshotFingerprint,/^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(o.evidence));assert.equal(JSON.stringify(p),before);
});
test('P2 final wall, tower and gatepost violations use actual dimensions and original road-impact rules',async()=>{
  const solid=solidWallSegments(wall,p.city.gates)[0],post=gatePosts(gate,measureWall(wall.path))[0];
  const half=(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2;
  for(const [code,target,record,required,dist] of [
    ['wall-clearance',mid(solid.a,solid.b),wall,half+(wall.width+(wall.edgeWidth??WALL_EDGE_WIDTH))/2+.5,
      (a,b)=>Math.min(...solidWallSegments(wall,p.city.gates).map(s=>segmentDistance(s.a,s.b,a,b)))],
    ['tower-clearance',tower.center,tower,half+tower.radius+.5,(a,b)=>distanceToSegment(tower.center,a,b)],
    ['gate-clearance',post,gate,half+gate.postRadius,(a,b)=>Math.min(...gatePosts(gate,measureWall(wall.path)).map(p=>distanceToSegment(p,a,b)))]
  ]){
    const offset=offsetTo(target),o=await run(p,ids,offset,{destruction:true,regeneration:true}),r=resultFor(o);
    const m=r.measurements.find(m=>m.code===code&&m.refs.some(r=>r.id===record.id));
    assert.ok(m,code);assert.ok(Math.abs(m.requiredDistance-required)<1e-10);
    const move=p=>({x:p.x+offset.x,y:p.y+offset.y});
    assert.ok(Math.abs(m.newDistance-dist(move(a),move(b)))<1e-10);
    assert.ok(Math.abs(m.oldDistance-dist(a,b))<1e-10);assert.equal(r.constraint.summary,'blocked');
    assert.ok(resultFor(o,'swept').constraint.rows.every(r=>r.outcome!=='violated'));
  }
});
test('P2 wall openings retain actual solid sections; all final measured violations match exhaustive reference',async()=>{
  const offset=offsetTo(gate.center),o=await run(p,ids,offset),r=resultFor(o),move=p=>({x:p.x+offset.x,y:p.y+offset.y});
  const u=move(a),v=move(b),half=(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2;
  const expected=[];
  for(const w of p.city.walls)if(solidWallSegments(w,p.city.gates).some(s=>segmentDistance(s.a,s.b,u,v)<half+(w.width+(w.edgeWidth??WALL_EDGE_WIDTH))/2+.5))expected.push('wall-clearance:'+w.id);
  for(const t of p.city.towers)if(distanceToSegment(t.center,u,v)<half+t.radius+.5)expected.push('tower-clearance:'+t.id);
  for(const gate of p.city.gates){
    const w=p.city.walls.find(w=>w.id===gate.wallId);
    if(gatePosts(gate,measureWall(w.path)).some(p=>distanceToSegment(p,u,v)<half+gate.postRadius))expected.push('gate-clearance:'+gate.id);
  }
  const actual=r.measurements.filter(m=>m.code!=='gate-connection').map(m=>m.code+':'+m.refs[1].id);
  assert.deepEqual(actual.sort(),expected.sort());
});
test('P2 gate anchor movement is protected or refused at ordinary-road preflight',async()=>{
  const incident=g.incidentRoads.get(gate.connection.cityNodeId);
  assert.ok(incident.length);
  let pair;
  for(let i=0;i<incident.length&&!pair;i++)for(let j=i+1;j<incident.length;j++)
    if(resolveRoadGroupB1(g,[incident[i],incident[j]]).eligible){pair=[incident[i],incident[j]];break;}
  if(!pair){
    // Include a protected boundary connection and another road. No ordinary
    // permission may convert that protected group into an accepted query.
    pair=[...new Set([incident[0],...ids])];
  }
  const o=await run(p,pair,{x:1,y:0},{destruction:true});
  if(o.status==='preflight-refused'){assert.deepEqual(o.evidence,[]);assert.ok(o.diagnostics.length);}
  else assert.ok(o.evidence.some(e=>e.constraint.rows.some(r=>r.kind==='protection'&&r.outcome==='violated'&&
    r.anchorRefs.some(a=>a.id===gate.connection.cityNodeId))));
});
test('P2 no-defense control and exhausted shared work remain detached and fail closed',async()=>{
  const dry=createProject({seed:'ares-p2-planned',size:'small',morphology:'planned'});
  assert.equal(dry.city.walls.length,0);
  const selected=eligible(buildRoadGraph(dry.city)),o=await run(dry,selected);
  assert.ok(o.evidence.length);assert.ok(o.evidence.every(e=>e.constraint.summary==='observed-satisfied'));
  assert.deepEqual(o.anchors,[]);
  await assert.rejects(()=>discoverAresDefense(dry,ctx(dry,selected,{x:1,y:0}),
    createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
});
