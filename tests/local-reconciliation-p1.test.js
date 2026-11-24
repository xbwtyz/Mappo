import test from 'node:test';
import assert from 'node:assert/strict';
import {stampRoadGenerated} from '../src/core/road-provenance.js';
import {classifyLareProperty,classifyLareBuilding,LARE_POLICY_B1R} from '../src/core/reconciliation-policy.js';
import {createLareBudget,LareBudgetExceeded} from '../src/core/reconciliation-budget.js';
import {lareConflict} from '../src/core/reconciliation-diagnostics.js';
import {createLareContext} from '../src/core/reconciliation-context.js';

function fixture(){
  const plot={id:'P1',propertyId:'P',boundary:[]};
  const property={id:'P',blockId:'B',frontageRoadId:'R',plotIds:['P1'],buildingIds:['H']};
  const building={id:'H',blockId:'B',propertyId:'P',plotIds:['P1'],frontageRoadId:'R',
    orientation:0,entrance:{x:0,y:0},accessPath:[{x:0,y:0},{x:0,y:-1}],
    geometry:{version:1,regions:[{id:'REG-ROOT',parentId:null,kind:'solid',componentId:'BC-ROOT',
      ring:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]}]},components:[{id:'BC-ROOT',parentId:null}]};
  stampRoadGenerated(property,[plot]);stampRoadGenerated(building);
  return {property,plot,building,project:{schemaVersion:10,city:{blocks:[{id:'B',vertices:['N']}],
    properties:[property],plots:[plot],buildings:[building]}},
    draft:{group:{eligible:true},topologyResolved:true,facesResolved:true,draftable:true,
      status:'neighborhood-needed',proposedNodes:[{id:'N',x:1,y:1}]}};
}
test('strict B1R policy prohibits destructive fallback',()=>{
  for(const key of ['allowRegeneration','allowOwnershipChange','allowTopologyChange','allowFrontageChange','allowAuthoredBuildingMove'])
    assert.equal(LARE_POLICY_B1R[key],false);
});
test('B1R protects authored parcels, unknown buildings and opaque geometry',()=>{
  const {property,plot,building}=fixture(),generated=classifyLareProperty(property,[plot]);
  assert.equal(generated.mode,'adaptive');
  assert.equal(classifyLareBuilding(building,generated).mode,'rigid');
  assert.equal(classifyLareBuilding(building,generated,true).mode,'fixed');
  const opaque=structuredClone(building);opaque.extension={point:{x:1,y:2}};stampRoadGenerated(opaque);
  assert.equal(classifyLareBuilding(opaque,generated).reason,'unsupported-geometry');
  delete opaque.roadProvenance;
  assert.equal(classifyLareBuilding(opaque,generated).reason,'authored-or-unknown');
  property.customName='Owner yard';
  assert.equal(classifyLareProperty(property,[plot]).mode,'decision-required');
  assert.equal(classifyLareProperty(property,[plot],{kind:'replace'}).mode,'invalid-choice');
  const authorized=classifyLareProperty(property,[plot],{kind:'reshape'});
  assert.equal(authorized.mode,'authorized-reshape');
  assert.equal(classifyLareBuilding(building,authorized).mode,'fixed');
});
test('B1R budget is shared and cannot be refunded',()=>{
  const b=createLareBudget({work:4,stateExpansions:2});
  b.spend(2);b.expand();b.expand();
  assert.deepEqual(b.snapshot(),{work:4,expansions:2,remainingWork:0,remainingExpansions:0});
  assert.throws(()=>b.spend(),LareBudgetExceeded);
  assert.throws(()=>b.expand(),LareBudgetExceeded);
  assert.throws(()=>b.spend(-1),/positive integer/);
  assert.throws(()=>createLareBudget({work:1000001,stateExpansions:2}),/Invalid/);
});
test('B1R diagnostics distinguish search exhaustion from obstruction',()=>{
  const i=lareConflict('search-exhausted','no-layout',['P2','P1','P2'],'No supported candidate found.');
  assert.deepEqual(i.entityIds,['P1','P2']);assert.ok(Object.isFrozen(i.entityIds));
  assert.equal(i.type,'search-exhausted');
  assert.throws(()=>lareConflict('impossible','x',[],'x'),/Invalid/);
});
test('B1R context is detached and rejects stale decisions and topology changes',()=>{
  const {project,draft}=fixture(),before=JSON.stringify(project);
  const run=()=>createLareContext(project,draft,new Map(),createLareBudget()),c=run();
  assert.deepEqual(c,run());assert.equal(c.properties[0].buildings[0].mode,'rigid');
  assert.throws(()=>c.properties[0].plotIds.push('P2'),TypeError);
  assert.throws(()=>createLareContext(project,draft,new Map([['missing',{kind:'keep'}]]),createLareBudget()),/Stale/);
  assert.throws(()=>createLareContext(project,{...draft,facesResolved:false},new Map(),createLareBudget()),/topology-preserving/);
  assert.equal(JSON.stringify(project),before);
});

test('B1R never grants adaptation to opaque stamped parcel or plot geometry',()=>{
  const {property,plot}=fixture();
  property.opaqueGeometry={x:1,y:2};stampRoadGenerated(property,[plot]);
  assert.equal(classifyLareProperty(property,[plot]).mode,'fixed-unsupported');
  delete property.opaqueGeometry;plot.opaqueGeometry={x:2,y:3};stampRoadGenerated(property,[plot]);
  assert.equal(classifyLareProperty(property,[plot]).mode,'fixed-unsupported');
});
test('B1R compound member stays fixed even with otherwise generated provenance',()=>{
  const {project,draft,property,plot}=fixture();
  property.buildingCompounds=[{id:'CMP',memberBuildingIds:['H']}];stampRoadGenerated(property,[plot]);
  const context=createLareContext(project,draft,new Map(),createLareBudget());
  assert.equal(context.properties[0].buildings[0].reason,'dependent-structure');
});
