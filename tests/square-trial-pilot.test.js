import test from 'node:test';
import assert from 'node:assert/strict';
import {SQUARE_PILOT,runSquarePilot} from '../scripts/development/research/square-trial-pilot.mjs';
test('Square trial S1 detached matched generation pilot reports every arm, with no persisted project authority',()=>{
 const results=SQUARE_PILOT.map(r=>runSquarePilot(r.id));
 assert.equal(results.length,8);assert.equal(new Set(results.map(r=>r.survey)).size,8);
 for(const r of results){
  console.log('SQUARE_TRIAL_PILOT '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.equal(r.roadRecovery,'not-evaluated');
  for(const a of [r.control,r.experimental])assert.ok(['valid','refused'].includes(a.status));
  if(r.control.status==='valid')assert.ok(r.control.plazaRoads>0);
  if(r.experimental.status==='valid'){assert.equal(r.experimental.plazaRoads,0);assert.ok(r.experimental.blocks>0);assert.ok(r.experimental.properties>0);}
 }
 assert.ok(results.some(r=>r.control.status==='valid'));
 assert.ok(results.some(r=>r.experimental.status==='valid'));
 assert.deepEqual(runSquarePilot(SQUARE_PILOT[0].id),results[0]);
 assert.throws(()=>runSquarePilot('unregistered'));
});
