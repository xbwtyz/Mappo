import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareRoadIntentC1 } from '../src/core/road-intent-c1.js';
import { RoadPreviewSession } from '../src/editor/road-preview.js';

function project(seed,morphology){
  return createProject({seed,size:'small',morphology});
}
function eligible(city){
  const graph=buildRoadGraph(city);
  const found=[...graph.roadsById.values()].find(road=>
    [road.a,road.b].every(id=>(graph.incidentRoads.get(id)??[])
      .every(r=>!graph.roadClasses.get(r).protected)));
  assert.ok(found,'Fixture must have an ordinary street with editable endpoints');
  return found;
}
for(const morphology of ['organic','linear','radial','planned']){
  test('C1 road-first draft preserves intended 15-unit move and accepted city in '+morphology,()=>{
    const original=project('roadfirst-'+morphology,morphology);
    const road=eligible(original.city),snapshot=JSON.stringify(original);
    const offset={x:15,y:0};
    const draft=prepareRoadIntentC1(original,road.id,offset);
    assert.equal(draft.draftable,true);
    assert.equal(draft.applyReady,false);
    assert.equal(draft.project,null);
    assert.ok(draft.proposedCity);
    for(const id of [road.a,road.b]){
      const accepted=original.city.nodes.find(node=>node.id===id);
      const proposed=draft.proposedCity.nodes.find(node=>node.id===id);
      assert.equal(proposed.x,accepted.x+15);
      assert.equal(proposed.y,accepted.y);
    }
    assert.equal(JSON.stringify(original),snapshot);
    assert.deepEqual(draft.proposedCity.properties,original.city.properties);
    assert.deepEqual(draft.proposedCity.buildings,original.city.buildings);
    assert.equal(Object.isFrozen(draft),true);
    const repeat=prepareRoadIntentC1(original,road.id,offset);
    assert.deepEqual(repeat,draft);
  });
}
test('C1 road-first session drag and Cancel are transient; ordinary junction flow remains',()=>{
  const original=project('roadfirst-session','planned'),road=eligible(original.city);
  const snapshot=JSON.stringify(original);
  const session=new RoadPreviewSession({getProject:()=>original,
    schedule:fn=>{fn();return null;},unschedule:()=>{},changed:()=>{}});
  assert.equal(session.start(),true);
  session.select({kind:'road',id:road.id});
  assert.equal(session.roadIntentEligible,true);
  const graph=buildRoadGraph(original.city);
  const a=graph.nodesById.get(road.a),b=graph.nodesById.get(road.b);
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  assert.equal(session.begin(mid,8,'mouse'),true);
  session.move({x:mid.x+12,y:mid.y+7});
  assert.equal(session.pending,true);
  assert.equal(session.roadIntentOffset.x,12);
  assert.equal(session.roadIntentOffset.y,7);
  session.end(false);
  assert.equal(session.roadIntentAnalysis?.draftable,true);
  assert.equal(session.roadIntentAnalysis?.applyReady,false);
  assert.equal(JSON.stringify(original),snapshot);
  session.reset();
  assert.equal(session.pending,false);
  session.stop();
  assert.equal(JSON.stringify(original),snapshot);
});
test('C1 refuses protected roads and unbounded coordinates, and does not infer Apply permission',()=>{
  const p=project('roadfirst-protected','organic'),graph=buildRoadGraph(p.city);
  const protectedRoad=[...graph.roadsById.values()].find(r=>graph.roadClasses.get(r.id).protected);
  assert.ok(protectedRoad);
  assert.equal(prepareRoadIntentC1(p,protectedRoad.id,{x:12,y:0}).draftable,false);
  const ordinary=eligible(p.city);
  assert.equal(prepareRoadIntentC1(p,ordinary.id,{x:Infinity,y:0}).draftable,false);
  assert.equal(prepareRoadIntentC1(p,ordinary.id,{x:1000000,y:0}).draftable,false);
  assert.equal(prepareRoadIntentC1(p,ordinary.id,{x:0,y:0}).applyReady,false);
});
