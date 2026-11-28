import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { P4R_BASELINE,probeP4RAdaptivePortfolio } from './ares-p4r-research.mjs';
import { observeR4SpatialScope } from './ares-p4r-scope-observation.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
const dir=new URL('../../../tests/fixtures/ares-p4-evidence/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,dir),'utf8'));
const capHistory=[...read('p4r-r1-46067627895.json').caps,...read('p4r-r2-46067918609-a.json').rows,...read('p4r-r2-46067918609-b.json').rows];
const spatialHistory=readdirSync(dir).filter(n=>n.startsWith('p4r-r4cb-46075753772-')).flatMap(n=>read(n).rows);
export const ADAPTIVE_HOPS=Object.freeze([6,10]);
export function registerAdaptiveGroup(ids){
  for(const id of ids)test('R4C-C shared-root adaptive portfolio '+id,async()=>{
    const prior=P4R_BASELINE.find(r=>r.id===id);assert.equal(prior.category,'search-refused');
    for(const hops of ADAPTIVE_HOPS){
      const reference=hops===6?capHistory.find(r=>r.id===id&&r.cap===256):spatialHistory.find(r=>r.id===id&&r.hops===hops&&r.kind==='original')?.result;
      assert.ok(reference);
      const scope=await observeR4SpatialScope(id,hops);
      assert.deepEqual(scope.audit.mismatches,[]);assert.equal(scope.source,prior.source);
      const r=await probeP4RAdaptivePortfolio(id,hops);
      console.log('ARES_P4R_R4CC '+JSON.stringify({id,hops,referenceCategory:reference.category,referenceAttempts:reference.attempts,referenceWork:reference.stats.work,result:r}));
      assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
      assert.equal(r.source,prior.source);assert.equal(r.baselineValid,false);assert.deepEqual(r.baselineIssues,prior.baselineIssues);
      assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.ok(r.stats.expansions<=G_MANIFEST.search.root.stateExpansions);assert.ok(r.attempts<=256);
      const p=r.portfolio;assert.equal(p.prefixSlots,160);
      assert.equal(Object.values(p.attempted).reduce((a,b)=>a+b,0),r.attempts);
      for(const k of ['original','breadth','directional']){
        assert.equal(p.enumerated[k],p.scheduled[k]+p.duplicates[k]+(k==='directional'?p.skippedParallel:0));
        assert.ok(p.attempted[k]<=p.scheduled[k]);
      }
      assert.ok(p.enumerated.original<=160);assert.equal(p.duplicates.original,0);
      if(reference.category==='geometry-recovered'){
        assert.ok(reference.attempts<=160);
        assert.equal(r.category,'geometry-recovered');assert.equal(r.attempts,reference.attempts);
        assert.deepEqual(r.witness,reference.witness);
        assert.equal(p.attempted.breadth+p.attempted.directional,0);
      }
      if(r.category==='geometry-recovered'){
        assert.equal(r.audit.status,'geometry-verified');assert.equal(r.audit.sweptUnresolved,0);
        assert.ok(r.audit.stats.work<=G_MANIFEST.audit.root.work);assert.ok(r.audit.stats.expansions<=G_MANIFEST.audit.root.stateExpansions);
        assert.ok(r.witness.neighbors.length<=4);
        for(const n of r.witness.neighbors){
          assert.ok(scope.eligible.some(e=>e.id===n.id));
          assert.ok(Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)<=Math.hypot(prior.offset.x,prior.offset.y)+1e-8);
        }
      }
    }
  });
}
