import test from 'node:test';
import assert from 'node:assert/strict';
import {runP4XHybrid} from './ares-p4x-x56-run.mjs';
export function registerX56(id){
  test('P4X X5/X6 '+id,async()=>{
    const r=await runP4XHybrid(id);
    console.log('ARES_P4X_X56 '+JSON.stringify(r));
    assert.ok(['search-refused','geometry-recovered','work-limit'].includes(r.category));
    assert.ok(r.attempts<=256);assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
    if(r.hybrid)assert.equal(Object.values(r.hybrid.attempted).reduce((a,b)=>a+b,0),r.attempts);
    if(r.category==='geometry-recovered'){
      assert.equal(r.audit.status,'geometry-verified');assert.ok(r.witness.neighbors.length>=2&&r.witness.neighbors.length<=4);
      assert.ok(r.audit.stats.work<=8000000);assert.ok(r.audit.stats.expansions<=32768);
    }
  });
}
