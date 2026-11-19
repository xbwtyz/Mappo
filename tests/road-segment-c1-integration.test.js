import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareSegmentTranslationC1,verifySegmentDeltaC1 } from '../src/core/road-segment-translation.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(developed=false,seed='b4-vacant',morphology='organic'){
  const p=createProject({seed,size:'small',morphology});
  if(!developed){p.city.properties=[];p.city.plots=[];p.city.buildings=[];
    p.city.openSpaces=p.city.blocks.map(b=>({id:'OPEN-'+b.id,blockId:b.id,kind:'undeveloped',area:b.area}));}
  return p;
}
function eligible(project,limit=90){
  const graph=buildRoadGraph(project.city),offset={x:.001,y:.001};
  const roads=[...graph.roadsById.values()].filter(r=>
    [r.a,r.b].every(id=>graph.incidentRoads.get(id).every(edge=>
      !graph.roadClasses.get(edge).protected)));
  for(const road of roads.slice(0,limit)){
    const result=prepareSegmentTranslationC1(project,road.id,offset);
    if(result.candidateProject)return {road,result,offset};
  }
  return null;
}
test('C1 independently audits all geometry and rejects metadata and wrong endpoints',()=>{
  const before=fixture(),positive=eligible(before);assert.ok(positive);
  assert.equal(verifySegmentDeltaC1(before,positive.result.candidateProject,positive.road.id,positive.offset),true);
  const metadata=clone(positive.result.candidateProject);metadata.city.name+=' no';
  assert.throws(()=>verifySegmentDeltaC1(before,metadata,positive.road.id,positive.offset),/Unsupported/);
  const endpoint=clone(positive.result.candidateProject);
  endpoint.city.nodes.find(n=>n.id===positive.road.a).x+=.01;
  assert.throws(()=>verifySegmentDeltaC1(before,endpoint,positive.road.id,positive.offset),/endpoints/);
});
test('C1 UI segment preview, Apply, Undo and Redo preserve whole project and issue one revision',async()=>{
  const app=await buildingAppHarness(),p=fixture();
  app.apply({project:p,workspace:defaultWorkspace(p)});
  const positive=eligible(app.state().project);assert.ok(positive);
  const road=app.state().roadWorkspace;road.start();
  road.session.select({kind:'road',id:positive.road.id});
  assert.equal(app.el('roadSegmentPanelC1').hidden,false);
  app.el('roadSegmentDxC1').value=String(positive.offset.x);
  app.el('roadSegmentDyC1').value=String(positive.offset.y);
  app.el('roadSegmentPreviewC1').handlers.click();
  assert.equal(app.el('roadSegmentApplyC1').disabled,false,app.el('roadSegmentStatusC1').textContent);
  const before=JSON.stringify(app.state().project),rev=app.state().files.revision;
  app.el('roadSegmentApplyC1').handlers.click();
  const after=JSON.stringify(app.state().project);
  assert.notEqual(after,before);assert.equal(app.state().files.revision,rev+1);
  assert.equal(app.moveRoadHistory('undo'),true);
  assert.equal(JSON.stringify(app.state().project),before);
  assert.equal(app.moveRoadHistory('redo'),true);
  assert.equal(JSON.stringify(app.state().project),after);
});
test('C1 reset and cancel never update accepted project or revision',async()=>{
  const app=await buildingAppHarness(),p=fixture();
  app.apply({project:p,workspace:defaultWorkspace(p)});
  const positive=eligible(app.state().project);assert.ok(positive);
  const original=JSON.stringify(app.state().project),rev=app.state().files.revision;
  const road=app.state().roadWorkspace;road.start();
  road.session.select({kind:'road',id:positive.road.id});
  app.el('roadSegmentDxC1').value='.001';app.el('roadSegmentDyC1').value='.001';
  app.el('roadSegmentPreviewC1').handlers.click();
  assert.equal(app.el('roadSegmentApplyC1').disabled,false);
  app.el('roadPreviewReset').handlers.click();
  assert.equal(app.el('roadSegmentApplyC1').disabled,true);
  road.exit();
  assert.equal(JSON.stringify(app.state().project),original);
  assert.equal(app.state().files.revision,rev);
});
test('C1 developed-city road translation must have a genuinely accepted positive fixture',()=>{
  let positive=null;
  for(const [seed,morphology] of [['b4-vacant','organic'],['c1-developed','planned'],['c1-radial','radial'],['c1-linear','linear']]){
    const p=fixture(true,seed,morphology),before=JSON.stringify(p),result=eligible(p,90);
    assert.equal(JSON.stringify(p),before,'Preview must not mutate developed city.');
    if(result){positive={p,result};break;}
  }
  assert.ok(positive,'C1 must support at least one validated developed city; do not merge otherwise.');
  assert.deepEqual(positive.result.result.candidateProject.city.buildings,positive.p.city.buildings);
  assert.equal(verifySegmentDeltaC1(positive.p,positive.result.result.candidateProject,
    positive.result.road.id,positive.result.offset),true);
});

