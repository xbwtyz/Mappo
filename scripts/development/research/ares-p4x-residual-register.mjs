import test from 'node:test';
import assert from 'node:assert/strict';
import {runP4XResidual} from './ares-p4x-residual-run.mjs';
import {radialRecipe} from './ares-p4x-radial-scope.mjs';
import {residualSeeds} from './ares-p4x-residual.mjs';
export function registerResidual(id){
  test('P4X residual '+id,async()=>{
    const r=await runP4XResidual(id),recipe=radialRecipe('g:'+id);
    console.log('ARES_P4X_RESIDUAL '+JSON.stringify(r));
    assert.equal(r.cap,recipe.cap);assert.ok(['geometry-recovered','search-refused','work-limit'].includes(r.category));
    assert.ok(r.attempts<=256);assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
    if(r.hybrid)assert.equal(Object.values(r.hybrid.attempted).reduce((a,b)=>a+b,0),r.attempts);
    if(r.category!=='work-limit'){assert.equal(r.hybrid.seedValidated,residualSeeds('g:'+id).length);assert.ok(r.hybrid.cacheHits>0);}
    if(r.category==='geometry-recovered'){
      assert.equal(r.audit.status,'geometry-verified');assert.ok(r.witness.neighbors.length<=recipe.cap);if(recipe.minimum)assert.equal(r.witness.neighbors.length,recipe.minimum);
      assert.ok(r.audit.stats.work<=8000000);assert.ok(r.audit.stats.expansions<=32768);
    }
  });
}
