import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCoordinatedPlazaRecovery} from '../scripts/development/research/ares-p5-holdout-plaza-recovery.mjs';
import {auditP5CoordinatedCandidate} from '../scripts/development/research/ares-p5-topology-audit.mjs';
const cases=["h:linear-08","h:linear-20","h:radial-06","h:radial-09","h:radial-15","h:radial-21","h:organic-08"];
for(const id of cases)test('Coordinated plaza pilot '+id,async()=>{
 const r=await searchCoordinatedPlazaRecovery(id);
 console.log('ARES_HOLDOUT_PLAZA_COORDINATED '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.ok(r.attempts<=47&&r.localProbes<=192&&r.attempts+r.localProbes+(r.construction?.attempts??0)<=256);
 assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
 if(id==='h:organic-08'){assert.equal(r.status,'refused');assert.equal(r.minimum.status,'no-endpoint-cover');}
 if(r.status==='verified'){
  assert.equal(r.audit.rotationDiagnostic.finalChanged,0);assert.equal(r.audit.plazaPreservation.geometry,'unchanged');assert.equal(r.audit.plazaPreservation.parentIncidence,'unchanged');assert.equal(r.audit.sweptUnresolved.length,0);
  const forged=structuredClone(r.construction);forged.witness.neighbors.push({id:forged.witness.requested[0].ref.id,old:{x:0,y:0},point:{x:1,y:1}});
  assert.equal((await auditP5CoordinatedCandidate(id,forged)).status,'rejected');
 }
});
test('Coordinated search rejects non-frozen sources',async()=>{await assert.rejects(searchCoordinatedPlazaRecovery('unknown'));});