test('C1 user-scale movement survey: ordinary developed cities must allow visible moves',()=>{
  const cases=[['b4-vacant','organic'],['c1-developed','planned'],
    ['c1-radial','radial'],['c1-linear','linear']];
  const reasons=new Map(),winners=[];
  for(const [seed,morphology] of cases){
    const project=fixture(true,seed,morphology);
    const before=JSON.stringify(project);
    const graph=buildRoadGraph(project.city);
    const roads=[...graph.roadsById.values()].filter(r =>
      [r.a,r.b].every(id=>graph.incidentRoads.get(id).every(edge =>
        !graph.roadClasses.get(edge).protected)));
    let passed=0,checked=0;
    for(const road of roads.slice(0,35)){
      for(const offset of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}]){
        const result=prepareSegmentTranslationC1(project,road.id,offset);
        checked++;
        if(result.candidateProject){
          assert.equal(verifySegmentDeltaC1(project,result.candidateProject,road.id,offset),true);
          assert.deepEqual(result.candidateProject.city.buildings,project.city.buildings);
          assert.deepEqual(result.candidateProject.city.roads,project.city.roads);
          if(++passed===2)break;
        }else{
          const reason=result.issues?.[0]?.code??'unclassified';
          reasons.set(reason,(reasons.get(reason)??0)+1);
        }
      }
      if(passed>=2)break;
    }
    if(passed)winners.push({seed,morphology,passed,checked});
    assert.equal(JSON.stringify(project),before,'The movement survey must not mutate the accepted city');
  }
  const summary={successes:winners,blocked:Object.fromEntries([...reasons].sort((a,b)=>b[1]-a[1]).slice(0,10))};
  console.log('C1 developed-city 1-unit movement survey:',JSON.stringify(summary));
  assert.ok(winners.length>=2,
    'At least two distinct developed city morphologies must accept a full 1-unit road move; '+JSON.stringify(summary));
});

test('C1 find-valid-move command discovers a real developed-city movement without modifying accepted state',async()=>{
  const project=fixture(true,'c1-developed','planned');
  const app=await buildingAppHarness();
  app.apply({project,workspace:defaultWorkspace(project)});
  const road=app.state().roadWorkspace;
  road.start();
  const graph=road.session.graph;
  const first=[...graph.roadsById.keys()].find(id=>
    [...graph.incidentRoads.get(graph.roadsById.get(id).a),
      ...graph.incidentRoads.get(graph.roadsById.get(id).b)]
      .every(r=>!graph.roadClasses.get(r).protected));
  assert.ok(first);
  road.session.select({kind:'road',id:first});
  const original=JSON.stringify(app.state().project),revision=app.state().files.revision;
  const found=await road.findSegmentMovementC1();
  assert.equal(found,true,'A developed city should provide a verified one-unit or half-unit move');
  assert.ok(road.segmentPreview?.result?.candidateProject);
  assert.equal(app.el('roadSegmentApplyC1').disabled,false);
  assert.ok(Math.hypot(road.segmentPreview.offset.x,road.segmentPreview.offset.y)>=.5);
  assert.equal(app.state().files.revision,revision);
  assert.equal(JSON.stringify(app.state().project),original);
  road.exit();
  assert.equal(JSON.stringify(app.state().project),original);
});
