import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archiveRequest,archiveRange,priorArchiveSource,validateArchiveEvidence} from '../scripts/ci-archive.mjs';
const head='a'.repeat(40),before='b'.repeat(40),branch='feature/archive',repository='xbwtyz/Mappo';
const doc={path:'docs/plans/0.3x/ares-example.md',mode:'100644',status:'M'};
const json={path:'docs/research/evidence/example-12-34.json',mode:'100644',status:'A'};
const base={head,before,parents:[before],eventName:'push',after:head,branch,pulls:[{state:'open',draft:true,head:{sha:head}}],message:'Archive [archive-ci]',changes:[doc,json]};
test('archive selection admits only exact single-parent draft push and allowed paths',()=>{
  assert.equal(archiveRange(base),true);assert.equal(archiveRange({...base,changes:[doc]}),true);
  for(const patch of [{message:'ordinary'},{message:'[archive-ci] [full-ci]'},{message:'[archive-ci] [benchmark-c7]'},{message:'[archive-ci] [acceptance-package]'},{eventName:'pull_request'},{after:before},{parents:[before,head]},{before:head},{branch:'main'},{pulls:[]},{pulls:[{state:'open',draft:false,head:{sha:head}}]},{pulls:[{state:'open',draft:true,head:{sha:before}}]},{changes:[]},{changes:[doc,doc]}])
    assert.equal(archiveRange({...base,...patch}),false);
});
test('mixed code, fixtures, executable modes, deletions and archive modifications cannot skip normal CI',()=>{
  for(const c of [{...json,status:'M'},{...json,status:'D'},{...json,mode:'120000'},{...doc,mode:'100755'},{...doc,status:'D'},
    ...['src/core/version.js','index.html','dist/mappo-0.2.25-dev.html','tests/fixtures/ares-p4-evidence/x.json','tests/ci-archive.test.js','scripts/ci-archive.mjs','.github/workflows/ci-fast.yml','docs/research/evidence/a.mjs','docs/research/evidence/../a.json','docs/contributing/ci-policy.md'].map(path=>({...json,path}))])
    assert.equal(archiveRange({...base,changes:[doc,c]}),false,c.path);
});
const run={id:12,run_attempt:1,head_sha:before,head_branch:branch,repository:{full_name:repository},event:'push',name:'Mappo Fast Checks',status:'completed',conclusion:'success'};
const step=name=>({name,conclusion:'success'});
const job={id:34,run_id:12,run_attempt:1,head_sha:before,name:'Build, syntax and targeted Node smoke tests',status:'completed',conclusion:'success',steps:['Select exact-push incremental checks','Build and verify offline standalone parity','Run smoke tests and directly modified Node tests'].map(step)};
const response={total_count:1,jobs:[job]},identity={source:before,branch,repository};
test('substantive exact prior CI required; skipped build, archived parent and routing-only never qualify',()=>{
  assert.deepEqual(priorArchiveSource(run,response,identity),{shards:1,jobId:34,completionJobId:null});
  for(const r of [{...run,head_sha:head},{...run,status:'in_progress'},{...run,conclusion:'failure'},{...run,event:'pull_request'},{...run,head_branch:'other'}])assert.equal(priorArchiveSource(r,response,identity),null);
  for(const j of [{...job,head_sha:head},{...job,run_attempt:2},{...job,steps:[step('Validate eligible archival-only push')]},{...job,steps:job.steps.slice(0,2)}])assert.equal(priorArchiveSource(run,{total_count:1,jobs:[j]},identity),null);
  assert.equal(priorArchiveSource(run,{...response,total_count:2},identity),null);
});
test('archive validates exact provenance and unique nonempty rows',()=>{
  const context={source:before,run,jobs:[job],execution:priorArchiveSource(run,response,identity)};
  const evidence={version:1,source:before,run:12,attempt:1,aggregate:34,job:34,rows:[{id:'case-a',value:1}]};
  assert.deepEqual(validateArchiveEvidence(evidence,context),['case-a']);
  for(const patch of [{source:head},{run:13},{attempt:2},{aggregate:35},{job:35},{rows:[]},{rows:[{id:'x'},{id:'x'}]},{rows:[{value:1}]},{rows:[{id:'x',value:Infinity}]}])
    assert.throws(()=>validateArchiveEvidence({...evidence,...patch},context));
  assert.throws(()=>validateArchiveEvidence(JSON.parse('{"__proto__":{}}'),context));
});
test('workflow gate keeps normal path and full gates distinct',()=>{
  const fast=readFileSync(new URL('../.github/workflows/ci-fast.yml',import.meta.url),'utf8');
  assert.match(fast,/run: node scripts\/ci-archive\.mjs/);
  assert.match(fast,/steps\.archive\.outputs\.archive != 'true'/);
  assert.equal((fast.match(/fetch-depth: 0/g)||[]).length,3);
  assert.equal(archiveRequest('[archive-ci] [full-ci-benchmark]'),false);
});
