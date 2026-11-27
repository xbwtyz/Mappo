import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseTiming, verifyTimingReports, proposeBalanced, validateBalancedManifest, nodeInventory, measuredAssignments, currentWeights } from '../scripts/ci-node-timing.mjs';
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
test('timing pilot is isolated from full CI and full workflow retains sixteen Node jobs',()=>{
  const pilot=readFileSync(new URL('../.github/workflows/ci-node-timing.yml',import.meta.url),'utf8');
  const full=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.match(pilot,/\[node-timing-pilot-16\]/);assert.match(pilot,/shard: \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16\]/);
  assert.match(pilot,/aggregate .* 16/);assert.doesNotMatch(pilot,/name: Build, Node tests and browser QA/);
  assert.match(full,/shard: \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16\]/);assert.match(full,/ci-node-timing\.mjs run/);
  assert.match(full,/name: Build, Node tests and browser QA/);
});

test('compression partition keeps the fifteen original independent test registrations',()=>{
  // Frozen exact registration lines from the original file, including names,
  // parameterization, timeouts and async flags. Do not derive from new files.
  const partition={
    "spatial-recovery-compression.test.js": [
      "for(const irregularProperties of [false,true])test('SRE cooperative compression diagnostic '+(irregularProperties?'irregular':'regular'),{timeout:300000},()=>{",
      "for(const irregularProperties of [false,true])test('SRE shared-budget packing transport '+(irregularProperties?'irregular':'regular'),{timeout:300000},async()=>{",
      "for(const irregularProperties of [false,true])test('SRE single-pass scheduling diagnostic '+(irregularProperties?'irregular':'regular'),{timeout:300000},async()=>{",
      "for(const irregularProperties of [false,true])test('SRE candidate single-pass transport retains all known compression witnesses '+(irregularProperties?'irregular':'regular'),{timeout:300000},async()=>{"
    ],
    "spatial-recovery-compression-single-pass-history.test.js": [
      "test('SRE candidate single-pass transport historical preservation comparison',{timeout:300000},async()=>{"
    ],
    "spatial-recovery-compression-fixed-reuse.test.js": [
      "test('SRE packing fallback fixed-refusal reuse qualification',{timeout:600000},async()=>{"
    ],
    "spatial-recovery-compression-unified-progressive.test.js": [
      "for(const irregularProperties of [false,true])test('SRE unified nondestructive progressive compression '+(irregularProperties?'irregular':'regular'),{timeout:600000},async()=>{"
    ],
    "spatial-recovery-compression-unified-history.test.js": [
      "test('SRE unified no-concession route retains exact historical ordinary fingerprints',{timeout:600000},async()=>{"
    ],
    "spatial-recovery-compression-inventory-reuse.test.js": [
      "for(const irregularProperties of [false,true])test('SRE unified operation-local packing inventory reuse '+(irregularProperties?'irregular':'regular'),{timeout:600000},async()=>{"
    ]
  };
  let count=0;
  for(const [file,expected] of Object.entries(partition)){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    const starts=source.split('\n').filter(line=>/^(for\(const irregularProperties.*\)test\(|test\()/.test(line));
    assert.deepEqual(starts,expected,file);
    count+=starts.reduce((n,line)=>n+(line.startsWith('for(')?2:1),0);
  }
  assert.equal(count,15);
});

test('pilot preflight must pass before expensive diagnostic shards start',()=>{
  const pilot=readFileSync(new URL('../.github/workflows/ci-node-timing.yml',import.meta.url),'utf8');
  assert.match(pilot,/preflight:\n/);
  assert.match(pilot,/node --test tests\/ci-node-timing\.test\.js/);
  assert.match(pilot,/measure:\n    needs: preflight/);
});

test('reviewed measured assignment includes each current Node test exactly once',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../scripts/ci-node-weights.json',import.meta.url),'utf8'));
  const inventory=nodeInventory();
  const historical=manifest.files.map(x=>x.file);
  const groups=validateBalancedManifest(manifest,historical);
  assert.equal(groups.length,2);
  assert.deepEqual(groups.flatMap(g=>g.files).sort(),[...historical].sort());
  // Independently verify the inventory against the tracked repository files.
  const tracked=spawnSync('git',['ls-files','-z','--','tests/'],{cwd:root,encoding:'utf8'});
  assert.equal(tracked.status,0,tracked.stderr);
  assert.deepEqual(tracked.stdout.split('\0').filter(p=>/^tests\/[^/]+\.test\.js$/.test(p)).sort(),inventory);
  for(const change of [x=>x.files.pop(),x=>x.files.push(x.files[0]),x=>x.proposal[0].files.pop(),
    x=>x.proposal[0].files.push(x.proposal[1].files[0]),x=>x.files[0].ms=-1,
    x=>x.proposal[0].ms+=1,x=>x.source='unknown']){
    const invalid=structuredClone(manifest);change(invalid);
    assert.throws(()=>validateBalancedManifest(invalid,inventory));
  }
  assert.throws(()=>validateBalancedManifest(manifest,[...inventory,'tests/unmeasured.test.js']));
  assert.throws(()=>validateBalancedManifest(manifest,inventory.slice(1)));
});

test('sixteen-runner diagnostic reuses validated measured inventory and preserves historical two-runner assignment',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../scripts/ci-node-weights.json',import.meta.url),'utf8'));
  const inventory=nodeInventory(),groups=measuredAssignments(manifest,inventory,16);
  assert.equal(groups.length,16);
  assert.deepEqual(groups.map(g=>g.shard),Array.from({length:16},(_,i)=>i+1));
  assert.ok(groups.every(g=>g.files.length>0));
  assert.deepEqual(groups.flatMap(g=>g.files).sort(),inventory);
  assert.deepEqual(groups,measuredAssignments(manifest,inventory,16));
  assert.deepEqual(measuredAssignments(manifest,manifest.files.map(x=>x.file),2),manifest.proposal);
  assert.throws(()=>measuredAssignments(manifest,inventory,15));
  assert.deepEqual(measuredAssignments(manifest,inventory.slice(1),16).flatMap(g=>g.files).sort(),inventory.slice(1));
  const reports=groups.map(g=>({...report(g.shard,g.files),shards:16}));
  const options16={inventory,source:sha,runId:'42',attempt:'1',shards:16};
  assert.equal(verifyTimingReports(reports,options16).files.length,inventory.length);
  for(const change of [r=>r.pop(),r=>r[15].shard=1,r=>r[15].attempt='2',r=>r[15].total.success=false,r=>r[15].files[0].file=r[0].files[0].file]){
    const invalid=structuredClone(reports);change(invalid);assert.throws(()=>verifyTimingReports(invalid,options16));
  }
});

