import test from 'node:test';
import assert from 'node:assert/strict';
import { runP4XAnalytical } from './ares-p4x-x34-run.mjs';
import { X_MANIFEST } from './ares-p4x-constraints.mjs';
export function registerX34Group(ids){
  for(const id of ids)test('P4X X3/X4 '+id,async()=>{
    const prior=X_MANIFEST.cases.find(r=>r.id===id),r=await runP4XAnalytical(id);
    console.log('ARES_P4X_X34 '+JSON.stringify(r));
    assert.ok(['search-refused','geometry-recovered','work-limit'].includes(r.category));
    assert.ok(r.attempts<=256);assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
    if(r.source){assert.equal(r.source,prior.source);assert.deepEqual(r.baselineIssues,prior.issues);}
    if(r.category==='geometry-recovered'){
      assert.equal(r.audit.status,'geometry-verified');assert.ok(r.witness.neighbors.length>=2&&r.witness.neighbors.length<=4);
      assert.ok(r.audit.stats.work<=8000000);
    }
  });
}
