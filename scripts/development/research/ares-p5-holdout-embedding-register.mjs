import test from 'node:test';
import assert from 'node:assert/strict';
import {EMBEDDING_CASES,diagnoseHoldoutEmbedding} from './ares-p5-holdout-embedding-diagnostics.mjs';
export function registerEmbedding(morphology){
 for(const id of EMBEDDING_CASES.filter(x=>x.startsWith('h:'+morphology+'-')))test('Read-only embedding consequences '+id,async()=>{
  const r=await diagnoseHoldoutEmbedding(id);console.log('ARES_HOLDOUT_EMBEDDING '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.equal(r.cyclicGate,'required');assert.ok(['diagnosed','work-limit'].includes(r.status));
  assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
  if(r.status==='diagnosed'){assert.ok(r.observations.length>=1);for(const x of r.observations){assert.equal(x.embedding.beforeWalks,x.embedding.unchanged+x.embedding.removed.length);assert.equal(x.embedding.afterWalks,x.embedding.unchanged+x.embedding.added.length);assert.equal(x.domainVerification,'not-performed');}}
 });
}
