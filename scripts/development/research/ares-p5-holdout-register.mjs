import test from 'node:test';
import assert from 'node:assert/strict';
import {HOLDOUT_MANIFEST,inventoryHoldoutCase} from './ares-p5-holdout-inventory.mjs';
export function registerHoldoutInventory(morphology,part){
  const rows=HOLDOUT_MANIFEST.rows.filter(r=>r.options.morphology===morphology).slice(part*5,part*5+5);
  assert.equal(rows.length,5);
  for(const row of rows)test('Holdout input freeze '+row.id,()=>{
    const r=inventoryHoldoutCase(row.id);
    console.log('ARES_HOLDOUT_INPUT '+JSON.stringify(r));
    assert.equal(r.id,row.id);assert.match(r.source,/^[0-9a-f]{64}$/);
    assert.deepEqual(r.offset,row.offset);assert.deepEqual(r.options,row.options);
    assert.ok(['selected','selection-unavailable','selection-limit'].includes(r.selection));
    assert.ok(r.roadCount>0&&r.nodeCount>0);
    if(r.selection==='selected'){
      const selected=r.attempts.at(-1);
      assert.equal(selected.status,'selected');assert.equal(r.group,selected.id);
      assert.equal(r.selectedRoadIds.length,selected.count);
      assert.equal(new Set(r.selectedRoadIds).size,selected.count);
      assert.ok(r.attempts.slice(0,-1).every(x=>x.status!=='selected'));
    }else assert.deepEqual(r.selectedRoadIds,[]);
  });
}
