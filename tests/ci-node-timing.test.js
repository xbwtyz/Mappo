import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseTiming, verifyTimingReports, proposeBalanced } from '../scripts/ci-node-timing.mjs';
const files=['tests/a.test.js','tests/b.test.js','tests/c.test.js','tests/d.test.js'];
const root=process.cwd(),sha='a'.repeat(40);
const counts=n=>({tests:n,passed:n,failed:0,cancelled:0,skipped:0,todo:0});
const row=(file,ms=1,n=1)=>({file,duration_ms:ms,counts:counts(n),success:true});
const json=rows=>rows.map(x=>JSON.stringify(x)).join('\n');
test('timing parser binds native summaries to unique actual inventory and one aggregate',()=>{
  const p=parseTiming(json([row(resolve(root,files[0])),row(files[1]),row(null,3,2)]),root,files);
  assert.deepEqual(p.files.map(x=>x.file),files.slice(0,2));
  for(const r of [[row(files[0])],[row(null)],[row(files[0]),row(files[0]),row(null)],[row('tests/unknown.test.js'),row(null)],
    [row(files[0]),row(null),row(null)],[{...row(files[0]),duration_ms:-1},row(null)]])
    assert.throws(()=>parseTiming(json(r),root,files));
});
function report(shard,paths) {
  return {version:1,source:sha,runId:'42',attempt:'1',shard,shards:2,node:'v22.22.0',platform:'linux',arch:'x64',parallelism:4,
    exitCode:0,files:paths.map((p,i)=>row(p,i+1)),total:row(null,4,paths.length)};
}
const options={inventory:files,source:sha,runId:'42',attempt:'1',shards:2};
test('aggregate requires every exact inventory file, shard, successful result and same attempt',()=>{
  const r=[report(1,files.slice(0,2)),report(2,files.slice(2))];
  assert.equal(verifyTimingReports(r,options).tests,4);
  for(const change of [x=>x[0].source='b'.repeat(40),x=>x[0].attempt='2',x=>x[0].runId='43',x=>x[0].exitCode=1,
    x=>x[0].parallelism=2,x=>x[0].total.counts.tests=3,x=>x[0].files[0].success=false,x=>x[1].files[0].file=files[0],
    x=>x[1].files.pop(),x=>x[1].shard=1,x=>x.pop()]) {
    const x=structuredClone(r);change(x);assert.throws(()=>verifyTimingReports(x,options));
  }
});
test('timing-based assignment is deterministic, complete and balances measured weights',()=>{
  const input=files.map((file,i)=>({file,ms:[100,80,20,10][i]}));
  const p=proposeBalanced(input);
  assert.deepEqual(p,proposeBalanced([...input].reverse()));
  assert.deepEqual(p.flatMap(g=>g.files).sort(),files);
  assert.deepEqual(p.map(g=>g.ms),[110,100]);
  assert.throws(()=>proposeBalanced([...input,input[0]]));
});
test('native reporter preserves TAP and records real per-file summaries under Node 22+',()=>{
  // The hosted gate uses Node 22. Local older supported Node installations
  // can still run npm test with the native default reporter.
  if(Number(process.versions.node.split('.')[0])<22) return;
  const dir=mkdtempSync(resolve(tmpdir(),'mappo-node-timing-'));
  try {
    mkdirSync(resolve(dir,'tests'));
    // Nested CLI must not inherit the parent test runner's child IPC mode.
    const env={...process.env};
    delete env.NODE_TEST_CONTEXT;
    for(const p of files.slice(0,2)) writeFileSync(resolve(dir,p),"const {test}=require('node:test'); test('fixture',()=>{});\n");
    const reporter=fileURLToPath(new URL('../scripts/ci-node-timing-reporter.mjs',import.meta.url));
    const raw=resolve(dir,'timing.ndjson');
    const r=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-reporter-destination=stdout',
      '--test-reporter='+reporter,'--test-reporter-destination='+raw,...files.slice(0,2)],{cwd:dir,encoding:'utf8',env});
    assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/# pass 2/,r.stderr);
    const p=parseTiming(readFileSync(raw,'utf8'),dir,files.slice(0,2));
    assert.equal(p.files.length,2);assert.equal(p.total.counts.tests,2);
    assert.equal(p.files.reduce((n,x)=>n+x.counts.tests,0),2);
    writeFileSync(resolve(dir,files[0]),"const {test}=require('node:test'); test('bad',()=>{throw Error('fixture failure')});\n");
    const bad=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-reporter-destination=stdout',
      '--test-reporter='+reporter,'--test-reporter-destination='+raw,files[0]],{cwd:dir,encoding:'utf8',env});
    assert.notEqual(bad.status,0);assert.match(bad.stdout,/fixture failure/);
  }finally {rmSync(dir,{recursive:true,force:true});}
});
test('timing pilot is isolated from full CI and full workflow retains two native shards',()=>{
  const pilot=readFileSync(new URL('../.github/workflows/ci-node-timing.yml',import.meta.url),'utf8');
  const full=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.match(pilot,/\[node-timing-pilot\]/);assert.match(pilot,/shard: \[1, 2, 3, 4\]/);
  assert.match(pilot,/aggregate .* 4/);assert.doesNotMatch(pilot,/name: Build, Node tests and browser QA/);
  assert.match(full,/shard: \[1, 2\]/);assert.match(full,/ci-node-timing\.mjs run/);
  assert.match(full,/name: Build, Node tests and browser QA/);
});

test('compression partition keeps the fifteen original independent test registrations',()=>{
  const partition={
    'spatial-recovery-compression.test.js':['SRE cooperative compression diagnostic','SRE shared-budget packing transport','SRE single-pass scheduling diagnostic','SRE candidate single-pass transport retains all known compression witnesses'],
    'spatial-recovery-compression-single-pass-history.test.js':['SRE candidate single-pass transport historical preservation comparison'],
    'spatial-recovery-compression-fixed-reuse.test.js':['SRE packing fallback fixed-refusal reuse qualification'],
    'spatial-recovery-compression-unified-progressive.test.js':['SRE unified nondestructive progressive compression'],
    'spatial-recovery-compression-unified-history.test.js':['SRE unified no-concession route retains exact historical ordinary fingerprints'],
    'spatial-recovery-compression-inventory-reuse.test.js':['SRE unified operation-local packing inventory reuse']
  };
  let count=0;
  for(const [file,names] of Object.entries(partition)){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    const starts=source.split('\n').filter(line=>/^(for\(const irregularProperties.*\)test\(|test\()/.test(line));
    assert.equal(starts.length,names.length,file);
    for(let i=0;i<names.length;i++){
      assert.ok(starts[i].includes("test('"+names[i]+"'"),file);
      count+=starts[i].startsWith('for(')?2:1;
    }
  }
  assert.equal(count,15);
});
