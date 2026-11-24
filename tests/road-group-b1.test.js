import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoadGroupB1, proposeRoadGroupNodesB1 } from '../src/core/road-group-b1.js';

function groupFixtureB1() {
  const nodes=[['A',0,0],['B',10,0],['C',20,0],['D',10,10],['E',0,10],['F',30,0]]
    .map(([id,x,y])=>Object.freeze({id,x,y}));
  const roads=[['AB','A','B'],['BC','B','C'],['BD','B','D'],['DE','D','E'],['EA','E','A'],['CF','C','F']]
    .map(([id,a,b])=>Object.freeze({id,a,b}));
  const incident=new Map(nodes.map(n=>[n.id,[]]));
  for(const r of roads){incident.get(r.a).push(r.id);incident.get(r.b).push(r.id);}
  return {valid:true,nodesById:new Map(nodes.map(n=>[n.id,n])),
    roadsById:new Map(roads.map(r=>[r.id,r])),incidentRoads:incident,
    roadClasses:new Map(roads.map(r=>[r.id,{protected:false}])),terminalRoadIds:[]};
}

function registerGroupTestsB1(test,assert) {
  test('B1 resolves chain, branch and closed cycle',()=>{
    const g=groupFixtureB1();
    for(const ids of [['AB','BC'],['AB','BC','BD'],['AB','BD','DE','EA']])
      assert.equal(resolveRoadGroupB1(g,ids).eligible,true);
  });
  test('B1 selection is canonical and deduplicated',()=>{
    const g=groupFixtureB1(), a=resolveRoadGroupB1(g,['AB','BC']);
    assert.deepEqual(resolveRoadGroupB1(g,['BC','AB','BC']),a);
    assert.deepEqual(a.movedJunctionIds,['A','B','C']);
    assert.deepEqual(a.attachmentRoadIds,['BD','CF','EA']);
    assert.deepEqual(a.stationaryJunctionIds,['D','E','F']);
    assert.equal(a.affectedRoadIds.includes('DE'),false);
  });
  test('B1 unselected edges cannot connect a disconnected selection',()=>{
    const r=resolveRoadGroupB1(groupFixtureB1(),['AB','CF']);
    assert.equal(r.eligible,false);
    assert.equal(r.issues[0].code,'disconnected-road-group');
  });
  test('B1 missing and singleton IDs are rejected',()=>{
    const g=groupFixtureB1();
    assert.equal(resolveRoadGroupB1(g,['AB','absent']).issues[0].code,'road-not-found');
    assert.equal(resolveRoadGroupB1(g,['AB','AB']).issues[0].code,'group-too-small');
    assert.equal(resolveRoadGroupB1({...g,valid:false},['AB','BC']).eligible,false);
  });
  test('B1 protected and terminal attachments block the group',()=>{
    const g=groupFixtureB1();
    g.roadClasses.set('BD',{protected:true});
    g.terminalRoadIds=['CF'];
    const r=resolveRoadGroupB1(g,['AB','BC']);
    assert.deepEqual(r.issues.map(x=>x.code),['protected-connection','terminal-edit-out-of-scope']);
    assert.deepEqual(r.issues[0].roadIds,['BD']);
    assert.deepEqual(r.issues[1].roadIds,['CF']);
  });
  test('B1 group coordinates translate once without mutating accepted nodes',()=>{
    const g=groupFixtureB1(), before=[...g.nodesById.values()];
    const r=proposeRoadGroupNodesB1(g,['BC','AB'],{x:3,y:-2});
    assert.equal(r.draftable,true);assert.equal(r.applyReady,false);
    assert.deepEqual(r.proposedNodes,[{id:'A',x:3,y:-2},{id:'B',x:13,y:-2},{id:'C',x:23,y:-2}]);
    assert.deepEqual([...g.nodesById.values()],before);
    assert.deepEqual(proposeRoadGroupNodesB1(g,['AB','BC'],{x:3,y:-2}),r);
    assert.equal(Object.isFrozen(r.proposedNodes),true);
  });
  test('B1 invalid offsets, overflow and zero displacement do not authorize Apply',()=>{
    const g=groupFixtureB1();
    for(const offset of [{x:NaN,y:1},{x:0,y:Infinity},{x:100000,y:0}])
      assert.equal(proposeRoadGroupNodesB1(g,['AB','BC'],offset).draftable,false);
    const r=proposeRoadGroupNodesB1(g,['AB','BC'],{x:0,y:0});
    assert.equal(r.changed,false);assert.equal(r.applyReady,false);
  });
}

registerGroupTestsB1(test,assert);