test('full CI requires all sixteen same-attempt reports in its existing aggregate',()=>{
  const full=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.match(full,/Node regression \(shard \$\{\{ matrix\.shard \}\}\/16\)/);
  assert.match(full,/ci-node-timing\.mjs run \$\{\{ matrix\.shard \}\} 16/);
  assert.match(full,/ci-node-timing\.mjs aggregate timing-input 16/);
  assert.match(full,/pattern: mappo-node-timing-\*-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(full,/needs: \[route, node, browser\]/);
});

test('current scheduling automatically includes new and renamed files without weakening historical evidence',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../scripts/ci-node-weights.json',import.meta.url),'utf8'));
  const old=manifest.files.map(x=>x.file).sort();
  const current=[...old.slice(1),'tests/brand-new.test.js'].sort();
  const weights=currentWeights(manifest,current);
  assert.equal(weights.find(x=>x.file==='tests/brand-new.test.js').estimated,true);
  assert.ok(weights.find(x=>x.file==='tests/brand-new.test.js').ms>=120000);
  assert.ok(!weights.some(x=>x.file===old[0]));
  assert.deepEqual(measuredAssignments(manifest,current,16).flatMap(g=>g.files).sort(),current);
  assert.deepEqual(measuredAssignments(manifest,current,16),measuredAssignments(manifest,[...current].reverse(),16));
  assert.throws(()=>currentWeights(manifest,[...current,current[0]]));
  const bad=structuredClone(manifest);bad.proposal[0].files.pop();
  assert.throws(()=>currentWeights(bad,current));
});
