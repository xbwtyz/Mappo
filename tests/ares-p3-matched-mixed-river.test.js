import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAresP3Case } from '../scripts/development/research/ares-p3-matched.mjs';
test('P3 matched Standard study — mixed-river',{timeout:300000},async()=>{
  const rows=await measureAresP3Case('mixed-river');
  assert.deepEqual(rows.map(r=>r.arm),['sre-reference','ares-single','ares-portfolio']);
  assert.ok(rows.every(r=>r.caseId==='mixed-river'&&r.split==='known'&&r.stratum==='mixed-landscape'));
  // A known unsupported topology must refuse before any recovery dispatch.
  for(const r of rows){
    assert.equal(r.status,'refused');assert.equal(r.reason,'preflight-refused');
    assert.equal(r.preflight.status,'preflight-refused');assert.ok(r.preflight.diagnostics.length);
    assert.equal(r.incumbent,null);assert.deepEqual(r.phases,[]);
    assert.equal(r.stats.expansions,0);assert.ok(r.preflightWork>0);
  }
});
