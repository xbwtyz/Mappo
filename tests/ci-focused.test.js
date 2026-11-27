import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changeRange, selectTests, verifiedMainRun, MAIN_JOBS, adaptiveFocusGroups, verifyFocusPlan, verifyFocusReports } from '../scripts/ci-focused.mjs';
const head='a'.repeat(40),before='b'.repeat(40),main='c'.repeat(40),old='d'.repeat(40);
const range={head,before,parents:[before,main],mainAncestor:main,verifiedMain:main,isAncestor:()=>true};
test('only a verified exact-main two-parent reconciliation narrows the range',()=>{
  assert.deepEqual(changeRange(range),{base:main,mode:'verified-main-reconciliation'});
  for(const delta of [{verifiedMain:null},{verifiedMain:old},{mainAncestor:null},{parents:[before,main,old]},{parents:[old,main]}])
    assert.deepEqual(changeRange({...range,...delta}),{base:before,mode:'push-range'});
});
test('linear and multi-commit pushes use the actual before SHA, not HEAD parent',()=>{
  assert.deepEqual(changeRange({...range,parents:[old]}),{base:before,mode:'push-range'});
  assert.deepEqual(changeRange({...range,isAncestor:()=>false}),{base:null,mode:'conservative-inventory'});
  assert.deepEqual(changeRange({...range,before:head}),{base:null,mode:'conservative-inventory'});
  assert.throws(()=>changeRange({...range,head:'bad'}));
});
test('new branches narrow only from a verified main parent',()=>{
  const x={...range,before:'0'.repeat(40),parents:[main]};
  assert.deepEqual(changeRange(x),{base:main,mode:'verified-new-branch'});
  assert.deepEqual(changeRange({...x,verifiedMain:null}),{base:null,mode:'conservative-inventory'});
});
test('main evidence requires the exact successful push and every same-attempt mandatory job',()=>{
  const run={head_sha:main,head_branch:'main',event:'push',name:'Mappo CI',status:'completed',conclusion:'success',id:12,run_attempt:2};
  const jobs=MAIN_JOBS.map(name=>({name,run_id:12,run_attempt:2,status:'completed',conclusion:'success'}));
  const report={total_count:jobs.length,jobs};
  assert.equal(verifiedMainRun(main,run,report),true);
  for(const delta of [{head_sha:old},{event:'pull_request'},{head_branch:'other'},{conclusion:'cancelled'},{status:'in_progress'},{run_attempt:1}])
    assert.equal(verifiedMainRun(main,{...run,...delta},report),false);
  for(const delta of [{jobs:jobs.slice(1)},{total_count:99},{jobs:[...jobs.slice(1),jobs[1]]},{jobs:[{...jobs[0],conclusion:'skipped'},...jobs.slice(1)]},{jobs:[{...jobs[0],run_attempt:1},...jobs.slice(1)]}])
    assert.equal(verifiedMainRun(main,run,{...report,...delta}),false);
});
const inv=['build','core','persistence','ci-trigger','road-preview','ci-focused','dev-opt-sre-pilot','spatial-recovery-quality','road-group-b1','property-edit','building-validation','schema11-migration','geometry','workspace','other'].map(x=>'tests/'+x+'.test.js');
test('infrastructure branch retains smoke and own tests without unrelated heavy SRE files',()=>{
  const p=selectTests(['.github/workflows/ci-fast.yml','scripts/ci-focused.mjs','tests/dev-opt-sre-pilot.test.js','docs/plans/dev-opt/approved-plan.md'],inv);
  assert.deepEqual(p.profiles,['infrastructure']);
  for(const n of ['build','core','persistence','ci-trigger','road-preview','ci-focused','dev-opt-sre-pilot']) assert.ok(p.tests.includes('tests/'+n+'.test.js'));
  assert.ok(!p.tests.includes('tests/spatial-recovery-quality.test.js'));
});
test('directly modified tests and cross-domain profiles are always included',()=>{
  assert.ok(selectTests(['tests/other.test.js'],inv).tests.includes('tests/other.test.js'));
  const p=selectTests(['src/editor/road-application.js'],inv);
  for(const n of ['spatial-recovery-quality','road-group-b1','property-edit','building-validation','schema11-migration']) assert.ok(p.tests.includes('tests/'+n+'.test.js'));
  assert.ok(selectTests(['src/core/spatial-recovery-quality.js'],inv).tests.includes('tests/spatial-recovery-quality.test.js'));
  assert.ok(selectTests(['src/data/project-format.js'],inv).tests.includes('tests/schema11-migration.test.js'));
  assert.ok(selectTests(['styles/editor.css'],inv).tests.includes('tests/workspace.test.js'));
});
test('unknown, shared, deleted fixture, and missing range escalate; direct tests cannot vanish silently',()=>{
  for(const path of ['src/core/geometry.js','src/core/validate-layout.js','tests/fixtures/new.json','scripts/build.mjs','unknown/path']) {
    const p=selectTests([path],inv);
    assert.deepEqual(p.profiles,['all']);assert.deepEqual(p.tests,[...inv].sort());
  }
  assert.deepEqual(selectTests([],inv,true).tests,[...inv].sort());
  assert.deepEqual(selectTests(['tests/deleted.test.js'],inv).tests,[...inv].sort());
  assert.throws(()=>selectTests([],inv.slice(1)),/Missing required smoke/);
  assert.throws(()=>selectTests([], [...inv,inv[0]]),/Duplicate/);
});
test('workflow retains parity, exact gate precedence, and independent full CI',()=>{
  const quick=readFileSync(new URL('../.github/workflows/ci-fast.yml',import.meta.url),'utf8');
  const full=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.doesNotMatch(quick,/runner\.temp/);
  assert.match(quick,/fetch-depth: 0/);assert.match(quick,/run: node scripts\/ci-trigger\.mjs fast/);
  assert.match(quick,/run: node scripts\/ci-focused\.mjs plan/);
  assert.match(quick,/run: node scripts\/ci-focused\.mjs syntax/);
  assert.match(quick,/run: node scripts\/ci-focused\.mjs test/);
  assert.match(quick,/git diff --exit-code -- index\.html/);
  assert.match(full,/shard: \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16\]/);assert.match(full,/suite: \[desktop, roads, property, integration\]/);
  assert.match(full,/name: Build, Node tests and browser QA/);
});

