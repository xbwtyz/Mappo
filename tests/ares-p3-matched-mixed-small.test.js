import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAresP3Case } from '../scripts/development/research/ares-p3-matched.mjs';
test('P3 matched Standard study — mixed-small',{timeout:300000},async()=>{
  const rows=await measureAresP3Case('mixed-small');
  assert.deepEqual(rows.map(r=>r.arm),['sre-reference','ares-single','ares-portfolio']);
  assert.ok(rows.every(r=>r.caseId==='mixed-small'&&r.split==='known'&&r.stratum==='mixed-landscape'));
  // Exploratory outcomes: no assumed feasibility from P2 observations.
  // The shared runner independently verifies every retained witness.
});
