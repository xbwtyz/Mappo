import test from 'node:test';
import assert from 'node:assert/strict';
import {createLareBudget} from '../src/core/reconciliation-budget.js';
import {verifyLareGroupPreservation} from '../src/core/reconciliation-preservation.js';
import {stampRoadGenerated} from '../src/core/road-provenance.js';
import {transformLareBuilding} from '../src/core/reconciliation-buildings.js';

const rect=(l,f,r,b)=>[{x:l,y:f},{x:r,y:f},{x:r,y:b},{x:l,y:b}];
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const boundary=rect(10,5,40,30);
  const property={id:'P',blockId:'F',frontageRoadId:'R',boundary,plotIds:['Q1','Q2'],buildingIds:['H']};
  const plots=[{id:'Q1',propertyId:'P',blockId:'F',frontageRoadId:'R',boundary:rect(10,5,25,30)},
    {id:'Q2',propertyId:'P',blockId:'F',frontageRoadId:'R',boundary:rect(25,5,40,30)}];
  const building={id:'H',propertyId:'P',blockId:'F',frontageRoadId:'R',plotIds:['Q1'],orientation:0,area:16,
    entrance:{x:14,y:8},accessPath:[{x:14,y:8},{x:14,y:0}],
    geometry:{version:1,regions:[{id:'ROOT',parentId:null,kind:'solid',componentId:'C',ring:rect(12,8,16,12)}]},
    components:[{id:'C',parentId:null}]};
  stampRoadGenerated(property,plots);stampRoadGenerated(building);
  const before={schemaVersion:10,city:{nodes:[{id:'N',x:0,y:0}],roads:[{id:'R'}],blocks:[{id:'F',vertices:['N'],area:1000}],
    properties:[property],plots,buildings:[building],openSpaces:[]}};
  const draft={group:{eligible:true},draftable:true,topologyResolved:true,facesResolved:true,status:'neighborhood-needed',
    selectedRoadIds:['R','S'],proposedNodes:[{id:'N',x:1,y:0}]};
  const after=()=>{const p=copy(before);p.city.nodes[0].x=1;return p;};
  return {before,draft,after,property,plots,building};
}
const check=(f,after,choices=new Map())=>verifyLareGroupPreservation(f.before,after,f.draft,choices,createLareBudget());
test('B1R independent group gate accepts exact preservation and a single rigid generated motion',()=>{
  const f=fixture(),a=f.after();assert.equal(check(f,a),null);
  const b=transformLareBuilding(f.building,{mode:'rigid'},{dx:1,dy:0,angle:0},createLareBudget());
  stampRoadGenerated(b);a.city.buildings[0]=b;
  assert.equal(check(f,a),null);
});
test('B1R independent group gate rejects changed footprint scale and protected identity',()=>{
  const f=fixture(),a=f.after();a.city.buildings[0].geometry.regions[0].ring[1].x+=1;
  assert.equal(check(f,a).code,'lare-rigid-preservation');
  const b=f.after();b.city.buildings[0].id='REPLACEMENT';
  assert.equal(check(f,b).code,'group-identity-change');
});
test('B1R independent group gate protects generated children of authored parcels',()=>{
  const f=fixture();f.property.customName='Owner yard';
  const a=f.after(),moved=transformLareBuilding(f.building,{mode:'rigid'},{dx:1},createLareBudget());
  stampRoadGenerated(moved);a.city.buildings[0]=moved;
  assert.equal(check(f,a,new Map([['P',{kind:'reshape'}]])).code,'lare-rigid-preservation');
});
test('B1R independent group gate requires explicit authored archive and valid plot topology',()=>{
  const f=fixture();f.property.customName='Owner yard';
  const a=f.after();a.city.properties[0].boundary=rect(10,5,42,30);
  a.city.plots[1].boundary=rect(25,5,42,30);
  assert.equal(check(f,a).code,'lare-fixed-parcel');
  const choices=new Map([['P',{kind:'reshape'}]]);
  assert.equal(check(f,a,choices).code,'lare-archive');
  a.city.roadParcelDecisionHistory028=[{kind:'reshape',sourceId:'P',targetId:null,
    source:{property:copy(f.property),plots:copy(f.plots),buildings:[copy(f.building)]}}];
  assert.equal(check(f,a,choices),null);
  a.city.plots[1].boundary=rect(26,5,42,30);
  assert.equal(check(f,a,choices).code,'lare-plot-topology');
});
test('B1R independent group gate refuses unapproved access and a tampered archive',()=>{
  const f=fixture();f.building.customName='Owner home';
  const a=f.after();a.city.buildings[0].accessPath[1].x+=1;
  assert.equal(check(f,a).code,'lare-protected-access');
  const b=f.after();b.city.roadParcelDecisionHistory028=[{kind:'reshape',sourceId:'P',targetId:null,source:{}}];
  assert.equal(check(f,b).code,'lare-archive');
});
