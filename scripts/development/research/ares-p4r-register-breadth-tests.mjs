import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P4R_BASELINE,probeP4RCap,probeP4RBreadth } from './ares-p4r-research.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/'+name,import.meta.url),'utf8'));
const history=[...read('p4r-r1-46067627895.json').caps,...read('p4r-r2-46067918609-a.json').rows,...read('p4r-r2-46067918609-b.json').rows];
const strip=({job,elapsedMs,auditMs,...r})=>r;
function check(row,cap,prior){
  assert.ok(['geometry-recovered','search-refused','work-limit'].includes(row.category));
  assert.equal(row.source,prior.source);assert.equal(row.baselineValid,false);
  assert.deepEqual(row.baselineIssues,prior.baselineIssues);
  assert.ok(row.stats.work<=G_MANIFEST.search.root.work);assert.ok(row.stats.expansions<=G_MANIFEST.search.root.stateExpansions);
  assert.ok(row.attempts<=cap);
  if(row.category==='geometry-recovered'){
    assert.equal(row.audit.status,'geometry-verified');assert.equal(row.audit.sweptUnresolved,0);
    assert.ok(row.audit.stats.work<=G_MANIFEST.audit.root.work);
  }
}
export function registerBreadthPilot(ids){
  for(const id of ids)test('R3A matched candidate ordering '+id,async()=>{
    const prior=P4R_BASELINE.find(r=>r.id===id);assert.equal(prior.category,'search-refused');
    let incumbent=null;
    for(const cap of [64,256]){
      const reference=await probeP4RCap(id,cap),breadth=await probeP4RBreadth(id,cap);
      console.log('ARES_P4R_R3A '+JSON.stringify({id,cap,reference,breadth}));
      check(reference,cap,prior);check(breadth,cap,prior);
      assert.deepEqual(strip(reference),strip(history.find(r=>r.id===id&&r.cap===cap)));
      if(incumbent){
        assert.equal(breadth.category,'geometry-recovered');assert.equal(breadth.attempts,incumbent.attempts);
        assert.deepEqual(breadth.witness,incumbent.witness);
      }
      if(breadth.category==='geometry-recovered')incumbent??=breadth;
    }
  });
}
