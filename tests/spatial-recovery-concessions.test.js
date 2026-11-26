import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { createLareContext } from '../src/core/reconciliation-context.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { listSpatialAdjacentFrontages, inspectSpatialUniformSimilarity, inspectSpatialConcessionLedger } from '../src/core/spatial-recovery-concessions.js';
import { stampRoadGenerated } from '../src/core/road-provenance.js';
const budget=()=>createSpatialPreservationBudget();
const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ids=['RD-0113','RD-0114'],offset={x:.05,y:0};
const operation=permissions=>normalizeSpatialRoadGroup(project,1,ids,offset,permissions);
const draft=prepareRoadGroupIntentB1(project,ids,offset);
const context=createLareContext(project,draft,new Map(),budget());
const clone=x=>JSON.parse(JSON.stringify(x));
test('detached SRE frontage options require permission, same-block adjacency and eligible generated children',()=>{
  const before=JSON.stringify(project),op=operation({alternativeFrontage:true});
  const eligible=context.properties.filter(p=>p.policy.mode==='adaptive'&&p.buildings.every(b=>b.mode==='rigid'));
  let checked=0;
  for(const entry of eligible){
    const options=listSpatialAdjacentFrontages(project,op,entry.id,budget());
    if(!options.length)continue;
    const block=project.city.blocks.find(b=>b.id===entry.blockId),roads=project.city.roads;
    const original=roads.find(r=>r.id===entry.frontageRoadId);
    assert.ok(options.length<=2);assert.equal(new Set(options).size,options.length);
    for(const id of options){
      const r=roads.find(x=>x.id===id);assert.notEqual(id,entry.frontageRoadId);
      assert.ok([r.a,r.b].some(n=>n===original.a||n===original.b));
      assert.ok(block.vertices.some((v,i)=>[r.a,r.b].includes(v)&&[r.a,r.b].includes(block.vertices[(i+1)%block.vertices.length])));
    }
    assert.deepEqual(listSpatialAdjacentFrontages(project,operation({}),entry.id,budget()),[]);
    assert.deepEqual(listSpatialAdjacentFrontages(project,op,entry.id,budget()),options);
    checked++;break;
  }
  assert.ok(checked,'fixture must exercise real alternative frontage proposals');
  assert.deepEqual(listSpatialAdjacentFrontages(project,op,'not-a-property',budget()),[]);
  assert.equal(JSON.stringify(project),before);
});
function scaled(source,factor){
  const candidate=clone(source),p=source.geometry.regions[0].ring[0],angle=.15,co=Math.cos(angle),si=Math.sin(angle);
  for(const region of candidate.geometry.regions)region.ring=region.ring.map(q=>{
    const x=q.x-p.x,y=q.y-p.y;return {x:p.x+.2+factor*(x*co-y*si),y:p.y+.1+factor*(x*si+y*co)};
  });
  candidate.orientation+=angle;candidate.area*=factor*factor;return candidate;
}
test('detached SRE scaling derives uniform factors, preserves canonical structure and refuses tampering',()=>{
  const before=JSON.stringify(project);
  const op=operation({uniformScaling:true,maxLinearReduction:.2});
  const entries=context.properties.filter(p=>p.policy.mode==='adaptive');
  let source;
  for(const entry of entries){
    for(const b of entry.buildings.filter(x=>x.mode==='rigid')){
      const item=project.city.buildings.find(x=>x.id===b.id);
      try{inspectSpatialUniformSimilarity(project,op,item.id,scaled(item,.95),budget());source=item;break;}
      catch(error){if(!/not eligible for uniform scaling/.test(error.message))throw error;}
    }
    if(source)break;
  }
  assert.ok(source,'fixture must exercise actual affected eligible building');
  for(const factor of [.95,.9,.8]){
    const result=inspectSpatialUniformSimilarity(project,op,source.id,scaled(source,factor),budget());
    assert.ok(Math.abs(result.factor-factor)<1e-6);assert.ok(result.footprintLoss>0);
  }
  assert.throws(()=>inspectSpatialUniformSimilarity(project,operation({}),source.id,scaled(source,.95),budget()),/not permitted/);
  assert.throws(()=>inspectSpatialUniformSimilarity(project,operation({uniformScaling:true,maxLinearReduction:.05}),source.id,scaled(source,.9),budget()),/refused/);
  for(const factor of [.79,1.01])assert.throws(()=>inspectSpatialUniformSimilarity(project,op,source.id,scaled(source,factor),budget()),/refused/);
  for(const tamper of [b=>b.geometry.regions[0].ring[2].x+=.1,b=>b.area+=1,b=>b.propertyId='wrong',b=>b.frontageRoadId='wrong',b=>b.components[0].id='wrong',b=>b.orientation+=.1]){
    const candidate=scaled(source,.95);tamper(candidate);
    assert.throws(()=>inspectSpatialUniformSimilarity(project,op,source.id,candidate,budget()),/refused/);
  }
  assert.equal(JSON.stringify(project),before);
});

