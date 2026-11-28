import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAZA_RECOVERY_CASES,diagnosePlazaRecovery} from './ares-p5-holdout-plaza-recovery.mjs';
export function registerPlazaRecovery(morphology,part){
 for(const id of PLAZA_RECOVERY_CASES.filter(x=>x.startsWith('h:'+morphology+'-')).slice(part*4,(part+1)*4))test('Matched plaza recovery structure '+id,async()=>{
  const r=await diagnosePlazaRecovery(id);console.log('ARES_HOLDOUT_PLAZA_RECOVERY_STRUCTURE '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
  assert.ok(['diagnosed','work-limit'].includes(r.status));
  if(r.status==='diagnosed'){assert.equal(r.arms.length,2);assert.ok(r.arms[1].mandatory<=r.arms[0].mandatory);for(const a of r.arms){if(a.minimum.status==='exact')assert.equal(a.withinEight,a.minimum.minimum<=8);}}
 });
}
