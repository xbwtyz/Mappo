import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { prepareRoadApplyB4,validateRoadCandidateB4,RoadProjectHistoryB4 } from '../src/editor/road-application.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
const p=createProject({seed:'b4-road',size:'small',morphology:'organic'});
const copy=x=>JSON.parse(JSON.stringify(x));
const ws=defaultWorkspace(p);
const g=buildRoadGraph(p.city);
const id=[...g.nodesById.keys()].find(n=>g.incidentRoads.get(n)?.length &&
  g.incidentRoads.get(n).every(r=>!g.roadClasses.get(r).protected));
const point=g.nodesById.get(id);
test('B4 invalid, unchanged and unproven moves never Apply or change accepted state',()=>{
 const before=JSON.stringify(p);
 for(const x of [{x:point.x,y:point.y},{x:NaN,y:0},{x:200000,y:200000}]){
   const r=prepareRoadApplyB4(p,ws,id,x);
   assert.equal(r.ok,false);
 }
 assert.equal(JSON.stringify(p),before);
});
test('B4 rejects malicious or changed building data despite a falsely marked B2 candidate',()=>{
 const candidate=copy(p);candidate.city.buildings[0].footprint[0].x+=2;
 const r=prepareRoadApplyB4(p,ws,id,{x:point.x+.01,y:point.y+.01},{
   reconcile:()=>({status:'candidate-only',candidateProject:candidate,unresolved:[],
     validation:{project:'valid',graph:'pass',faces:'pass',identity:'pass'}})});
 assert.equal(r.ok,false);
 assert.match(r.reason,/Protected city collection/);
});
test('B4 history is one atomic reversible project snapshot with stale guard',()=>{
 const history=new RoadProjectHistoryB4(3),after=copy(p);
 after.city.name='Changed for history fixture';
 assert.equal(history.record(p,after),true);
 assert.equal(history.can('undo',p),false);
 assert.equal(history.can('undo',after),true);
 const undo=history.prepare(after,ws,'undo');
 assert.equal(undo.ok,true,undo.reason);
 history.accept(undo.entry,'undo');
 assert.equal(history.can('redo',p),true);
 const redo=history.prepare(p,ws,'redo');
 assert.equal(redo.ok,true,redo.reason);
 history.accept(redo.entry,'redo');
 assert.equal(history.can('undo',after),true);
 assert.equal(history.past.length,1);
 assert.equal(history.future.length,0);
});
test('B4 rejects unknown project fields, ownership changes and mutable city payload',()=>{
 const after=copy(p);
 after.city.properties[0].blockId='other';
 assert.equal(validateRoadCandidateB4(p,after,ws).ok,false);
 const extra=copy(p);extra.city.extensions={secret:'changed'};
 assert.equal(validateRoadCandidateB4(p,extra,ws).ok,false);
 const top=copy(p);top.newOpaqueField={foo:'unexpected'};
 assert.equal(validateRoadCandidateB4(p,top,ws).ok,false);
});
