import test from 'node:test';
import assert from 'node:assert/strict';
import {runP4XX7} from './ares-p4x-x7-run.mjs';
import {x7Recipe} from './ares-p4x-x7-scope.mjs';
export function registerX7(id){
  test('P4X X7 '+id,async()=>{
    const r=await runP4XX7(id),recipe=x7Recipe('g:'+id);
    console.log('ARES_P4X_X7 '+JSON.stringify(r));
    assert.equal(r.minimum,recipe.minimum);
    assert.ok(['search-refused','geometry-recovered','work-limit'].includes(r.category));
    assert.ok(r.attempts<=256);assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
    if(r.hybrid)assert.equal(Object.values(r.hybrid.attempted).reduce((a,b)=>a+b,0),r.attempts);
    if(r.category!=='work-limit'){assert.equal(r.hybrid.seedValidated,true);assert.ok(r.hybrid.connectedGroups>=1);}
    if(r.category==='geometry-recovered'){
      assert.equal(r.audit.status,'geometry-verified');assert.equal(r.witness.neighbors.length,recipe.minimum);
      assert.ok(r.audit.stats.work<=8000000);assert.ok(r.audit.stats.expansions<=32768);
    }
  });
}
