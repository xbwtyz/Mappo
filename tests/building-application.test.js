import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { cornerBuildingFixture } from './helpers/corner-building-fixture.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { deriveOccupiedPlots, reattachFrontage, resolveBuildingAccess, prepareBuildingCandidate, prepareBuildingApply } from '../src/editor/building-application.js';
const poly=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];

test('a clear diagonal can reconnect to the existing street when nearest points are blocked',()=>{
  const building={id:'rear',propertyId:'parcel',frontageRoadId:'front',footprint:poly(-1,8,2,2)};
  const city={
    roads:[{id:'front',a:'a',b:'b'}],
    nodes:[{id:'a',x:-10,y:0},{id:'b',x:10,y:0}],
    properties:[{id:'parcel',boundary:poly(-9,2,18,10)}],
    buildings:[building,{id:'obstacle',propertyId:'parcel',footprint:poly(-2,3,4,3)}]
  };
  const before=structuredClone(city);
  assert.equal(reattachFrontage(city,building),null);
  const {route}=resolveBuildingAccess(city,building,building);
  assert.ok(route);
  assert.equal(route.frontageRoadId,'front');
  assert.equal(route.accessPath[1].y,0);
  assert.ok(Math.abs(route.accessPath[1].x)>2);
  assert.deepEqual(city,before);
});

test('corner fallback needs an exposed parcel edge and never grants access to a protected boundary',()=>{
  const city={
    nodes:[{id:'a',x:0,y:0},{id:'b',x:30,y:0},{id:'c',x:30,y:30},{id:'d',x:0,y:30}],
    roads:[{id:'front',a:'a',b:'b',kind:'lane'},{id:'side',a:'b',b:'c',kind:'lane'}],
    blocks:[{id:'block',vertices:['a','b','c','d']}],
    properties:[{id:'parcel',blockId:'block',frontageRoadId:'front',boundary:poly(5,4.95,20.05,20)}]
  };
  const building={id:'rear',propertyId:'parcel',frontageRoadId:'front',footprint:poly(19,13,3,3)};
  city.buildings=[building,{id:'obstacle',propertyId:'parcel',footprint:poly(4,6,22,4)}];
  const {route}=resolveBuildingAccess(city,building,building);
  assert.ok(route);
  assert.equal(route.frontageRoadId,'side');
  assert.equal(route.accessPath[1].x,30);
  assert.equal(city.properties[0].frontageRoadId,'front');
  city.properties[0].boundary=poly(5,4.95,18,20);
  const denied=resolveBuildingAccess(city,building,building);
  assert.equal(denied.route,null);
  assert.equal(denied.issue.blockerId,'obstacle');
  city.properties[0].boundary=poly(5,4.95,20.05,20);
  city.roads[1].waterBoundary=true;
  assert.equal(resolveBuildingAccess(city,building,building).route,null);
});

test('corner access survives portable Apply and a later edit of the newly assigned street checks the route',()=>{
  const {project,building,property,sideRoadId,dy}=cornerBuildingFixture();
  const before=JSON.stringify(project);
  const receipt=prepareBuildingApply(project,defaultWorkspace(project),building.id,{dy});
  assert.equal(receipt.ok,true,JSON.stringify(receipt.issues));
  assert.equal(receipt.frontageChanged,true);
  const city=receipt.document.project.city;
  assert.equal(city.buildings.find(row=>row.id===building.id).frontageRoadId,sideRoadId);
  assert.equal(city.properties.find(row=>row.id===property.id).frontageRoadId,property.frontageRoadId);
  assert.equal(JSON.stringify(project),before);
  const later=prepareNeighborhoodReflowC3(receipt.candidate,sideRoadId,{x:0,y:.1});
  assert.equal(later.candidateProject,null);
  assert.ok(later.unresolved.some(issue=>issue.id===building.id&&issue.code==='access-decision-required'));
});
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
