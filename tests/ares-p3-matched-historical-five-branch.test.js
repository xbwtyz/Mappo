import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAresP3Case } from '../scripts/development/research/ares-p3-matched.mjs';
test('P3 matched Standard study — historical-five-branch',{timeout:300000},async()=>{
  const rows=await measureAresP3Case('historical-five-branch');
  assert.deepEqual(rows.map(r=>r.arm),['sre-reference','ares-single','ares-portfolio']);
  assert.ok(rows.every(r=>r.caseId==='historical-five-branch'&&r.split==='known'&&r.stratum==='historical-setback'));
  // Historical diagnostic witness/refusal is not a required matched-budget
  // solve outcome. The runner checks every witness and retains every row.
});
