import test from 'node:test';
import assert from 'node:assert/strict';
import { G_MANIFEST,enumerateGSlots } from './ares-p4-g-corpus.mjs';
import { runGSlot } from './ares-p4-g-run.mjs';
// G2B: group-sized files allow existing CI sharding to distribute trials.
// Identical search/audit budgets, predicates and evidence as the pilot.
export function registerGGroup(city,group){
  const slots=enumerateGSlots().filter(s=>s.city===city&&s.group===group);
  assert.equal(slots.length,9);
  for(const slot of slots)test('G2B '+slot.id,async()=>{
    let r;
    try{r=await runGSlot(slot.id);}
    catch(e){console.log('ARES_P4_G2 '+JSON.stringify({...slot,category:'error',message:e.message}));throw e;}
    console.log('ARES_P4_G2 '+JSON.stringify(r));
    assert.ok(G_MANIFEST.reporting.categories.includes(r.category));
    assert.ok(r.searchStats.work<=G_MANIFEST.search.root.work);
    assert.ok(r.searchStats.expansions<=G_MANIFEST.search.root.stateExpansions);
    assert.ok((r.attempts??0)<=G_MANIFEST.search.maxCandidates);
    if(r.category==='baseline-valid'){assert.equal(r.baselineValid,true);assert.equal(r.attempts,0);assert.equal(r.witness,null);}
    if(r.category==='geometry-recovered'){assert.equal(r.baselineValid,false);assert.ok(r.witness);}
    if(r.category==='baseline-valid'||r.category==='geometry-recovered'){
      assert.equal(r.audit.status,'geometry-verified');
      assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);
      assert.ok(r.audit.stats.expansions<=G_MANIFEST.audit.root.stateExpansions);
    }
    if(r.category==='unverified')assert.equal(r.audit.status,'unverified','Independent rejection is a regression, not a benign refusal.');
  });
}
