import test from 'node:test';
import assert from 'node:assert/strict';
import {TOURNAMENT_CASES,tournamentLockedRow} from './ares-p5-tournament-lock.mjs';
import {searchTournamentPlazaRecovery} from './ares-p5-holdout-plaza-recovery.mjs';
export function registerTournamentRecovery(morphology,part){
 for(const id of TOURNAMENT_CASES.filter(x=>x.startsWith('t:t-'+morphology+'-')).slice(part*5,(part+1)*5))test('Frozen new-cohort recovery '+id,async()=>{
  const r=await searchTournamentPlazaRecovery(id),lock=tournamentLockedRow(id);
  console.log('ARES_TOURNAMENT_RECOVERY '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.source,lock.source);assert.equal(r.authority,'none');
  assert.ok(['verified','refused','unverified','work-limit','boundary-refused','preflight-refused'].includes(r.status));
  assert.ok(r.attempts<=47&&r.localProbes<=192&&r.attempts+r.localProbes+(r.construction?.attempts??0)<=256);
  assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
  if(r.status==='boundary-refused'){assert.equal(r.reason,'fixed-boundary');assert.ok(r.preflight.outside.length);assert.equal(r.attempts,0);assert.equal(r.localProbes,0);assert.equal(r.construction,null);}
  if(r.status==='verified'){assert.equal(r.audit.source,lock.source);assert.equal(r.audit.rotationDiagnostic.finalChanged,0);assert.equal(r.audit.plazaPreservation.geometry,'unchanged');assert.equal(r.audit.plazaPreservation.parentIncidence,'unchanged');assert.equal(r.audit.sweptUnresolved.length,0);}
 });
}
