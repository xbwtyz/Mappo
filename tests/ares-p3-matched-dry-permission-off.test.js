import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAresP3Case } from '../scripts/development/research/ares-p3-matched.mjs';
test('P3 matched Standard study — dry-permission-off',{timeout:300000},async()=>{
  const rows=await measureAresP3Case('dry-permission-off');
  assert.deepEqual(rows.map(r=>r.arm),['sre-reference','ares-single','ares-portfolio']);
  assert.ok(rows.every(r=>r.status==='refused'),'Locked permission-off refusal must not be bypassed');
});
