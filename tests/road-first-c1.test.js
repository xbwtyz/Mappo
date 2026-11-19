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

test('C1 invalid numeric offsets discard stale ghost without writing or pretending to draft',()=>{
  const original=project('roadfirst-invalid','planned'),road=eligible(original.city);
  const fingerprint=JSON.stringify(original);
  const session=new RoadPreviewSession({getProject:()=>original,changed:()=>{}});
  session.start();session.select({kind:'road',id:road.id});
  assert.equal(session.updateRoadIntent({x:12,y:0},{defer:false}),true);
  assert.equal(session.roadIntentAnalysis?.draftable,true);
  assert.equal(session.pending,true);
  for(const invalid of [{x:NaN,y:1},{x:Infinity,y:0},{x:1000001,y:0},{x:undefined,y:2}]){
    assert.equal(session.updateRoadIntent(invalid,{defer:false}),false);
    assert.equal(session.pending,false);
    assert.equal(session.roadIntentAnalysis,null);
    assert.equal(session.roadIntentNodes,null);
    assert.match(session.roadIntentInputError,/finite/);
  }
  assert.equal(session.updateRoadIntent({x:15,y:-4},{defer:false}),true);
  assert.equal(session.roadIntentInputError,'');
  assert.equal(session.roadIntentAnalysis?.applyReady,false);
  assert.equal(JSON.stringify(original),fingerprint);
  session.reset();assert.equal(session.pending,false);
  assert.equal(session.roadIntentInputError,'');
  session.stop();
});

test('C1 dragging a previously translated road again and cancelling preserves prior draft',()=>{
  const original=project('roadfirst-redrag','linear'),road=eligible(original.city);
  const snapshot=JSON.stringify(original);
  const session=new RoadPreviewSession({getProject:()=>original,changed:()=>{}});
  session.start();session.select({kind:'road',id:road.id});
  assert.equal(session.updateRoadIntent({x:15,y:3},{defer:false}),true);
  const graph=session.graph,a=graph.nodesById.get(road.a),b=graph.nodesById.get(road.b);
  const ghostMid={x:(a.x+b.x)/2+15,y:(a.y+b.y)/2+3};
  assert.deepEqual(session.hit(ghostMid,5,'mouse'),{kind:'road',id:road.id});
  assert.equal(session.begin(ghostMid,5,'mouse'),true);
  session.move({x:ghostMid.x+4,y:ghostMid.y-2});
  assert.equal(session.roadIntentOffset.x,19);
  session.end(true);
  assert.equal(session.roadIntentOffset.x,15);
  assert.equal(session.roadIntentOffset.y,3);
  assert.equal(session.roadIntentAnalysis,null);
  assert.equal(session.updateRoadIntent({x:15,y:3},{defer:false}),true);
  assert.equal(JSON.stringify(original),snapshot);
  session.stop();
});

test('C1 stale projects, selection changes, and scheduled reports cannot revive a discarded draft',()=>{
  let accepted=project('roadfirst-stale','organic'),calls=[];
  const session=new RoadPreviewSession({getProject:()=>accepted,
    schedule:fn=>{calls.push(fn);return calls.length;},unschedule:()=>{},
    changed:()=>{}});
  session.start();const road=eligible(accepted.city);
  session.select({kind:'road',id:road.id});
  session.updateRoadIntent({x:11,y:6});
  assert.equal(calls.length,1);
  session.select({kind:'junction',id:road.a});
  calls[0]();
  assert.equal(session.roadIntentAnalysis,null);
  session.select({kind:'road',id:road.id});
  session.updateRoadIntent({x:15,y:0});
  accepted=project('roadfirst-replaced','planned');
  calls.at(-1)();
  assert.equal(session.current(),false);
  assert.equal(session.roadIntentNodes,null);
  assert.equal(session.updateRoadIntent({x:16,y:0}),false);
  session.stop();
});

test('C1 preview cloning preserves negative zero and opaque nested metadata exactly',()=>{
  const city=project('roadfirst-signed-zero','organic'),road=eligible(city.city);
  const property=city.city.properties[0];
  assert.ok(property,'Developed-city fixture must have properties');
  property.opaqueDraftTest={sign:-0,values:[-0,{sign:-0}],note:'keep exact authored extensions'};
  const before=JSON.stringify(city);
  const proposed=prepareRoadIntentC1(city,road.id,{x:15,y:0});
  assert.equal(proposed.draftable,true);
  const metadata=proposed.proposedCity.properties.find(p=>p.id===property.id).opaqueDraftTest;
  assert.ok(Object.is(metadata.sign,-0));
  assert.ok(Object.is(metadata.values[0],-0));
  assert.ok(Object.is(metadata.values[1].sign,-0));
  assert.deepEqual(proposed.proposedCity.properties,city.city.properties);
  assert.equal(JSON.stringify(city),before);
});
test('C1 keyboard nudge recovers cleanly after an invalid numeric road offset',()=>{
  const city=project('roadfirst-nudge-invalid','planned'),road=eligible(city.city);
  const session=new RoadPreviewSession({getProject:()=>city,changed:()=>{}});
  session.start();session.select({kind:'road',id:road.id});
  assert.equal(session.updateRoadIntent({x:NaN,y:0}),false);
  assert.ok(session.roadIntentInputError);
  assert.equal(session.nudge(2,-1),true);
  assert.deepEqual(session.roadIntentOffset,{x:2,y:-1});
  assert.equal(session.roadIntentInputError,'');
  assert.equal(session.pending,true);
  session.stop();
});
