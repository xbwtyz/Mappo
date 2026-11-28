import test from 'node:test';
import assert from 'node:assert/strict';
import { P4R_BASELINE,P4R_CAPS,probeP4RCap } from './ares-p4r-research.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';

// R2 preserves the exact original candidate stream and budget. A larger
// per-arm candidate ceiling is not a grant of more work or authority.
export function registerP4RCapGroup(ids){
  for(const id of ids)test('R2 matched cap sensitivity '+id,async()=>{
    const prior=P4R_BASELINE.find(r=>r.id===id);
    assert.equal(prior?.category,'search-refused');
    let incumbent=null;
    for(const cap of P4R_CAPS){
      let r;
      try{r=await probeP4RCap(id,cap);}
      catch(e){console.log('ARES_P4R_R2 '+JSON.stringify({id,cap,category:'error',message:e.message}));throw e;}
      console.log('ARES_P4R_R2 '+JSON.stringify(r));
      assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
      assert.equal(r.source,prior.source);
      assert.equal(r.baselineValid,false);
      assert.deepEqual(r.baselineIssues,prior.baselineIssues);
      assert.ok(r.stats.work<=G_MANIFEST.search.root.work);
      assert.ok(r.stats.expansions<=G_MANIFEST.search.root.stateExpansions);
      assert.ok(r.attempts<=cap);
      if(cap===32){
        assert.equal(r.category,prior.category);assert.equal(r.termination,prior.termination);
        assert.equal(r.attempts,prior.attempts);assert.deepEqual(r.stats,prior.searchStats);
      }
      if(r.category==='geometry-recovered'){
        assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.sweptUnresolved,0);
        assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);
        assert.ok(r.audit.stats.expansions<=G_MANIFEST.audit.root.stateExpansions);
        if(!incumbent)incumbent=r;
      }
      if(incumbent){
        assert.equal(r.category,'geometry-recovered');
        assert.equal(r.attempts,incumbent.attempts);
        assert.deepEqual(r.stats,incumbent.stats);
        assert.deepEqual(r.witness,incumbent.witness);
      }
    }
  });
}
