import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {buildRoadGraph} from '../src/core/road-graph.js';
import {resolveRoadGroupB1} from '../src/core/road-group-b1.js';
import {prepareRoadGroupIntentB1} from '../src/core/road-intent-c1.js';
import {prepareRoadGroupReflowB1} from '../src/core/neighborhood-reflow.js';
import {validateRoadGroupApplyB1} from '../src/editor/road-application.js';

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
