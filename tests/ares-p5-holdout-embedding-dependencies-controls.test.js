import test from 'node:test';
import assert from 'node:assert/strict';
import {mapEmbeddingExposure,diagnoseEmbeddingDependencies} from '../scripts/development/research/ares-p5-holdout-embedding-dependencies.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
test('Original block and frontage records are mapped without replacement ownership',async()=>{
 const c={nodes:[{id:'a'},{id:'b'},{id:'c'}],roads:[{id:'r',a:'a',b:'b'},{id:'s',a:'b',b:'c'},{id:'t',a:'c',b:'a'}],blocks:[{id:'B',vertices:['a','b','c'],districtId:'D'}],properties:[{id:'P',blockId:'B',frontageRoadId:'s'}],plots:[{id:'L',propertyId:'P'}],buildings:[{id:'H',plotId:'L'}]};
 const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768}),x=mapEmbeddingExposure(c,{affectedRoads:['r']},b);
 assert.equal(x.blocks.length,1);assert.equal(x.properties.length,1);assert.deepEqual(x.plots,['L']);assert.deepEqual(x.buildings,['H']);assert.equal(x.ownership,'not-verified');assert.equal(x.unmappedBlockEdges.length,0);
 await assert.rejects(()=>diagnoseEmbeddingDependencies('h:linear-09'),/Frozen dependency/);
});