test('detached candidate concession ledger derives exact switches and scale loss, never grants edit authority',()=>{
  const before=JSON.stringify(project),op=operation({alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.1});
  let selected;
  for(const entry of context.properties){
    if(!entry.buildings.length)continue;
    const options=listSpatialAdjacentFrontages(project,op,entry.id,budget());
    if(options.length){selected={entry,to:options[0]};break;}
  }
  assert.ok(selected,'fixture must exercise eligible switched property and building');
  const {entry,to}=selected;
  // Synthetic reference and similarity witness only: this intentionally does
  // not claim that old parcel geometry fits the new frontage or road intent.
  const candidate=clone(project),p=candidate.city.properties.find(r=>r.id===entry.id);
  const from=p.frontageRoadId;
  p.frontageRoadId=to;
  const plots=p.plotIds.map(id=>candidate.city.plots.find(r=>r.id===id));
  for(const plot of plots)plot.frontageRoadId=to;
  const children=p.buildingIds.map(id=>candidate.city.buildings.find(r=>r.id===id));
  const first=children[0],b=scaled(first,.95);
  Object.assign(first,b);
  for(const child of children){child.frontageRoadId=to;stampRoadGenerated(child);}
  stampRoadGenerated(p,plots);
  const ledger=inspectSpatialConcessionLedger(project,op,candidate,budget());
  assert.deepEqual(ledger.frontageSwitches,[{propertyId:p.id,from,to}]);
  assert.equal(ledger.scaledBuildings.length,1);
  assert.equal(ledger.scaledBuildings[0].buildingId,first.id);
  assert.ok(Math.abs(ledger.scaledBuildings[0].factor-.95)<1e-6);
  assert.ok(ledger.footprintLoss>0);
  assert.deepEqual(inspectSpatialConcessionLedger(project,op,candidate,budget()),ledger);
  assert.throws(()=>inspectSpatialConcessionLedger(project,operation({uniformScaling:true}),candidate,budget()),/Unauthorized alternative frontage/);
  assert.throws(()=>inspectSpatialConcessionLedger(project,operation({alternativeFrontage:true}),candidate,budget()),/not permitted/);
  for(const tamper of [
    c=>c.city.plots.find(r=>r.id===plots[0].id).frontageRoadId=from,
    c=>c.city.buildings.find(r=>r.id===first.id).frontageRoadId=from,
    c=>c.city.buildings.find(r=>r.id===first.id).propertyId='wrong',
    c=>c.city.buildings.pop(),
    c=>c.city.properties.find(r=>r.id===p.id).frontageRoadId='wrong'
  ]){
    const altered=clone(candidate);tamper(altered);
    assert.throws(()=>inspectSpatialConcessionLedger(project,op,altered,budget()));
  }
  const unchanged=inspectSpatialConcessionLedger(project,operation({}),project,budget());
  assert.deepEqual(unchanged,{frontageSwitches:[],scaledBuildings:[],footprintLoss:0});
  assert.equal(JSON.stringify(project),before);
});