test('sixteen-runner current gate rejects old or mixed architecture and missing late shards',()=>{
  const run={head_sha:main,head_branch:'main',event:'push',name:'Mappo CI',status:'completed',conclusion:'success',id:12,run_attempt:2};
  const jobs=MAIN_JOBS.map(name=>({name,run_id:12,run_attempt:2,status:'completed',conclusion:'success'}));
  assert.equal(MAIN_JOBS.length,22);
  const oldJobs=jobs.filter(j=>!j.name.startsWith('Node regression')).concat([1,2].map(i=>({...jobs[0],name:'Node regression (shard '+i+'/2)'})));
  assert.equal(verifiedMainRun(main,run,{total_count:oldJobs.length,jobs:oldJobs}),false);
  assert.equal(verifiedMainRun(main,run,{total_count:oldJobs.length,jobs:oldJobs},2),true);
  for(const changed of [jobs.filter(j=>j.name!=='Node regression (shard 16/16)'),[...jobs,oldJobs.at(-1)],jobs.map(j=>j.name==='Node regression (shard 16/16)'?{...j,run_attempt:1}:j)]){
    assert.equal(verifiedMainRun(main,run,{total_count:changed.length,jobs:changed}),false);
  }
});

test('adaptive focused assignment keeps selected files exactly once and rejects stale or tampered plans',()=>{
  const weights=JSON.parse(readFileSync(new URL('../scripts/ci-node-weights.json',import.meta.url),'utf8'));
  const light=adaptiveFocusGroups(weights,['tests/ci-trigger.test.js']);
  assert.equal(light.shards,1);
  const broad=adaptiveFocusGroups(weights,weights.files.map(x=>x.file),{broad:true});
  assert.equal(broad.shards,16);
  const selection=selectTests(['scripts/build.mjs'],inv);
  const execution=adaptiveFocusGroups(weights,selection.tests,{broad:true});
  const plan={version:2,head,runId:'42',attempt:'1',base:before,changedPaths:['scripts/build.mjs'],...selection,execution};
  const context={head,runId:'42',attempt:'1',inventory:inv,weights};
  assert.deepEqual(verifyFocusPlan(plan,context),execution);
  assert.deepEqual(execution.groups.flatMap(g=>g.files).sort(),selection.tests);
  for(const change of [x=>x.attempt='2',x=>x.head=old,x=>x.tests.pop(),x=>x.execution.groups[0].files.pop()]){
    const bad=structuredClone(plan);change(bad);assert.throws(()=>verifyFocusPlan(bad,context));
  }
  const counts={tests:1,passed:1,failed:0,cancelled:0,skipped:0,todo:0};
  const reports=execution.groups.map(g=>({version:1,source:head,runId:'42',attempt:'1',shard:g.shard,shards:execution.shards,node:'v22',platform:'linux',arch:'x64',parallelism:4,exitCode:0,
    files:g.files.map(file=>({file,duration_ms:1,success:true,counts})),total:{success:true,duration_ms:1,counts:{...counts,tests:g.files.length,passed:g.files.length}}}));
  assert.equal(verifyFocusReports(plan,reports).files.length,selection.tests.length);
  assert.throws(()=>verifyFocusReports(plan,reports.slice(1)));
  const bad=structuredClone(reports);bad[0].attempt='2';assert.throws(()=>verifyFocusReports(plan,bad));
});
test('adaptive focused workflow preserves light path and requires parallel completeness',()=>{
  const quick=readFileSync(new URL('../.github/workflows/ci-fast.yml',import.meta.url),'utf8');
  assert.match(quick,/max-parallel: 16/);
  assert.match(quick,/needs: \[fast, parallel\]/);
  assert.match(quick,/node scripts\/ci-focused\.mjs complete/);
  assert.match(quick,/test "\$PARALLEL_RESULT" = success/);
  assert.match(quick,/focused-plan-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
});

test('focused plan upload uses the runtime-resolved step output, not runner context',()=>{
  const quick=readFileSync(new URL('../.github/workflows/ci-fast.yml',import.meta.url),'utf8');
  const planner=readFileSync(new URL('../scripts/ci-focused.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(quick,/runner\.temp/);
  assert.match(quick,/path: \$\{\{ steps\.plan\.outputs\.plan_path \}\}/);
  assert.match(planner,/plan_path='\+planPath\(env\)/);
});
