import test from 'node:test';
import assert from 'node:assert/strict';
import {runP4XRadial} from './ares-p4x-radial-run.mjs';
import {radialRecipe} from './ares-p4x-radial-scope.mjs';
export function registerRadial(id){
  test('P4X radial '+id,async()=>{
    const r=await runP4XRadial(id),recipe=radialRecipe('g:'+id);
    console.log('ARES_P4X_RADIAL '+JSON.stringify(r));
    assert.equal(r.cap,recipe.cap);assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
    assert.ok(r.attempts<=256);assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
    if(r.hybrid)assert.equal(Object.values(r.hybrid.attempted).reduce((a,b)=>a+b,0),r.attempts);
    if(r.category!=='work-limit'){assert.ok(r.hybrid.connectedGroups>=1);if(recipe.minimum)assert.equal(r.hybrid.seedValidated,true);}
    if(r.category==='geometry-recovered'){
      assert.equal(r.audit.status,'geometry-verified');assert.ok(r.witness.neighbors.length<=recipe.cap);if(recipe.minimum)assert.equal(r.witness.neighbors.length,recipe.minimum);
      assert.ok(r.audit.stats.work<=8000000);assert.ok(r.audit.stats.expansions<=32768);
    }
  });
}
