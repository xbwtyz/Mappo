import test from 'node:test';
import assert from 'node:assert/strict';
import {EMBEDDING_DEPENDENCY_CASES,diagnoseEmbeddingDependencies} from './ares-p5-holdout-embedding-dependencies.mjs';
export function registerEmbeddingDependencies(morphology){
 for(const id of EMBEDDING_DEPENDENCY_CASES.filter(x=>x.startsWith('h:'+morphology+'-')))test('Original land dependency exposure '+id,async()=>{
  const r=await diagnoseEmbeddingDependencies(id);console.log('ARES_HOLDOUT_EMBEDDING_DEPENDENCIES '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
  assert.ok(['diagnosed','work-limit'].includes(r.status));
  for(const o of r.observations){assert.equal(o.exposure.ownership,'not-verified');assert.equal(o.exposure.replacementFaces,'not-constructed');if(o.changedOrders===0)assert.equal(o.exposure.affectedRoads.length,0);}
 });
}
