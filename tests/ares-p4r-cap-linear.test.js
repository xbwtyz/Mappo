import test from 'node:test';
import assert from 'node:assert/strict';
import { P4R_BASELINE,P4R_CAPS,probeP4RCap } from '../scripts/development/research/ares-p4r-research.mjs';
import { G_MANIFEST } from '../scripts/development/research/ares-p4-g-corpus.mjs';
for(const id of ["linear-medium:quad:75:y","linear-medium:quad:100:diagonal"])test('R1B matched cap sensitivity '+id,async()=>{
  const prior=P4R_BASELINE.find(r=>r.id===id);assert.ok(prior);
  let incumbent=null;
  for(const cap of P4R_CAPS){
    const r=await probeP4RCap(id,cap);
    console.log('ARES_P4R_R1B '+JSON.stringify(r));
    assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
    assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.ok(r.stats.expansions<=G_MANIFEST.search.root.stateExpansions);
    assert.ok(r.attempts<=cap);assert.equal(r.baselineValid,false);
    if(cap===32){
      assert.equal(r.category,prior.category);assert.equal(r.termination,prior.termination);assert.equal(r.attempts,prior.attempts);
      assert.deepEqual(r.stats,prior.searchStats);assert.deepEqual(r.baselineIssues,prior.baselineIssues);
      if(prior.witness)assert.deepEqual(r.witness,prior.witness);
    }
    if(r.category==='geometry-recovered'){
      assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.sweptUnresolved,0);assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);
      if(!incumbent)incumbent=r;
    }
    if(incumbent){assert.equal(r.category,'geometry-recovered');assert.equal(r.attempts,incumbent.attempts);assert.deepEqual(r.witness,incumbent.witness);}
  }
});
