import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDOUT_MANIFEST} from './ares-p5-holdout-inventory.mjs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {diagnoseHoldoutConstraints} from './ares-p5-holdout-constraint-diagnostics.mjs';
const bounded=s=>{assert.ok(s.work<=8000000&&s.expansions===0);};
export function registerHoldoutConstraints(morphology,part){
  const rows=HOLDOUT_MANIFEST.rows.filter(r=>r.options.morphology===morphology).slice(part*5,part*5+5);
  assert.equal(rows.length,5);
  for(const recipe of rows)test('Holdout constraints '+recipe.id,async()=>{
    const id='h:'+recipe.id,r=await diagnoseHoldoutConstraints(id),lock=holdoutLockedRow(id);
    console.log('ARES_HOLDOUT_CONSTRAINTS '+JSON.stringify(r));
    assert.equal(r.source,lock.source);assert.equal(r.authority,'none');assert.deepEqual(r.offset,lock.offset);
    bounded(r.stats);if(r.neighborhoodStats)bounded(r.neighborhoodStats);
    assert.equal(r.category,'diagnosed');
    assert.equal(r.boundary.outside.length>0,r.topologyCategory==='preflight-refused');
    if(r.boundary.outside.length){assert.equal(r.neighborhoodStats,null);assert.equal(r.constraints.eligibleNeighborCount,0);assert.ok(r.boundary.outside.every(p=>p.sourceInside&&p.targetOutsideDistance>=1e-6));}
    else assert.ok(r.neighborhoodStats);
    if(r.topologyCategory==='rejected'){assert.ok(r.constraints.changes.length>0);assert.ok(r.constraints.changes.every(c=>c.geometry&&!c.split&&c.final));}
    assert.ok(r.constraints.pairsWithEligibleNeighbor<=r.constraints.pairs.length);
  });
}
