import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { createLareContext } from '../src/core/reconciliation-context.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { listSpatialAdjacentFrontages, inspectSpatialUniformSimilarity } from '../src/core/spatial-recovery-concessions.js';
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
