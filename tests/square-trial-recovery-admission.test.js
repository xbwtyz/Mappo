import test from 'node:test';
import assert from 'node:assert/strict';
import {SQUARE_ADMISSION_CASES,materializeSquareAdmission,inspectSquareAdmission} from '../scripts/development/research/square-trial-recovery-admission.mjs';
for(const id of SQUARE_ADMISSION_CASES)test('Square S2b1 bounded RTRE observer admission '+id,async()=>{
 const r=await inspectSquareAdmission(id);
 console.log('SQUARE_ADMISSION '+JSON.stringify(r));
 assert.equal(r.authority,'none');assert.equal(r.storedProject,id.endsWith(':control'));
 assert.equal(r.geometryStatus,'observed');assert.ok(r.requested.length>0);assert.equal(r.writable,0);
 assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
 assert.match(r.source,/^[0-9a-f]{64}$/);
});
test('Square S2b1 refuses arbitrary and unregistered recipes',()=>{
 assert.throws(()=>materializeSquareAdmission({city:{}}));assert.throws(()=>materializeSquareAdmission('unregistered'));
});
