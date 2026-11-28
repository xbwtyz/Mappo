import test from 'node:test';
import assert from 'node:assert/strict';
import {searchDiversifiedPlazaRecovery} from '../scripts/development/research/ares-p5-holdout-plaza-recovery.mjs';
const cases=['h:linear-08','h:linear-20','h:radial-06','h:radial-09','h:radial-15','h:radial-21','h:organic-08','h:planned-04'];
for(const id of cases)test('Diversified coordinated recovery '+id,async()=>{
 const r=await searchDiversifiedPlazaRecovery(id);
 console.log('ARES_HOLDOUT_PLAZA_DIVERSIFIED '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.ok(r.attempts<=47&&r.localProbes<=192&&r.attempts+r.localProbes+(r.construction?.attempts??0)<=256);
 assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
 if(r.diversified){assert.ok(r.diversified.groups.length<=6);assert.ok(r.diversified.groups.every(g=>g.ids.length<=8));assert.equal(r.diversified.groups.reduce((n,g)=>n+g.attempts,0),r.attempts);assert.equal(r.diversified.groups.reduce((n,g)=>n+g.probes,0),r.localProbes);}
 if(id==='h:organic-08'){assert.equal(r.status,'refused');assert.equal(r.minimum.status,'no-endpoint-cover');}
 if(id==='h:linear-08')assert.equal(r.status,'verified');
 if(r.status==='verified'){assert.equal(r.audit.rotationDiagnostic.finalChanged,0);assert.equal(r.audit.plazaPreservation.geometry,'unchanged');assert.equal(r.audit.sweptUnresolved.length,0);}
});
