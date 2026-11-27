import test from 'node:test';
import assert from 'node:assert/strict';
import { observeP4XConstraints,X_MANIFEST } from './ares-p4x-constraints.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
export function registerXGroup(ids){
  for(const id of ids)test('P4X X1/X2 '+id,async()=>{
    const prior=X_MANIFEST.cases.find(r=>r.id===id),r=await observeP4XConstraints(id);
    console.log('ARES_P4X_X12 '+JSON.stringify(r));
    assert.equal(r.source,prior.source);assert.deepEqual(r.baselineCodes,prior.issues);
    assert.deepEqual(r.unsupported,[]);assert.equal(r.audit.intentMatches,true);
    assert.deepEqual(r.audit.missing,[]);assert.deepEqual(r.audit.extra,[]);
    assert.equal(r.audit.pairCount,r.conflicts.length);assert.ok(r.conflicts.length>0);
    assert.ok(r.stats.work<=G_MANIFEST.search.root.work);assert.ok(r.auditStats.work<=G_MANIFEST.audit.root.work);
    assert.equal(r.stats.expansions,0);assert.equal(r.auditStats.expansions,0);
    const vars=new Set(r.model.variables.map(v=>v.id)),fixed=new Set(r.model.fixedNodes.map(v=>v.id));
    assert.equal(vars.size,r.model.variables.length);assert.equal(fixed.size,r.model.fixedNodes.length);
    assert.ok([...vars].every(id=>!fixed.has(id)));
    assert.ok(r.model.variables.every(v=>v.depth<=6&&v.maxDisplacement===Math.hypot(prior.offset.x,prior.offset.y)));
    const roads=new Set(r.model.segments.map(s=>s.id));
    for(const v of r.model.variables)for(const ref of v.incidentRefs)
      assert.ok(ref.collection==='roads'?roads.has(ref.id):vars.has(ref.id)||fixed.has(ref.id));
    for(const c of r.conflicts){
      assert.deepEqual(c.outsideAdmitted,[]);assert.ok(c.roadIds.every(id=>roads.has(id)));
      assert.deepEqual(c.movable,c.endpoints.filter(id=>vars.has(id)));
      assert.ok(c.geometry.cutsAB.length+c.geometry.cutsBA.length>0);
    }
    assert.ok(Object.isFrozen(r.model.variables));assert.equal(r.model.status,'observation-only');
  });
}
