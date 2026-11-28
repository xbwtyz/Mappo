import test from 'node:test';
import assert from 'node:assert/strict';
import { P4R_BASELINE,inspectP4RRefusal } from '../scripts/development/research/ares-p4r-research.mjs';
import { G_MANIFEST } from '../scripts/development/research/ares-p4-g-corpus.mjs';
const rows=P4R_BASELINE.filter(r=>r.category==='preflight-refused');
test('R1A fixed preflight denominator',()=>{assert.equal(rows.length,31);assert.equal(new Set(rows.map(r=>r.id)).size,31);});
for(const prior of rows)test('R1A '+prior.id,async()=>{
  const r=await inspectP4RRefusal(prior.id);
  console.log('ARES_P4R_R1A '+JSON.stringify(r));
  assert.equal(r.status,prior.eligibilityStatus);
  assert.equal(r.source,prior.source);
  assert.deepEqual(r.selectedRoadIds,prior.selectedRoadIds);
  assert.deepEqual(r.offset,prior.offset);
  assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.equal(r.stats.expansions,0);
  // Preserve empty/unexplained diagnostics as an explicit research finding,
  // not an invented reason or authorization to adjust an anchor.
  assert.ok(Array.isArray(r.fatalCodes));
});
