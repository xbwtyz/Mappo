import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { G_MANIFEST,enumerateGSlots } from './ares-p4-g-corpus.mjs';
import { runR5Slot,R5_OPTIONS } from './ares-p4-g-run.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/'+name,import.meta.url),'utf8'));
const a=read('large-corpus-45983786171-a.json'),b=read('large-corpus-45983786171-b.json');
const history=[...a.rows,...b.rows,...b.omitted];
const caps=[...read('p4r-r1-46067627895.json').caps,...read('p4r-r2-46067918609-a.json').rows,...read('p4r-r2-46067918609-b.json').rows];
const successful=r=>['baseline-valid','geometry-recovered'].includes(r.category);
export function registerR5Group(city,group){
  const slots=enumerateGSlots().filter(s=>s.city===city&&s.group===group);
  assert.equal(slots.length,9);
  for(const slot of slots)test('R5 final locked corpus '+slot.id,async()=>{
    const prior=history.find(r=>r.id===slot.id);assert.ok(prior);
    const reference=prior.category==='search-refused'?caps.find(r=>r.id===slot.id&&r.cap===256):prior;
    assert.ok(reference);
    let r;
    try{r=await runR5Slot(slot.id);}
    catch(e){console.log('ARES_P4R_R5 '+JSON.stringify({...slot,category:'error',message:e.message}));throw e;}
    console.log('ARES_P4R_R5 '+JSON.stringify({id:slot.id,referenceCategory:reference.category,referenceAttempts:reference.attempts??null,referenceWork:(reference.searchStats??reference.stats)?.work??null,result:r}));
    assert.equal(r.source,prior.source);assert.deepEqual(r.selectedRoadIds,prior.selectedRoadIds);assert.deepEqual(r.offset,prior.offset);
    if(['selection-unavailable','selection-limit'].includes(prior.category)){
      assert.equal(r.category,prior.category);assert.equal(r.searchStats,undefined);return;
    }
    assert.ok(['preflight-refused','baseline-valid','geometry-recovered','search-refused','work-limit'].includes(r.category));
    assert.ok(r.searchStats.work<=G_MANIFEST.search.root.work);assert.ok(r.searchStats.expansions<=G_MANIFEST.search.root.stateExpansions);
    assert.ok(r.attempts<=R5_OPTIONS.maxCandidates);
    assert.equal(r.baselineValid,prior.baselineValid);assert.deepEqual(r.baselineIssues,prior.baselineIssues);
    if(successful(reference)){
      assert.equal(r.category,reference.category);assert.equal(r.attempts,reference.attempts);assert.deepEqual(r.witness,reference.witness);
    }
    if(prior.category==='preflight-refused'){assert.equal(r.category,prior.category);assert.equal(r.attempts,0);assert.equal(r.termination,prior.termination);}
    if(r.category==='baseline-valid'){assert.equal(r.attempts,0);assert.equal(r.witness,null);}
    if(successful(r)){
      assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.sweptUnresolved,0);
      assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);assert.ok(r.audit.stats.expansions<=G_MANIFEST.audit.root.stateExpansions);
      if(r.witness){
        assert.ok(r.witness.neighbors.length<=4);
        for(const n of r.witness.neighbors)assert.ok(Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)<=Math.hypot(slot.offset.x,slot.offset.y)+1e-8);
      }
    }
  });
}
