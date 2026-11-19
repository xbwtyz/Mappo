import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { prepareSegmentTranslationC1, verifySegmentDeltaC1 } from '../src/core/road-segment-translation.js';
import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';

const clone = x => JSON.parse(JSON.stringify(x));
function vacant(seed='b4-vacant') {
  const project=createProject({seed,size:'small',morphology:'organic'});
  project.city.properties=[];project.city.plots=[];project.city.buildings=[];
  project.city.openSpaces=project.city.blocks.map(block =>
    ({id:'OPEN-'+block.id,blockId:block.id,kind:'undeveloped',area:block.area}));
  return project;
}
function findCandidate(project, limit=35) {
  const graph=buildRoadGraph(project.city);
  const roads=[...graph.roadsById.values()].filter(r =>
    [r.a,r.b].every(id => graph.incidentRoads.get(id).every(edge =>
      !graph.roadClasses.get(edge).protected)));
  for(const road of roads.slice(0,limit)){
    const candidate=prepareSegmentTranslationC1(project,road.id,{x:.001,y:.001});
    if(candidate.candidateProject)return {road,candidate};
  }
  return null;
}
test('C1-A translation rejects invalid, protected, excessive and no-op intents without accepted writes',()=>{
  const project=vacant(),before=JSON.stringify(project);
  const graph=buildRoadGraph(project.city),road=[...graph.roadsById.values()][0];
  for(const [id,offset] of [[road.id,{x:0,y:0}],[road.id,{x:7,y:0}],
      ['missing',{x:.01,y:0}],[road.id,{x:Infinity,y:1}]]){
    const result=prepareSegmentTranslationC1(project,id,offset);
    assert.equal(result.candidateProject,null);
    assert.equal(result.applyReady,false);
    assert.ok(result.issues.length);
    assert.equal(JSON.stringify(project),before);
  }
  const protectedRoad=[...graph.roadsById.values()].find(r=>graph.roadClasses.get(r.id).protected);
  assert.ok(protectedRoad);
  assert.equal(prepareSegmentTranslationC1(project,protectedRoad.id,{x:.01,y:0}).candidateProject,null);
});
test('C1-A translates both segment endpoints as one detached, portable candidate',()=>{
  const project=vacant();
  const positive=findCandidate(project);
  assert.ok(positive,'Expected an eligible two-endpoint candidate in the proven vacant-city fixture');
  const before=JSON.stringify(project),{road,candidate}=positive;
  assert.equal(candidate.status,'candidate-only');
  assert.equal(candidate.applyReady,false,'C1-A must never enable Apply without a separate acceptance gate');
  assert.equal(candidate.validation.roundTrip,'pass');
  for(const id of [road.a,road.b]){
    const old=project.city.nodes.find(n=>n.id===id);
    const next=candidate.candidateProject.city.nodes.find(n=>n.id===id);
    assert.ok(Math.abs(next.x-old.x-.001)<1e-8);
    assert.ok(Math.abs(next.y-old.y-.001)<1e-8);
  }
  assert.deepEqual(candidate.candidateProject.city.buildings,project.city.buildings);
  const workspace=defaultWorkspace(project);
  const portable=decodeProjectDocument(encodeProjectDocument(
    createProjectDocument(candidate.candidateProject,workspace)));
  assert.deepEqual(portable.project,candidate.candidateProject);
  assert.equal(JSON.stringify(project),before);
  assert.equal(Object.isFrozen(candidate),true);
});
test('C1-A preserves developed building and identity records while reconciling only safe frontage geometry',()=>{
  const project=vacant('b4-vacant'),positive=findCandidate(project);
  assert.ok(positive);
  const first=positive.candidate;
  const repeat=prepareSegmentTranslationC1(project,positive.road.id,{x:.001,y:.001});
  assert.deepEqual(first,repeat);
  const developed=createProject({seed:'b4-vacant',size:'small',morphology:'organic'});
  const original=JSON.stringify(developed);
  const blocked=prepareSegmentTranslationC1(developed,positive.road.id,{x:.001,y:.001});
  assert.equal(blocked.applyReady,false);
  if(blocked.candidateProject){
    assert.deepEqual(blocked.candidateProject.city.buildings,developed.city.buildings);
    assert.deepEqual(blocked.candidateProject.city.properties.map(p=>
      [p.id,p.name,p.customUse,p.blockId,p.frontageRoadId,p.buildingIds,p.plotIds]),
      developed.city.properties.map(p=>
      [p.id,p.name,p.customUse,p.blockId,p.frontageRoadId,p.buildingIds,p.plotIds]));
    assert.equal(verifySegmentDeltaC1(developed,blocked.candidateProject,
      positive.road.id,{x:.001,y:.001}),true);
  }else assert.ok(blocked.issues.length);
  assert.equal(JSON.stringify(developed),original);
});
