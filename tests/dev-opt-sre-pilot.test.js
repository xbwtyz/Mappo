import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {manifest,tasks,aggregate,gates,targetRevision,validateSubmission} from '../scripts/development/research/sre-pilot.mjs';
import {digest} from '../scripts/development/research/contract.mjs';
const m=manifest({harnessRevision:'a'.repeat(40),runId:'123',attempt:'1'});
const evidence=()=>[0,1].map(index=>({index,manifestDigest:digest(m),targetRevision,harnessRevision:m.harnessRevision,runId:m.runId,attempt:m.attempt,rows:tasks(m,index).map(t=>({key:t.key,inputDigest:digest(t),inputFingerprint:digest(t.case),candidateFingerprint:'b'.repeat(64),status:'verified',elapsedMs:1,stats:{work:300,expansions:5},counts:{properties:0,plots:0,buildings:0},demolishedFootprint:0,scaleLoss:0,gates:Object.fromEntries(gates.map(g=>[g,true]))}))}));
test('DEV-OPT SRE cross-revision pilot pins source, permission scope and budgets',()=>{
  assert.notEqual(m.targetRevision,m.harnessRevision);assert.equal(m.targetRevision,targetRevision);
  assert.equal(m.budget.work,32000000);assert.equal(m.budget.expansions,131072);assert.equal(m.budget.concurrency,2);
  assert.equal(m.permissions.regeneration,undefined);assert.equal(new Set([...tasks(m,0),...tasks(m,1)].map(t=>t.key)).size,4);
  assert.throws(()=>tasks(m,2));
});
test('DEV-OPT SRE cross-revision evidence cannot qualify stale, incomplete or invalid outcomes',()=>{
  const ok=aggregate(m,evidence(),'success');assert.equal(ok.complete,true);assert.equal(ok.productionAdoptionAuthorized,false);
  for(const f of [e=>e.pop(),e=>e.push(e[0]),e=>e[0].targetRevision='c'.repeat(40),e=>e[0].rows[0].status='timeout',e=>e[0].rows[0].gates.permissions=false,e=>e[0].rows[0].inputFingerprint='d'.repeat(64),e=>e[0].rows[0].stats.work=32000001]){
    const e=evidence();f(e);assert.equal(aggregate(m,e,'success').complete,false);
  }
  assert.equal(aggregate(m,evidence(),'failure').complete,false);
});

test('DEV-OPT reusable SRE submission validates unseen movement partition, bounded schedules and source',()=>{
  const s=JSON.parse(readFileSync(new URL('../docs/development/research/sre-submission.json',import.meta.url),'utf8'));
  const full=manifest({harnessRevision:'a'.repeat(40),runId:'123',attempt:'1'},s);
  assert.equal(new Set([...tasks(full,0),...tasks(full,1)].map(t=>t.key)).size,8);
  assert.equal(s.cases.filter(c=>c.partition==='held-out').length,2);
  for(const edit of [x=>x.targetRevision='main',x=>x.schedules.push('arbitrary'),x=>x.cases[2].scale=.5,x=>x.cases[3].scale=2,x=>x.cases[3]={...x.cases[2],id:'duplicate'}]){
    const bad=JSON.parse(JSON.stringify(s));edit(bad);assert.throws(()=>validateSubmission(bad));
  }
});
