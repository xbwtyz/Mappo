import test from 'node:test';
import assert from 'node:assert/strict';
import {TOURNAMENT_MANIFEST,inventoryTournamentCase} from './ares-p5-tournament-inventory.mjs';
import {HOLDOUT_MANIFEST} from './ares-p5-holdout-inventory.mjs';
import {PLAZA_RECOVERY_CASES,searchDiversifiedPlazaRecovery} from './ares-p5-holdout-plaza-recovery.mjs';
export function registerTournamentInventory(morphology,part){
 for(const row of TOURNAMENT_MANIFEST.rows.filter(r=>r.options.morphology===morphology).slice(part*5,(part+1)*5))test('Freeze tournament source '+row.id,()=>{
  const r=inventoryTournamentCase(row.id);
  console.log('ARES_TOURNAMENT_INVENTORY '+JSON.stringify(r));
  assert.equal(r.id,row.id);assert.match(r.source,/^[0-9a-f]{64}$/);
  assert.ok(['selected','selection-limit','selection-unavailable'].includes(r.selection));
  if(r.selection==='selected')assert.ok(r.selectedRoadIds.length>=4&&r.selectedRoadIds.length<=8);
  assert.ok(!HOLDOUT_MANIFEST.rows.some(x=>x.options.seed===r.options.seed));
 });
}
export function registerOriginalRematch(morphology,part){
 for(const id of PLAZA_RECOVERY_CASES.filter(x=>x.startsWith('h:'+morphology+'-')).slice(part*4,(part+1)*4))test('Frozen diversified rematch '+id,async()=>{
  const r=await searchDiversifiedPlazaRecovery(id);
  console.log('ARES_TOURNAMENT_REMATCH '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.ok(r.attempts<=47&&r.localProbes<=192&&r.attempts+r.localProbes+(r.construction?.attempts??0)<=256);
  assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
  if(r.status==='verified'){assert.equal(r.audit.rotationDiagnostic.finalChanged,0);assert.equal(r.audit.plazaPreservation.geometry,'unchanged');assert.equal(r.audit.sweptUnresolved.length,0);}
 });
}
