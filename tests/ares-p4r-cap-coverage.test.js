import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P4R_BASELINE,P4R_CAPS } from '../scripts/development/research/ares-p4r-research.mjs';
const plan=JSON.parse(readFileSync(new URL('./fixtures/ares-p4r-cap-matrix.json',import.meta.url),'utf8'));
test('R2 covers every recorded search refusal exactly once across pilot and extension',()=>{
  const ids=[...plan.pilot,...Object.values(plan.groups).flat()];
  assert.equal(ids.length,50);assert.equal(new Set(ids).size,50);
  assert.deepEqual(ids.sort(),P4R_BASELINE.filter(r=>r.category==='search-refused').map(r=>r.id).sort());
  assert.deepEqual(plan.caps,P4R_CAPS);
  assert.equal(P4R_BASELINE.filter(r=>r.category==='preflight-refused').length,31);
  assert.equal(P4R_BASELINE.filter(r=>r.category==='baseline-valid').length,67);
  assert.equal(P4R_BASELINE.filter(r=>r.category==='geometry-recovered').length,23);
});
