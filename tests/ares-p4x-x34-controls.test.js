import test from 'node:test';
import assert from 'node:assert/strict';
import { X34_COVER,X34_IDS } from '../scripts/development/research/ares-p4x-analytical.mjs';
import { X_MANIFEST } from '../scripts/development/research/ares-p4x-constraints.mjs';
import { runP4XAnalytical } from '../scripts/development/research/ares-p4x-x34-run.mjs';
test('P4X X34 frozen denominator and cap exclusions',async()=>{
  assert.equal(X34_IDS.length,24);assert.equal(X34_COVER.rows.length,39);
  assert.deepEqual(X34_COVER.rows.map(r=>r.id).sort(),X_MANIFEST.cases.map(r=>r.id).sort());
  const hist={};for(const r of X34_COVER.rows){hist[r.min]=(hist[r.min]??0)+1;assert.equal(r.cover.length,r.min);}
  assert.deepEqual(hist,{2:6,3:9,4:9,5:5,6:5,7:1,9:4});
  for(const r of X34_COVER.rows.filter(r=>r.min>4))await assert.rejects(()=>runP4XAnalytical(r.id),/Unapproved/);
  await assert.rejects(()=>runP4XAnalytical('unknown'),/Unapproved/);
});
test('P4X X34 deterministic first scenario',async()=>assert.deepEqual(await runP4XAnalytical(X34_IDS[0]),await runP4XAnalytical(X34_IDS[0])));
