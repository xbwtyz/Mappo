import test from 'node:test';
import assert from 'node:assert/strict';
import { R4_CASES,R4_HOPS,observeR4Scope } from './ares-p4r-scope-observation.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
export function registerR4City(city){
  for(const id of R4_CASES.filter(id=>id.startsWith(city+':')))test('R4 read-only scope '+id,async()=>{
    let previous=null;
    for(const hops of R4_HOPS){
      const r=await observeR4Scope(id,hops);
      console.log('ARES_P4R_R4 '+JSON.stringify(r));
      assert.equal(r.hops,hops);assert.equal(r.stats.expansions,0);assert.equal(r.auditStats.expansions,0);
      assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.ok(r.auditStats.work<=G_MANIFEST.audit.root.work);
      assert.equal(r.admitted,r.audit.expectedEntries);assert.equal(r.omitted,r.audit.expectedOmitted);assert.deepEqual(r.audit.mismatches,[]);
      assert.ok(r.eligible.every(e=>e.depth<=hops));
      if(previous){
        assert.ok(r.admitted>=previous.admitted);
        assert.ok(previous.eligible.every(e=>r.eligible.some(n=>n.id===e.id&&n.depth===e.depth)));
      }
      previous=r;
    }
  });
}
