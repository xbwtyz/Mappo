import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAresP3Case } from '../scripts/development/research/ares-p3-matched.mjs';
test('P3 matched Standard study — dry-positive',{timeout:300000},async()=>{
  const rows=await measureAresP3Case('dry-positive');
  assert.deepEqual(rows.map(r=>r.arm),['sre-reference','ares-single','ares-portfolio']);
  assert.ok(rows.every(r=>r.status==='verified'),'Locked nondestructive positive control must recover');
  assert.equal(new Set(rows.map(r=>r.incumbent.fingerprint)).size,1,'Positive control must retain reference geometry');
});
