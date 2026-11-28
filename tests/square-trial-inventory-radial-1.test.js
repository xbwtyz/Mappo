import test from 'node:test';
import assert from 'node:assert/strict';
import {inventorySquareTournament} from '../scripts/development/research/square-trial-tournament-inventory.mjs';
for(const id of ["radial-01","radial-02","radial-03","radial-04","radial-05","radial-06","radial-07"])test('Square S3a frozen input '+id,()=>{
 const r=inventorySquareTournament(id);
 console.log('SQUARE_TOURNAMENT_INPUT '+JSON.stringify(r));
 assert.equal(r.id,id);assert.equal(r.authority,'none');assert.equal(r.recovery,'not-run');
 for(const a of [r.control,r.experimental]){
  assert.ok(['generation-refused','graph-refused','selected','selection-limit','selection-unavailable'].includes(a.status));
  if(a.status==='selected'){assert.equal(a.selection.ids.length,r.recipe.count);assert.match(a.source,/^[a-f0-9]{64}$/);}
 }
});
