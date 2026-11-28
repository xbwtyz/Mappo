import test from 'node:test';
import assert from 'node:assert/strict';
import { G_MANIFEST,enumerateGSlots } from '../scripts/development/research/ares-p4-g-corpus.mjs';
import { G_LOCKED_INVENTORY,lockedRtreCase } from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
import { runGSlot } from '../scripts/development/research/ares-p4-g-run.mjs';
const rows=enumerateGSlots();
test('G2A locked inventory retains all 216 slots and 171 unique executable intents',()=>{
  const keys=new Set();let unavailable=0;
  for(const s of rows){
    const city=G_LOCKED_INVENTORY.rows.find(c=>c.id===s.city),group=city.groups.find(g=>g.id===s.group);
    if(group.status!=='selected'){unavailable++;continue;}
    const lock=lockedRtreCase('g:'+s.id);
    assert.equal(lock.source,city.source);assert.deepEqual(lock.selectedRoadIds,group.selectedRoadIds);
    const key=JSON.stringify([lock.source,lock.selectedRoadIds,s.offset]);assert.ok(!keys.has(key));keys.add(key);
  }
  assert.equal(unavailable,45);assert.equal(keys.size,171);assert.throws(()=>lockedRtreCase('g:radial-small:quad:50:x'),/unavailable/);
  assert.throws(()=>lockedRtreCase({}),/recipe ID/);
});
for(const [city,group] of [['linear-medium','quad'],['planned-medium','five-branch']]){
  for(const slot of rows.filter(s=>s.city===city&&s.group===group)){
    test('G2A pilot '+slot.id,async()=>{
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
      if(r.category==='baseline-valid'||r.category==='geometry-recovered')assert.equal(r.audit.status,'geometry-verified');
      if(r.category==='unverified')assert.equal(r.audit.status,'unverified','Independent rejection is a regression, not a benign refusal.');
    });
  }
}
