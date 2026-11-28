import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../src/core/road-group-b1.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { discoverAresRoadSetbacks } from '../src/core/ares-road-discovery.js';
import { APP_VERSION } from '../src/core/version.js';
import { STREET_WIDTHS, STREET_EDGE_WIDTH, PROPERTY_SETBACK, segmentDistance } from '../src/core/placement.js';

function fixture(morphology='planned'){
  const project=createProject({seed:'ares-p2-'+morphology,size:'small',morphology});
  const graph=buildRoadGraph(project.city);
  for(const ids of graph.incidentRoads.values()){
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
      const pair=[ids[i],ids[j]],group=resolveRoadGroupB1(graph,pair);
      if(group.eligible&&group.attachmentRoadIds.length)return {project,graph,ids:pair,group};
    }
  }
  throw Error('Expected eligible connected roads with attachments.');
}
const context=(f,offset,permissions={})=>({version:1,sourceVersion:APP_VERSION,sessionId:'p2-test',
  operation:normalizeSpatialRoadGroup(f.project,7,f.ids,offset,permissions)});
const run=(f,c,algorithm='indexed')=>discoverAresRoadSetbacks(f.project,c,createSpatialPreservationBudget(),{algorithm});
const f=fixture();
test('P2 changed-road discovery preserves exact requested endpoints and includes attached roads',()=>{
  const before=JSON.stringify(f.project),offset={x:10,y:-5},result=run(f,context(f,offset));
  assert.equal(result.status,'observed');
  assert.deepEqual(result.changedRoads.map(r=>r.ref.id),f.group.affectedRoadIds);
  for(const road of result.changedRoads){
    const accepted=f.graph.roadsById.get(road.ref.id);
    for(const [key,id] of [['a',accepted.a],['b',accepted.b]]){
      const old=f.graph.nodesById.get(id),moved=f.group.movedJunctionIds.includes(id);
      assert.deepEqual(road.proposed[key],{x:old.x+(moved?offset.x:0),y:old.y+(moved?offset.y:0)});
    }
    assert.equal(road.selected,f.ids.includes(road.ref.id));
    assert.equal(road.requiredDistance,(STREET_WIDTHS[accepted.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK);
  }
  assert.equal(JSON.stringify(f.project),before);assert.ok(Object.isFrozen(result.changedRoads[0].proposed.a));
  assert.equal(Object.hasOwn(result,'applyReady'),false);
});
test('P2 indexed and unpruned exact reference agree across real morphologies and movement axes',()=>{
  let blockers=0;
  for(const morphology of ['planned','organic','radial','linear']){
    const city=fixture(morphology),before=JSON.stringify(city.project);
    for(const offset of [{x:1,y:0},{x:0,y:75},{x:-25,y:10},{x:100,y:0}]){
      const c=context(city,offset),a=run(city,c),b=run(city,c,'reference');
      assert.deepEqual(a,b);blockers+=a.blockers.length;
      assert.equal(JSON.stringify(city.project),before);
    }
  }
  assert.ok(blockers>0);
});
test('P2 exact blocker measurements retain road/property/block identity and original distances',()=>{
  const result=run(f,context(f,{x:0,y:75}));
  const props=new Map(f.project.city.properties.map(p=>[p.id,p]));
  for(const row of result.blockers){
    const road=result.changedRoads.find(r=>r.ref.id===row.roadRef.id),p=props.get(row.propertyRef.id),m=row.diagnostic.measurements;
    const distance=({a,b})=>Math.min(...p.boundary.map((v,i)=>segmentDistance(v,p.boundary[(i+1)%p.boundary.length],a,b)));
    assert.equal(row.blockRef.id,p.blockId);assert.equal(m.newDistance,distance(road.proposed));
    assert.equal(m.oldDistance,distance(road.old));assert.ok(m.newDistance<m.requiredDistance-1e-5);
    assert.equal(row.diagnostic.refs.length,3);assert.equal(m.unit,'map-unit');
    assert.ok(result.finalCandidates.some(r=>r.roadRef.id===row.roadRef.id&&r.propertyRef.id===row.propertyRef.id));
  }
  for(const pair of result.finalCandidates)assert.ok(result.sweptCandidates.some(r=>r.roadRef.id===pair.roadRef.id&&r.propertyRef.id===pair.propertyRef.id));
});
test('P2 discovery does not expand permissions and is deterministic with reversed selection',()=>{
  const c=context(f,{x:-10,y:25}),a=run(f,c);
  const reverse={...c,operation:{...c.operation,editedRefs:c.operation.editedRefs.slice().reverse()}};
  assert.deepEqual(run(f,reverse),a);
  const permissive=run(f,context(f,{x:-10,y:25},{destruction:true}));
  assert.deepEqual(permissive.changedRoads,a.changedRoads);assert.deepEqual(permissive.finalCandidates,a.finalCandidates);
  assert.equal(a.context.operation.permissions.destruction,false);assert.equal(Object.hasOwn(permissive,'writable'),false);
});
test('P2 protected selection is a refusal and exhausted shared work is not a partial pass',()=>{
  const protectedId=[...f.graph.roadClasses].find(([,r])=>r.protected)[0];
  const c=context({...f,ids:[protectedId,...f.ids]},{x:1,y:0});
  const refused=run(f,c);
  assert.equal(refused.status,'preflight-refused');assert.ok(refused.diagnostics.length);assert.deepEqual(refused.blockers,[]);
  assert.throws(()=>discoverAresRoadSetbacks(f.project,context(f,{x:1,y:0}),
    createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
  assert.throws(()=>run(f,{...c,operation:{...c.operation,projectId:'other'}}),/identity/);
});
