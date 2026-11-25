import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { discoverSpatialDependencies } from '../src/core/spatial-recovery-dependencies.js';
import { createSpatialDelta, reconstructSpatialDelta } from '../src/core/spatial-recovery-delta.js';
const budget=()=>createSpatialPreservationBudget();
const intent={version:1,family:'road',operation:'translate-road-group',projectId:'city-1',revision:3,
  editedRefs:[{collection:'roads',id:'R'}]};
const original={schemaVersion:10,city:{id:'city-1',nodes:[{id:'N1',x:0,y:0},{id:'N2',x:1,y:1}],
  roads:[{id:'R',a:'N1',b:'N2'}],blocks:[{id:'B',vertices:['N1','N2']}],
  properties:[{id:'P',blockId:'B',frontageRoadId:'R',plotIds:['Q'],buildingIds:[],extra:{keep:true}}],
  plots:[{id:'Q',propertyId:'P',blockId:'B',frontageRoadId:'R'}],buildings:[],waterFeatures:[{id:'W'}],
  bridges:[{id:'BR',waterId:'W'}],terrainFeatures:[{id:'T'}],terrainPasses:[{id:'TP',terrainId:'T'}],
  walls:[{id:'WA',waterOpenings:[{waterIds:['W']}],terrainOpenings:[{terrainIds:['T']}]}],
  gates:[{id:'G',wallId:'WA',connection:{cityNodeId:'N1'}}],towers:[{id:'TW',wallId:'WA'}],
  districts:[{id:'D',blockIds:['B']}]}};
const changed=()=>{const c=structuredClone(original);c.city.nodes[0].x=2;return c;};
test('spatial dependency inventory identifies typed cross-domain references without mutation',()=>{
  const before=JSON.stringify(original),graph=discoverSpatialDependencies(original,intent,budget());
  for (const relation of ['endpoint','vertex','frontage','property','plot','bridge-water','pass-terrain','wall-water-opening','wall-terrain-opening','gate-approach','district-block'])
    assert.ok(graph.edges.some(e=>e.relation===relation),relation);
  assert.ok(Object.isFrozen(graph.edges[0]));
  assert.equal(JSON.stringify(original),before);
  const reordered=structuredClone(original);reordered.city.nodes.reverse();
  assert.deepEqual(discoverSpatialDependencies(reordered,intent,budget()),graph);
});
test('spatial dependency inventory rejects dangling known references',()=>{
  const c=structuredClone(original);c.city.gates[0].wallId='missing';
  assert.throws(()=>discoverSpatialDependencies(c,intent,budget()),/Missing spatial dependency/);
});
test('spatial delta reconstructs exact detached JSON and preserves untouched opaque data',async()=>{
  const before=JSON.stringify(original),candidate=changed(),d=await createSpatialDelta(original,candidate,intent,1,budget());
  assert.equal(d.modified.length,1);assert.equal(d.retired.length,0);
  assert.ok(Object.isFrozen(d.modified[0].record));
  assert.deepEqual(await createSpatialDelta(original,candidate,intent,1,budget()),d);
  assert.equal(JSON.stringify(await reconstructSpatialDelta(original,intent,1,d,budget())),JSON.stringify(candidate));
  assert.equal(JSON.stringify(original),before);
});
test('spatial delta refuses stale accepted data, revision, permission, strategy and tampering',async()=>{
  const d=await createSpatialDelta(original,changed(),intent,1,budget());
  await assert.rejects(reconstructSpatialDelta(changed(),intent,1,d,budget()),/Stale/);
  await assert.rejects(reconstructSpatialDelta(original,{...intent,revision:4},1,d,budget()),/Stale/);
  await assert.rejects(reconstructSpatialDelta(original,{...intent,permissions:{destruction:true}},1,d,budget()),/Stale/);
  await assert.rejects(reconstructSpatialDelta(original,intent,2,d,budget()),/Stale/);
  const forged=structuredClone(d);forged.modified[0].record.x=999;
  await assert.rejects(reconstructSpatialDelta(original,intent,1,forged,budget()),/fingerprint/);
  const duplicate=structuredClone(d);duplicate.modified.push(duplicate.modified[0]);
  await assert.rejects(reconstructSpatialDelta(original,intent,1,duplicate,budget()),/Duplicate/);
  const missing=structuredClone(d);missing.modified=[];
  await assert.rejects(reconstructSpatialDelta(original,intent,1,missing,budget()),/fingerprint/);
});
test('spatial delta membership requires separate permissions and never permits infrastructure retirement',async()=>{
  const c=structuredClone(original);c.city.plots=[];
  await assert.rejects(createSpatialDelta(original,c,intent,1,budget()),/Unauthorized/);
  const destructive={...intent,permissions:{destruction:true}};
  const d=await createSpatialDelta(original,c,destructive,1,budget());
  // This is deliberately a structural witness, NOT a valid stored project.
  assert.equal(d.retired.length,1);
  assert.equal(JSON.stringify(await reconstructSpatialDelta(original,destructive,1,d,budget())),JSON.stringify(c));
  const infrastructure=structuredClone(original);infrastructure.city.roads=[];
  await assert.rejects(createSpatialDelta(original,infrastructure,destructive,1,budget()),/Unauthorized/);
  const addition=structuredClone(original);addition.city.plots.push({id:'Q2'});
  await assert.rejects(createSpatialDelta(original,addition,destructive,1,budget()),/Unauthorized/);
  const regen={...destructive,permissions:{destruction:true,regeneration:true}};
  const a=await createSpatialDelta(original,addition,regen,1,budget());
  assert.equal(JSON.stringify(await reconstructSpatialDelta(original,regen,1,a,budget())),JSON.stringify(addition));
});
test('spatial delta refuses unsupported root or array order changes',async()=>{
  const c=structuredClone(original);c.city.name='new';
  await assert.rejects(createSpatialDelta(original,c,intent,1,budget()),/non-collection/);
  const order=structuredClone(original);order.city.nodes.reverse();
  await assert.rejects(createSpatialDelta(original,order,intent,1,budget()),/order/);
});
