import test from 'node:test';
import assert from 'node:assert/strict';
import {SQUARE_PILOT} from '../scripts/development/research/square-trial-pilot.mjs';
import {runSquareMovementPilot} from '../scripts/development/research/square-trial-movement-pilot.mjs';
test('Square S2a matched movement feasibility pilot, no adaptive search or Apply authority',()=>{
 const rows=SQUARE_PILOT.map(r=>runSquareMovementPilot(r.id));
 for(const r of rows){
  console.log('SQUARE_MOVEMENT_PILOT '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.equal(r.rows.length,2);
  for(const s of r.rows)for(const a of [s.control,s.experimental]){
   if(a.selection.status==='selected')assert.equal(a.selection.ids.length,s.count);
   assert.ok(['not-selected','intent-refused','boundary-refused','graph-refused','cyclic-refused','direct-road-valid'].includes(a.result.status));
  }
 }
 assert.ok(rows.some(r=>r.rows.some(s=>s.matched)));
 assert.deepEqual(runSquareMovementPilot(SQUARE_PILOT[0].id),rows[0]);
});
