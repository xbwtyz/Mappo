import test from 'node:test';
import assert from 'node:assert/strict';
import { P2_AUDIT_CASES,P2_AUDIT_HOPS,auditP2Case } from './ares-p4r-p2-depth-audit.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
export function registerP2DepthAudit(city){
  for(const id of P2_AUDIT_CASES.filter(id=>id.startsWith('g:'+city+':')))test('R4C-B0 P2 actual scope depth audit '+id,async()=>{
    const rows=await auditP2Case(id);assert.deepEqual(rows.map(r=>r.hops),P2_AUDIT_HOPS);
    for(const r of rows){
      console.log('ARES_P4R_P2_DEPTH '+JSON.stringify(r));
      assert.equal(r.caseId,id);assert.equal(r.comparison,'compared');
      for(const stats of [r.observationStats,r.scopeStats,r.auditStats]){
        assert.ok(stats.work<=G_MANIFEST.search.root.work);assert.equal(stats.expansions,0);
      }
      // Historical diagnostic rows preserved separately. All 156 exact
      // frozen cases are now mandatory zero-discrepancy regressions.
      assert.deepEqual(r.mismatches,[]);
      if(r.scopeStatus!=='observed')assert.equal(r.reviewRefs,0);
    }
  });
}
