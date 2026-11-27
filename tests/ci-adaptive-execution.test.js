// Independent live-inventory and cross-shard regressions. No timing manifest
// refresh is needed to introduce this tracked test file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {trackedNodeInventory, currentWeights, measuredAssignments} from '../scripts/ci-node-timing.mjs';
import {adaptiveFocusGroups, selectTests, verifyFocusPlan, verifyFocusReports} from '../scripts/ci-focused.mjs';
const weights=JSON.parse(readFileSync(new URL('../scripts/ci-node-weights.json',import.meta.url),'utf8'));
const own='tests/ci-adaptive-execution.test.js';
test('newly tracked test files automatically enter full and selected assignments',()=>{
  const inventory=trackedNodeInventory();
  assert.ok(inventory.includes(own));
  // The historical snapshot need not remain unmeasured forever.
  const estimated=!weights.files.some(f=>f.file===own);
  const row=currentWeights(weights,inventory).find(f=>f.file===own);
  assert.equal(row.estimated,estimated);
  if(estimated)assert.ok(row.ms>=120000);
  const full=measuredAssignments(weights,inventory,16);
  assert.deepEqual(full.flatMap(g=>g.files).sort(),inventory);
  assert.equal(full.filter(g=>g.files.includes(own)).length,1);
  const selected=selectTests([own,'scripts/ci-focused.mjs'],inventory);
  const plan=adaptiveFocusGroups(weights,selected.tests);
  assert.ok(plan.groups.some(g=>g.files.includes(own)));
  assert.deepEqual(plan.groups.flatMap(g=>g.files).sort(),selected.tests);
});
test('valid aggregate totals cannot conceal a report assigned to the wrong shard',()=>{
  const inventory=trackedNodeInventory();
  const selected=selectTests([own,'scripts/ci-focused.mjs'],inventory);
  const execution=adaptiveFocusGroups(weights,selected.tests,{broad:true});
  const head='a'.repeat(40),runId='42',attempt='1';
  const plan={version:2,head,runId,attempt,base:'b'.repeat(40),changedPaths:[own,'scripts/ci-focused.mjs'],...selected,
    execution:adaptiveFocusGroups(weights,selected.tests)};
  assert.deepEqual(verifyFocusPlan(plan,{head,runId,attempt,inventory,weights}),plan.execution);
  const counts=n=>({tests:n,passed:n,failed:0,cancelled:0,skipped:0,todo:0});
  const reports=execution.groups.map(g=>({version:1,source:head,runId,attempt,shard:g.shard,shards:execution.shards,
    node:'v22',platform:'linux',arch:'x64',parallelism:4,exitCode:0,
    files:g.files.map(file=>({file,success:true,duration_ms:1,counts:counts(1)})),
    total:{success:true,duration_ms:1,counts:counts(g.files.length)}}));
  const fullPlan={...plan,execution};
  assert.equal(verifyFocusReports(fullPlan,reports).files.length,selected.tests.length);
  const wrong=structuredClone(reports);
  [wrong[0].shard,wrong[1].shard]=[wrong[1].shard,wrong[0].shard];
  assert.throws(()=>verifyFocusReports(fullPlan,wrong),/wrong assignment/);
  assert.throws(()=>verifyFocusReports(fullPlan,reports.slice(1)));
});
test('every focused execution phase independently reconstructs the exact push range',()=>{
  const source=readFileSync(new URL('../scripts/ci-focused.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/ci-fast.yml',import.meta.url),'utf8');
  assert.match(source,/independentlyDerived=deriveFocusPlan\(env\)/);
  assert.match(source,/Focused plan differs from exact push evidence/);
  assert.equal((workflow.match(/fetch-depth: 0/g)||[]).length,3);
});
