import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDOUT_MANIFEST} from './ares-p5-holdout-inventory.mjs';
import {holdoutLockedRow,HOLDOUT_ARMS} from './ares-p5-holdout-lock.mjs';
import {runHoldoutGeometry} from './ares-p5-holdout-run.mjs';
export function registerHoldoutGeometry(morphology,part,arm){
  assert.ok(HOLDOUT_ARMS.includes(arm));
  const rows=HOLDOUT_MANIFEST.rows.filter(r=>r.options.morphology===morphology).slice(part*5,part*5+5);
  assert.equal(rows.length,5);
  for(const recipe of rows)test('Holdout '+arm+' '+recipe.id,async()=>{
    const id='h:'+recipe.id,lock=holdoutLockedRow(id),r=await runHoldoutGeometry(id,arm);
    console.log('ARES_HOLDOUT_GEOMETRY '+JSON.stringify(r));
    assert.equal(r.source,lock.source);assert.equal(r.arm,arm);assert.equal(r.authority,'none');
    assert.deepEqual(r.offset,lock.offset);assert.deepEqual(r.selectedRoadIds,lock.selectedRoadIds);
    assert.ok(r.searchStats.work<=8000000&&r.searchStats.expansions<=32768);
    assert.ok((r.attempts??0)<=256);
    assert.ok(['baseline-valid','geometry-recovered','preflight-refused','search-refused','work-limit','unverified'].includes(r.category));
    if(r.audit){
      assert.ok(r.audit.stats.work<=8000000&&r.audit.stats.expansions<=32768);
      if(r.category==='unverified')assert.notEqual(r.audit.status,'geometry-verified');
      else assert.equal(r.audit.status,'geometry-verified');
    }
    if(r.category==='baseline-valid'){assert.equal(r.baselineValid,true);assert.equal(r.witness,null);assert.ok(r.audit);}
    if(r.category==='geometry-recovered'){
      assert.ok(r.audit);assert.equal(r.baselineValid,false);
      assert.ok(r.witness.neighbors.length>=2&&r.witness.neighbors.length<=4);
      for(const n of r.witness.neighbors)assert.ok(Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)<=Math.hypot(r.offset.x,r.offset.y));
    }
  });
}
