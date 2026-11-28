import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAresP3Case } from '../scripts/development/research/ares-p3-matched.mjs';
test('P3 matched Standard study — dry-retirement',{timeout:300000},async()=>{
  const rows=await measureAresP3Case('dry-retirement');
  assert.deepEqual(rows.map(r=>r.arm),['sre-reference','ares-single','ares-portfolio']);
  // Retirement is an exploratory matched-root outcome; preserve all rows.
});
