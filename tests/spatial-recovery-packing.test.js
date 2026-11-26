import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { scoreSpatialPreservation, compareSpatialPreservationCost, preferVerifiedSpatialPreservation } from '../src/core/spatial-recovery-score.js';
import { iterateSpatialPackingSeeds } from '../src/core/spatial-recovery-packing.js';
import { transformLareBuilding, verifyLareRigidGeometry } from '../src/core/reconciliation-buildings.js';
import { finishLareSteps } from '../src/core/reconciliation-steps.js';
import { createProject } from '../src/core/city-model.js';
import { prepareRoadGroupIntentB1, readRoadGroupTopologyB1 } from '../src/core/road-intent-c1.js';
import { createLareContext } from '../src/core/reconciliation-context.js';
const budget=()=>createSpatialPreservationBudget();
const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
test('SRE score derives preservation metrics and retains incumbent on equal or inferior cost',()=>{
  const cost=scoreSpatialPreservation(project,project,budget());
  assert.deepEqual(cost,{movedBuildings:0,displacement:0,rotation:0,propertyDeformation:0,plotDeformation:0,accessChanges:0});
  const a={cost},b={cost:{...cost,movedBuildings:1}};
  assert.equal(compareSpatialPreservationCost(a.cost,b.cost),-1);
  assert.equal(preferVerifiedSpatialPreservation(a,b),a);
  assert.equal(preferVerifiedSpatialPreservation(b,a),a);
  assert.equal(preferVerifiedSpatialPreservation(a,{cost}),a);
  assert.equal(preferVerifiedSpatialPreservation(a,null),a);
  assert.throws(()=>compareSpatialPreservationCost({...cost,rotation:NaN},cost),/score/);
});
test('SRE packing seeds use real generated rigid children, deterministic frontage and no geometry scaling',()=>{
  const before=JSON.stringify(project),draft=prepareRoadGroupIntentB1(project,['RD-0113','RD-0114'],{x:.05,y:0});
  const context=createLareContext(project,draft,new Map(),budget());
  const topology=readRoadGroupTopologyB1(project,draft),city=project.city;
  const rows=context.properties.filter(p=>p.policy.mode==='adaptive'&&p.policy.provenance==='generated'&&
    p.buildings.length&&p.buildings.every(b=>b.mode==='rigid'&&b.provenance==='generated'));
  assert.ok(rows.length,'fixture has generated rigid parcel');
  let checked=0;
  for(const row of rows){
    const property=city.properties.find(p=>p.id===row.id),block=city.blocks.find(b=>b.id===row.blockId);
    const road=city.roads.find(r=>r.id===row.frontageRoadId);
    const i=block.vertices.findIndex((id,j)=>[road.a,road.b].includes(id)&&[road.a,road.b].includes(block.vertices[(j+1)%block.vertices.length]));
    if(i<0)continue;
    const edge={road,a:topology.graph.nodesById.get(block.vertices[i]),b:topology.graph.nodesById.get(block.vertices[(i+1)%block.vertices.length])};
    const buildings=row.buildings.map(permission=>({permission,source:city.buildings.find(b=>b.id===permission.id)}));
    const request={property,policy:row.policy,buildings,edge};
    const proposals=finishLareSteps(iterateSpatialPackingSeeds(request,budget()));
    if(!proposals.length)continue;
    assert.ok(proposals.length<=24);
    assert.deepEqual(finishLareSteps(iterateSpatialPackingSeeds({...request,buildings:buildings.slice().reverse()},budget())),proposals);
    for(const seed of proposals[0].seeds){
      const {source,permission}=buildings.find(b=>b.source.id===seed.id);
      const next=transformLareBuilding(source,permission,{dx:seed.dx,dy:seed.dy,angle:seed.angle},budget());
      assert.ok(verifyLareRigidGeometry(source,next,budget()));
    }
    assert.deepEqual(finishLareSteps(iterateSpatialPackingSeeds({...request,policy:{mode:'fixed',provenance:'custom'}},budget())),[]);
    checked++;break;
  }
  assert.ok(checked,'at least one real packing proposal');
  assert.equal(JSON.stringify(project),before);
});
