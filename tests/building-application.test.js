import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { deriveOccupiedPlots, reattachFrontage, prepareBuildingCandidate, prepareBuildingApply } from '../src/editor/building-application.js';
const poly=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
test('3G-C2 occupied-plot reconciliation and rebuilt frontage route are pure',()=>{
  const p={id:'p',plotIds:['pl1','pl2'],buildingIds:['b']};
  const building={id:'b',propertyId:'p',frontageRoadId:'r',footprint:poly(2,2,7,5),holes:[]};
  const city={plots:[{id:'pl1',boundary:poly(0,0,10,10)},{id:'pl2',boundary:poly(10,0,10,10)}],
    buildings:[building],properties:[p],nodes:[{id:'n1',x:0,y:0},{id:'n2',x:20,y:0}],roads:[{id:'r',a:'n1',b:'n2'}]};
  const before=JSON.stringify(city);
  assert.deepEqual(deriveOccupiedPlots(city,p,building),['pl1']);
  const route=reattachFrontage(city,building);
  assert.ok(route);
  assert.equal(route.accessPath[1].y,0);
  assert.ok(route.entrance.y>=2);
  assert.equal(JSON.stringify(city),before);
});
test('3G-C2 candidate project survives schema-9 portable roundtrip without mutation',()=>{
  const project=createProject({seed:'3gc-safe-apply',size:'small',morphology:'organic'});
  const before=JSON.stringify(project);
  const workspace=defaultWorkspace(project);
  let passing=null;
  // Find an existing property with a viable tiny move in a deterministic city.
  for(const b of project.city.buildings.slice(0,80)){
    for(const shift of [{dx:.2},{dy:.2},{dx:-.2},{dy:-.2},{scaleX:.99,scaleY:.99}]){
      const out=prepareBuildingCandidate(project,b.id,shift);
      if(out.ok){passing={id:b.id,shift,result:out};break;}
    }
    if(passing)break;
  }
  assert.ok(passing,'Generated city should allow at least one small safe edit');
  const receipt=prepareBuildingApply(project,workspace,passing.id,passing.shift);
  assert.equal(receipt.ok,true,JSON.stringify(receipt.issues));
  assert.equal(receipt.candidate.schemaVersion,9);
  const changed=receipt.candidate.city.buildings.find(b=>b.id===passing.id);
  assert.notDeepEqual(changed.footprint,project.city.buildings.find(b=>b.id===passing.id).footprint);
  assert.ok(changed.plotIds.length);
  assert.equal(JSON.stringify(project),before);
  const rejected=prepareBuildingApply(project,workspace,passing.id,{dx:200});
  assert.equal(rejected.ok,false);
  assert.equal(JSON.stringify(project),before);
});
