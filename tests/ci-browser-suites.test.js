import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(root,'scripts/browser-suites.json'),'utf8'));
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
// Frozen A2 full-CI inventory. Extend deliberately when adding scheduled QA.
// This independent inventory prevents accidental deletion during rebalancing.
const baseline=[
  "scripts/browser-qa.mjs",
  "scripts/building-browser-qa.mjs",
  "scripts/building-components-browser-qa.mjs",
  "scripts/building-footprint-f2-browser-qa.mjs",
  "scripts/building-performance-f4.mjs",
  "scripts/c7-p2-browser-qa.mjs",
  "scripts/c7-p3-offline-qa.mjs",
  "scripts/courtyard-access-browser-qa.mjs",
  "scripts/d4-browser-acceptance.mjs",
  "scripts/desktop-three-tabs-browser-qa.mjs",
  "scripts/g3g-desktop-parity-browser-qa.mjs",
  "scripts/g4-cross-editor-browser-qa.mjs",
  "scripts/g4-desktop-acceptance-browser-qa.mjs",
  "scripts/h2-save-compatibility-browser-qa.mjs",
  "scripts/h4-recovery-browser-qa.mjs",
  "scripts/input-a2-browser-qa.mjs",
  "scripts/inspector-a3-browser-qa.mjs",
  "scripts/junction-snap-merge-browser-qa.mjs",
  "scripts/plot-partition-027-browser-qa.mjs",
  "scripts/property-count-e4-browser-qa.mjs",
  "scripts/property-creation-e1-browser-qa.mjs",
  "scripts/property-integration-e5-browser-qa.mjs",
  "scripts/property-merge-026-browser-qa.mjs",
  "scripts/property-merge-e3-browser-qa.mjs",
  "scripts/property-polygons-024-browser-qa.mjs",
  "scripts/property-split-025-browser-qa.mjs",
  "scripts/property-split-e2-browser-qa.mjs",
  "scripts/road-browser-qa.mjs",
  "scripts/road-ownership-023-browser-qa.mjs",
  "scripts/road-parcel-decisions-028-browser-qa.mjs",
  "scripts/selection-a1-browser-qa.mjs",
  "scripts/whole-city-png-browser-qa.mjs",
  "scripts/workspace-g2-browser-qa.mjs"
];
test('CI browser manifest retains every A2 script exactly once across four nonempty suites',()=>{
  assert.deepEqual(Object.keys(manifest).sort(),['desktop','integration','property','roads']);
  for(const list of Object.values(manifest))assert.ok(Array.isArray(list)&&list.length>0);
  const files=Object.values(manifest).flat();
  assert.equal(new Set(files).size,files.length);
  assert.deepEqual([...files].sort(),baseline);
  for(const file of files){assert.ok(file.startsWith('scripts/'));assert.match(file.slice(8),/^[a-z0-9-]+[.]mjs$/);assert.ok(existsSync(resolve(root,file)),file);}
  assert.ok(!files.includes('scripts/c7-browser-performance.mjs'),'heavy C7 remains opt-in');
});
test('CI browser commands retain all four suites and the local full-run chain',()=>{
  for(const name of Object.keys(manifest))assert.equal(pkg.scripts['test:browser:'+name],'node scripts/run-browser-suite.mjs '+name);
  assert.equal(pkg.scripts['test:browser'],'npm run test:browser:workspace && npm run test:browser:property && npm run test:browser:integration');
  assert.equal(pkg.scripts['test:browser:workspace'],'npm run test:browser:desktop && npm run test:browser:roads');
  assert.equal(pkg.scripts['test:node:shard:1'],'node --test --test-shard=1/2 tests/*.test.js');
  assert.equal(pkg.scripts['test:node:shard:2'],'node --test --test-shard=2/2 tests/*.test.js');
});

test('CI timed runner records failed and successful scripts and returns failure',()=>{
  const dir=mkdtempSync(resolve(tmpdir(),'mappo-ci-runner-'));
  try{
    const scripts=resolve(dir,'scripts');mkdirSync(scripts);
    writeFileSync(resolve(scripts,'run-browser-suite.mjs'),readFileSync(resolve(root,'scripts/run-browser-suite.mjs')));
    writeFileSync(resolve(scripts,'browser-suites.json'),JSON.stringify({desktop:['scripts/fail.mjs','scripts/pass.mjs']}));
    writeFileSync(resolve(scripts,'fail.mjs'),'process.exitCode=7;');
    writeFileSync(resolve(scripts,'pass.mjs'),'console.log("later script executed");');
    const summary=resolve(dir,'summary.md');
    const result=spawnSync(process.execPath,[resolve(scripts,'run-browser-suite.mjs'),'desktop'],{
      cwd:dir,encoding:'utf8',env:{...process.env,GITHUB_STEP_SUMMARY:summary}
    });
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stdout,/later script executed/);
    const report=JSON.parse(readFileSync(resolve(dir,'artifacts/ci-timings/desktop.json'),'utf8'));
    assert.equal(report.passed,1);assert.equal(report.failed,1);
    assert.deepEqual(report.results.map(r=>[r.exitCode,r.ok]),[[7,false],[0,true]]);
    assert.match(readFileSync(summary,'utf8'),/FAIL/);
    assert.match(readFileSync(summary,'utf8'),/PASS/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
