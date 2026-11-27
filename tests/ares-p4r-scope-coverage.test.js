import test from 'node:test';
import assert from 'node:assert/strict';
import { R4_CASES,R4_HOPS,observeR4Scope } from '../scripts/development/research/ares-p4r-scope-observation.mjs';
test('R4 fixed denominator and read-only observation arm boundary',async()=>{
  assert.equal(R4_CASES.length,39);assert.equal(new Set(R4_CASES).size,39);assert.deepEqual(R4_HOPS,[6,8,10]);
  await assert.rejects(()=>observeR4Scope('unknown',6),/Unapproved/);
  await assert.rejects(()=>observeR4Scope(R4_CASES[0],12),/Unapproved/);
});
