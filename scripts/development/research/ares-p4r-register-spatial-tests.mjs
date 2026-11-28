import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P4R_BASELINE,probeP4RSpatial } from './ares-p4r-research.mjs';
import { observeR4SpatialScope } from './ares-p4r-scope-observation.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/'+name,import.meta.url),'utf8'));
const history=[...read('p4r-r1-46067627895.json').caps,...read('p4r-r2-46067918609-a.json').rows,...read('p4r-r2-46067918609-b.json').rows];
const scopeHistory=[140746878186,140746878260,140746878309,140746878283].flatMap(job=>read('p4r-r4a-46070711669-'+job+'.json').rows);
const stripScope=({elapsedMs,...row})=>row;
const stripSearch=({elapsedMs,auditMs,stencil,...row})=>row;
const breadthHistory=read('p4r-r3a-46068804189.json').rows;
export const SPATIAL_HOPS=Object.freeze([6,8,10]);
export const SPATIAL_STRATEGIES=Object.freeze(['original','breadth']);
export function registerSpatialGroup(ids){
  for(const id of ids)test('R4C-B matched spatial combinations '+id,async()=>{
    const prior=P4R_BASELINE.find(r=>r.id===id);assert.equal(prior.category,'search-refused');
    const reference=history.find(r=>r.id===id&&r.cap===256);assert.ok(reference);
    let previous=null;
    for(const hops of SPATIAL_HOPS){
      // Scope audit is offline, separate from both search and witness audit.
      const scope=await observeR4SpatialScope(id,hops);
      assert.equal(scope.source,prior.source);assert.equal(scope.hops,hops);
      assert.deepEqual(scope.audit.mismatches,[]);assert.equal(scope.admitted,scope.audit.expectedEntries);assert.equal(scope.omitted,scope.audit.expectedOmitted);
      assert.ok(scope.stats.work<=G_MANIFEST.search.root.work);assert.ok(scope.auditStats.work<=G_MANIFEST.audit.root.work);
      assert.ok(scope.eligible.every(e=>e.depth<=hops));
      if(previous)assert.ok(previous.eligible.every(e=>scope.eligible.some(n=>n.id===e.id&&n.depth===e.depth)));
      previous=scope;
      const oldScope=scopeHistory.find(r=>r.id===id&&r.hops===hops);
      if(oldScope)assert.deepEqual(stripScope(scope),stripScope(oldScope));
      for(const kind of SPATIAL_STRATEGIES){
        if(hops===6&&kind==='original')continue; // frozen exact reference reused
        const r=await probeP4RSpatial(id,hops,kind);
        console.log('ARES_P4R_R4CB '+JSON.stringify({id,hops,kind,referenceCategory:reference.category,referenceAttempts:reference.attempts,referenceWork:reference.stats.work,scope:{admitted:scope.admitted,omitted:scope.omitted,eligible:scope.eligible.length,eligibleBlockerNodes:scope.eligibleBlockerNodes.length,stats:scope.stats,auditStats:scope.auditStats},result:r}));
        assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
        assert.equal(r.source,prior.source);assert.equal(r.baselineValid,false);assert.deepEqual(r.baselineIssues,prior.baselineIssues);
        assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.ok(r.stats.expansions<=G_MANIFEST.search.root.stateExpansions);assert.ok(r.attempts<=256);
        if(hops===6&&kind==='breadth'){
          const old=breadthHistory.find(x=>x.id===id&&x.cap===256);
          if(old)assert.deepEqual(stripSearch(r),stripSearch(old.breadth));
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
    }
  });
}
