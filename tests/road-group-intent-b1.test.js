import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {resolveRoadGroupB1} from '../src/core/road-group-b1.js';
import {prepareRoadGroupIntentB1} from '../src/core/road-intent-c1.js';
import {prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {validateRoadGroupApplyB1} from '../src/editor/road-application.js';

import { defaultWorkspace, createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { RoadPreviewSession } from '../src/editor/road-preview.js';
import { verifyRoadGroupPreservationB1 } from '../src/core/road-group-preservation-b1.js';
import { mixedCityFixtureS10 } from './helpers/schema10-mixed-city.js';

function groupFixture() {
  const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
  const graph=buildRoadGraph(project.city);
  for(const ids of graph.incidentRoads.values())
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
      const pair=[ids[i],ids[j]];
      if(resolveRoadGroupB1(graph,pair).eligible)return {project,graph,ids:pair};
    }
  throw Error('Fixture needs an eligible connected pair.');
}
test('B1 shared graph intent retains all road records and moves only selected junctions',()=>{
  const {project,graph,ids}=groupFixture();
  const before=JSON.stringify(project),offset={x:.25,y:-.125};
  const draft=prepareRoadGroupIntentB1(project,ids,offset);
  assert.equal(draft.draftable,true);
  assert.equal(draft.applyReady,false);
  assert.deepEqual(draft.selectedRoadIds,[...ids].sort());
  assert.deepEqual(draft.proposedCity.roads,project.city.roads);
  const moved=new Set(draft.group.movedJunctionIds);
  for(const node of draft.proposedCity.nodes){
    const old=graph.nodesById.get(node.id);
    assert.equal(node.x,old.x+(moved.has(node.id)?offset.x:0));
    assert.equal(node.y,old.y+(moved.has(node.id)?offset.y:0));
  }
  assert.equal(JSON.stringify(project),before);
  assert.deepEqual(prepareRoadGroupIntentB1(project,ids.slice().reverse(),offset),draft);
});
test('B1 strict group reconciliation never offers zero or out-of-bounds proposals',()=>{
  const {project,ids}=groupFixture(),before=JSON.stringify(project);
  for(const offset of [{x:0,y:0},{x:99999,y:99999},{x:Infinity,y:0}]){
    const r=prepareRoadGroupReflowB1(project,ids,offset);
    assert.equal(r.phase,'B1');
    assert.equal(r.candidateProject,null);
    assert.ok(r.unresolved.length);
  }
  assert.equal(JSON.stringify(project),before);
});
test('B1 fresh Apply refuses mismatched selection and missing inspected candidate',()=>{
  const {project,ids}=groupFixture(),before=JSON.stringify(project);
  const receipt=validateRoadGroupApplyB1(project,{}, {selectedRoadIds:ids,offset:{x:1,y:0}},
    {phase:'B1',selectedRoadIds:['missing'],offset:{x:1,y:0},candidateProject:project});
  assert.equal(receipt.ok,false);
  assert.equal(receipt.issues[0].code,'stale-preview');
  assert.equal(JSON.stringify(project),before);
});

const scenarios=[
  ['planned','c2-planned',['RD-0113','RD-0114']],
  ['organic','b1-organic',['RD-0116','RD-0123']],
  ['radial','b1-radial',['RD-0100','RD-0152']],
  ['linear','b1-linear',['RD-0122','RD-0123']]
];
for(const [morphology,seed,ids] of scenarios)test('B1 '+morphology+' group Apply, portable reopen and chronological replay',()=>{
  const project=createProject({seed,size:'small',morphology}),workspace=defaultWorkspace(project);
  const before=JSON.stringify(project),offset={x:.05,y:0};
  const inspected=prepareRoadGroupReflowB1(project,ids,offset);
  assert.ok(inspected.candidateProject,inspected.unresolved[0]?.message);
  const receipt=validateRoadGroupApplyB1(project,workspace,{selectedRoadIds:ids,offset},inspected);
  assert.ok(receipt.ok,JSON.stringify(receipt.issues));
  assert.equal(receipt.transaction.operation,'translate-road-group');
  assert.deepEqual(receipt.transaction.targetIds,ids);
  const history=new AcceptedEditHistoryD01();
  history.clear(project);
  assert.ok(history.canRecord(project,receipt.candidate,receipt.transaction.editorHistory));
  assert.equal(history.record(project,receipt.candidate,receipt.transaction).status,'recorded');
  assert.equal(history.length,1);
  const undo=history.prepare('undo',receipt.candidate,receipt.workspace);
  assert.ok(undo.ok,undo.reason);
  assert.equal(JSON.stringify(undo.candidate),before);
  history.accept('undo',undo.entry,undo.candidate);
  const redo=history.prepare('redo',undo.candidate,undo.workspace);
  assert.ok(redo.ok,redo.reason);
  assert.equal(JSON.stringify(redo.candidate),JSON.stringify(receipt.candidate));
  history.accept('redo',redo.entry,redo.candidate);
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(redo.candidate,redo.workspace)));
  assert.equal(JSON.stringify(portable.project),JSON.stringify(receipt.candidate));
  assert.equal(JSON.stringify(project),before);
  const tiny=new AcceptedEditHistoryD01({maxBytes:1024});
  tiny.clear(project);
  assert.equal(tiny.canRecord(project,receipt.candidate),false);
  assert.equal(tiny.length,0);
});
test('B1 group session locks selection, supports repeated drag and resets without writing',()=>{
  const {project,graph,ids}=groupFixture(),before=JSON.stringify(project);
  const session=new RoadPreviewSession({getProject:()=>project});
  session.start();
  session.select({kind:'road',id:ids[0]});
  assert.ok(session.requestSelectionA1({kind:'road',id:ids[1]},{toggle:true}));
  assert.equal(session.selection,null);
  const road=graph.roadsById.get(ids[0]),a=graph.nodesById.get(road.a),b=graph.nodesById.get(road.b);
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  assert.ok(session.begin(mid,20,'mouse'));
  session.move({x:mid.x+.5,y:mid.y});
  session.end(false);
  assert.ok(session.pending);
  assert.equal(session.requestSelectionA1(null),false);
  session.updateRoadIntent({x:.05,y:0},{defer:false});
  assert.ok(session.reconciliation?.candidateProject,session.reconciliation?.unresolved[0]?.message);
  session.reset();
  assert.equal(session.pending,false);
  assert.equal(session.selectionSet.items.length,2);
  assert.equal(JSON.stringify(project),before);
  session.stop();
});
test('B1 independent preservation gate refuses unauthorized topology and metadata writes',()=>{
  const {project,ids}=groupFixture(),offset={x:.05,y:0};
  const draft=prepareRoadGroupIntentB1(project,ids,offset);
  const result=prepareRoadGroupReflowB1(project,ids,offset);
  assert.ok(result.candidateProject,result.unresolved[0]?.message);
  const tampered=structuredClone(result.candidateProject);
  tampered.city.roads[0].customB1Marker='unexpected';
  assert.ok(verifyRoadGroupPreservationB1(project,tampered,draft));
  assert.equal(validateRoadGroupApplyB1(project,defaultWorkspace(project),{selectedRoadIds:ids,offset},
    {...result,candidateProject:tampered}).ok,false);
});
test('B1 mixed Schema 10 courtyard and joined building records survive unrelated group edits',()=>{
  const {project,workspace,hostId,occupantId,joinedId}=mixedCityFixtureS10();
  const graph=buildRoadGraph(project.city),before=JSON.stringify(project);
  const protectedIds=new Set([hostId,occupantId,joinedId]);
  const authored=project.city.buildings.filter(b=>protectedIds.has(b.id));
  const protectedBlocks=new Set(authored.map(b=>b.blockId));
  const protectedNodes=new Set(project.city.blocks.filter(b=>protectedBlocks.has(b.id)).flatMap(b=>b.vertices));
  let receipt=null,attempts=0;
  outer:for(const incident of graph.incidentRoads.values())
    for(let i=0;i<incident.length;i++)for(let j=i+1;j<incident.length;j++){
      const ids=[incident[i],incident[j]].sort(),group=resolveRoadGroupB1(graph,ids);
      if(!group.eligible||group.movedJunctionIds.some(id=>protectedNodes.has(id)))continue;
      const offset={x:.05,y:0},result=prepareRoadGroupReflowB1(project,ids,offset);
      if(result.candidateProject){
        const candidate=validateRoadGroupApplyB1(project,workspace,{selectedRoadIds:ids,offset},result);
        if(candidate.ok){receipt=candidate;break outer;}
      }
      if(++attempts>=30)break outer;
    }
  assert.ok(receipt,'Expected a valid group away from authored courtyard/component blocks');
  for(const building of authored)assert.equal(JSON.stringify(receipt.candidate.city.buildings.find(b=>b.id===building.id)),JSON.stringify(building));
  assert.equal(JSON.stringify(project),before);
});
