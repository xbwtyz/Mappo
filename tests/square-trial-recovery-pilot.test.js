import test from 'node:test';
import assert from 'node:assert/strict';
import {SQUARE_RECOVERY_CASES,squareRecoveryLockedRow} from '../scripts/development/research/square-trial-recovery-lock.mjs';
import {searchSquareTrialRecovery} from '../scripts/development/research/ares-p5-holdout-plaza-recovery.mjs';
import {auditP5CoordinatedCandidate} from '../scripts/development/research/ares-p5-topology-audit.mjs';
for(const id of SQUARE_RECOVERY_CASES)test('Square S2b2 bounded P5 coordinated recovery '+id,async()=>{
 const row=squareRecoveryLockedRow(id),r=await searchSquareTrialRecovery(id);
 console.log('SQUARE_RECOVERY_PILOT '+JSON.stringify({id,source:r.source,matched:row.matched,status:r.status,reason:r.reason,attempts:r.attempts,localProbes:r.localProbes,minimum:r.minimum,stats:r.stats,audit:r.audit&&{status:r.audit.status,reason:r.audit.reason,stats:r.audit.stats,sweptUnresolved:r.audit.sweptUnresolved.length,rotationDiagnostic:r.audit.rotationDiagnostic},neighbors:r.construction?.witness?.neighbors.length,contacts:r.construction?.witness?.contacts.length}));
 assert.equal(r.authority,'none');assert.equal(r.source,row.source);assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
 assert.ok(r.attempts<=47&&r.localProbes<=192);
 if(id==='sq:linear-small:central:control')assert.equal(r.status,'boundary-refused');
 if(r.status==='verified'){
  assert.equal(r.audit.status,'topology-final-verified');assert.equal(r.audit.sweptUnresolved.length,0);
  assert.ok(r.construction.witness.neighbors.length<=8);
  const bad=structuredClone(r.construction);bad.source='0'.repeat(64);
  assert.notEqual((await auditP5CoordinatedCandidate(id,bad)).status,'topology-final-verified');
 }
});
test('Square S2b2 recovery only accepts registered detached recipes',async()=>{
 await assert.rejects(searchSquareTrialRecovery('sq:unregistered'));
 await assert.rejects(searchSquareTrialRecovery({city:{}}));
});
