import test from 'node:test';
import assert from 'node:assert/strict';
import {runRadialDiagnostic} from './ares-p4x-radial-diagnostic-run.mjs';
import {radialRecipe} from './ares-p4x-radial-scope.mjs';
export function registerDiagnostic(id,arm){
  test('P4X radial diagnostic '+arm+' '+id,async()=>{
    const r=await runRadialDiagnostic(id,arm),recipe=radialRecipe('g:'+id);
    console.log('ARES_P4X_RADIAL_DIAGNOSTIC '+JSON.stringify(r));
    assert.equal(r.cap,recipe.cap);assert.ok(['search-refused','work-limit','geometry-recovered'].includes(r.category));
    assert.ok(r.attempts<=256);assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
    assert.ok(r.diagnostics.completed<=r.attempts);assert.ok(r.diagnostics.rejected<=r.diagnostics.completed);
    assert.ok(r.diagnostics.recurrence.length<=1024);assert.equal(Object.values(r.diagnostics.phases).reduce((a,b)=>a+b,0),r.stats.work);
    assert.equal(r.audit.status,'diagnostic-verified');assert.equal(r.audit.replay.matches,true);
    assert.ok(r.audit.stats.work<=8000000);assert.ok(r.audit.stats.expansions<=32768);
    // Diagnostic output never grants recovery credit, even if a replay
    // happens to reach a valid candidate before instrumentation truncates.
  });
}
