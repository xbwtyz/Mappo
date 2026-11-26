import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest,tasks,aggregate,gates,researchConcurrency} from '../scripts/development/research/sre-pilot.mjs';
import {digest} from '../scripts/development/research/contract.mjs';
const m=manifest({harnessRevision:'a'.repeat(40),runId:'123',attempt:'1'});
const indices=[0,1,2,3];
const evidence=()=>indices.map(index=>({index,manifestDigest:digest(m),targetRevision:m.targetRevision,harnessRevision:m.harnessRevision,runId:m.runId,attempt:m.attempt,rows:tasks(m,index).map(t=>({key:t.key,inputDigest:digest(t),inputFingerprint:digest(t.case),operationFingerprint:digest(['op',t.case]),candidateFingerprint:'b'.repeat(64),status:'verified',elapsedMs:1,stats:{work:300,expansions:5},counts:{properties:0,plots:0,buildings:0},demolishedFootprint:0,scaleLoss:0,gates:Object.fromEntries(gates.map(g=>[g,true]))}))}));
test('four runners partition the matrix exactly once with at most one task imbalance',()=>{
  assert.equal(researchConcurrency,4);assert.equal(m.budget.concurrency,4);
  const small=indices.map(i=>tasks(m,i));assert.deepEqual(small.map(x=>x.length),[1,1,1,1]);
  const cases=[...m.cases,{id:'regular-extra',partition:'development',irregularProperties:false,scale:-1,expectation:'exploratory'}];
  const larger=manifest({harnessRevision:m.harnessRevision,runId:m.runId,attempt:m.attempt},{version:1,targetRevision:m.targetRevision,schedules:['baseline','diversified-restoration','grouped-first'],cases:cases.map(c=>({...c,expectation:c.expectation==='known-compression'?'exploratory':c.expectation}))});
  const parts=indices.map(i=>tasks(larger,i));
  assert.equal(new Set(parts.flat().map(t=>t.key)).size,9);
  assert.equal(parts.flat().length,9);
  assert.ok(Math.max(...parts.map(x=>x.length))-Math.min(...parts.map(x=>x.length))<=1);
  assert.throws(()=>tasks(m,4));assert.throws(()=>tasks({...m,budget:{...m.budget,concurrency:2}},0));
});
test('all four exact shards required; missing, duplicate, cross-shard or stale evidence fails closed',()=>{
  const ok=aggregate(m,evidence(),'success');assert.equal(ok.complete,true);assert.equal(ok.productionAdoptionAuthorized,false);
  assert.equal(aggregate(m,evidence().reverse(),'success').complete,true);
  for(const edit of [e=>e.pop(),e=>e.push(e[3]),e=>e[3].attempt='2',e=>e[3].index=4,e=>e[3].rows[0]=e[0].rows[0],e=>e[3].rows[0].gates.deterministicReplay=false]){
    const e=evidence();edit(e);assert.equal(aggregate(m,e,'success').complete,false);
  }
  assert.equal(aggregate(m,evidence(),'failure').complete,false);
});
