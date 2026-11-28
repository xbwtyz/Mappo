import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAresP3Case } from '../scripts/development/research/ares-p3-matched.mjs';
test('P3 matched Standard study — holdout-radial',{timeout:300000},async()=>{
  const rows=await measureAresP3Case('holdout-radial');
  assert.deepEqual(rows.map(r=>r.arm),['sre-reference','ares-single','ares-portfolio']);
  assert.ok(rows.every(r=>r.caseId==='holdout-radial'&&r.split==='reserved'&&r.measurementRevision===2));
  // All outcomes retained; no assumed feasibility or tuning on reserved seeds.
});
