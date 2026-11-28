import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAZA_CASES,diagnoseHoldoutPlaza} from './ares-p5-holdout-plaza-diagnostics.mjs';
export function registerPlaza(morphology,part){
 for(const id of PLAZA_CASES.filter(x=>x.startsWith('h:'+morphology+'-')).slice(part*5,(part+1)*5))test('Plaza proximity and protection '+id,async()=>{
  const r=await diagnoseHoldoutPlaza(id);
  // Emit compact auditable per-case statistics; individual anchor evidence
  // and contact pairs remain in the report, with explicit attribution.
  console.log('ARES_HOLDOUT_PLAZA '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);assert.ok(['diagnosed','work-limit'].includes(r.status));
  if(r.status==='diagnosed'){assert.ok(r.contacts.plazaBlocked<=r.contacts.blocked&&r.contacts.blocked<=r.contacts.total);if(r.plaza.present)assert.ok(r.plaza.minNormalized>=0&&r.plaza.minHops>=0);}
 });
}
