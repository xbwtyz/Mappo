import test from 'node:test';
import assert from 'node:assert/strict';
import {createLareBudget,LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {classifyLareBuilding} from '../src/core/reconciliation-policy.js';
import {transformLareBuilding,verifyLareRigidGeometry,generateLareBuildingCandidates} from '../src/core/reconciliation-buildings.js';
import {reconcileLareAccess} from '../src/core/reconciliation-access.js';
import {stampRoadGenerated} from '../src/core/road-provenance.js';
import {hydrateBuildingS10} from '../src/core/building-project-s10.js';

const rect=(l,f,r,b)=>[{x:l,y:f},{x:r,y:f},{x:r,y:b},{x:l,y:b}];
function building(ring=rect(5,8,17,12)){
  const b={id:'H',propertyId:'P',blockId:'F',frontageRoadId:'R',plotIds:['Q'],orientation:0,area:48,
    entrance:{x:(ring[0].x+ring[1].x)/2,y:ring[0].y},accessPath:[{x:(ring[0].x+ring[1].x)/2,y:ring[0].y},{x:11,y:0}],
    geometry:{version:1,regions:[{id:'ROOT',parentId:null,kind:'solid',componentId:'C',ring}]},components:[{id:'C',parentId:null}]};
  stampRoadGenerated(b);return hydrateBuildingS10(b);
}
const permission={mode:'rigid'},budget=()=>createLareBudget();
test('B1R rigid transform preserves dimensions, ID, metadata and source',()=>{
  const source=building(),before=JSON.stringify(source),moved=transformLareBuilding(source,permission,{dx:3,dy:1,angle:Math.PI/2},budget());
  assert.ok(verifyLareRigidGeometry(source,moved,budget()));assert.equal(moved.area,source.area);
  assert.equal(moved.id,source.id);assert.equal(JSON.stringify(source),before);
  assert.throws(()=>transformLareBuilding(source,permission,{scaleX:2},budget()),/rigid/);
  assert.throws(()=>transformLareBuilding(source,{mode:'fixed'},{dx:1},budget()),/fixed/);
});
test('B1R independent verifier rejects scale, reflection and metadata changes',()=>{
  const source=building(),copy=()=>JSON.parse(JSON.stringify(source));
  const scale=copy();scale.geometry.regions[0].ring[1].x+=.01;
  assert.equal(verifyLareRigidGeometry(source,scale,budget()),false);
  const reflected=copy();reflected.geometry.regions[0].ring=reflected.geometry.regions[0].ring.map(p=>({x:p.x,y:-p.y}));
  assert.equal(verifyLareRigidGeometry(source,reflected,budget()),false);
  const changed=copy();changed.components[0].name='Changed';
  assert.equal(verifyLareRigidGeometry(source,changed,budget()),false);
});
test('B1R transforms canonical multi-root and courtyard-hole geometry as one isometry',()=>{
  const b=building();b.geometry={version:3,regions:[
    {id:'A',kind:'solid',parentId:null,componentId:'C',ring:rect(5,8,17,16)},
    {id:'HOLE',kind:'void',parentId:'A',ring:rect(8,10,12,14)},
    {id:'Z',kind:'solid',parentId:null,componentId:'D',ring:rect(20,8,24,12)}
  ]};b.components=[{id:'C',parentId:null},{id:'D',parentId:'C',name:'Wing'}];b.area=96;
  stampRoadGenerated(b);assert.equal(classifyLareBuilding(b,{mode:'adaptive'}).mode,'rigid');
  const moved=transformLareBuilding(b,permission,{dx:3,dy:-1,angle:Math.PI/4},budget());
  assert.ok(verifyLareRigidGeometry(b,moved,budget()));
  assert.deepEqual(moved.geometry.regions.map(r=>r.id),['A','HOLE','Z']);
});
test('B1R rotates a building into a parcel that cannot fit its original width',()=>{
  const source=building(),property={id:'P',boundary:rect(10,5,16,22),plotIds:['Q']};
  const plots=[{id:'Q',boundary:property.boundary}];
  const run=()=>generateLareBuildingCandidates({source,permission,property,plots},budget());
  const c=run();assert.ok(c.length);assert.ok(c.every(x=>x.rotation>0));
  assert.ok(c.some(x=>Math.abs(x.rotation-Math.PI/2)<1e-6));
  assert.deepEqual(c,run());assert.ok(c.every(x=>verifyLareRigidGeometry(source,x.building,budget())));
  assert.deepEqual(generateLareBuildingCandidates({source,permission:{mode:'fixed'},property,plots},budget()),[]);
});
test('B1R work budget covers building search',()=>{
  const source=building(),property={id:'P',boundary:rect(10,5,16,22),plotIds:['Q']};
  assert.throws(()=>generateLareBuildingCandidates({source,permission,property,plots:[{id:'Q',boundary:property.boundary}]},
    createLareBudget({work:1,stateExpansions:1})),LareBudgetExceeded);
});
function accessFixture(){
  const b=building(),property={id:'P',boundary:rect(2,5,25,25),plotIds:['Q'],frontageRoadId:'R'};
  const city={buildings:[b],properties:[property],plots:[{id:'Q',boundary:property.boundary}],
    roads:[{id:'R',a:'A',b:'B',kind:'lane'},{id:'SIDE',a:'B',b:'C',kind:'lane'}],
    nodes:[{id:'A',x:0,y:1},{id:'B',x:100,y:1},{id:'C',x:100,y:100}]};
  return {b,city};
}
test('B1R reconnects generated access to the same road without moving a fixed entrance',()=>{
  const {b,city}=accessFixture(),before=JSON.stringify(city),out=reconcileLareAccess(city,b,b,{mode:'fixed'},budget());
  assert.ok(out.ok);assert.equal(out.building.frontageRoadId,'R');assert.deepEqual(out.building.entrance,b.entrance);
  assert.equal(out.building.accessPath.at(-1).y,1);assert.equal(JSON.stringify(city),before);
});
test('B1R refuses unauthorized authored route repair and missing frontage',()=>{
  const {b,city}=accessFixture();b.customName='Owner home';
  assert.equal(reconcileLareAccess(city,b,b,{mode:'fixed'},budget()).code,'access-decision-required');
  delete b.customName;city.roads=city.roads.filter(r=>r.id!=='R');
  const result=reconcileLareAccess(city,b,b,permission,budget());
  assert.equal(result.ok,false);assert.equal(result.code,'access-frontage-missing');
});
test('B1R route search refuses a fixed obstruction and never changes street',()=>{
  const {b,city}=accessFixture();
  city.properties.push({id:'BLOCK',boundary:rect(0,2,100,7)});
  const result=reconcileLareAccess(city,b,b,permission,budget());
  assert.equal(result.ok,false);assert.equal(result.code,'access-reflow-blocked');
});

test('B1R verifier refuses malformed vertices and non-finite orientation',()=>{
  const b=building(),bad=JSON.parse(JSON.stringify(b));
  bad.geometry.regions[0].ring[0].x=NaN;
  assert.equal(verifyLareRigidGeometry(b,bad,budget()),false);
  bad.geometry=JSON.parse(JSON.stringify(b.geometry));bad.orientation=NaN;
  assert.equal(verifyLareRigidGeometry(b,bad,budget()),false);
});
test('B1R fixed opaque and dependency-bearing records cannot silently repair access',()=>{
  const {b,city}=accessFixture();
  for(const reason of ['unsupported-geometry','dependent-structure','authored-or-fixed-property']){
    const result=reconcileLareAccess(city,b,b,{mode:'fixed',reason},budget());
    assert.equal(result.code,'access-decision-required');
  }
});
