import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAZA_RECOVERY_CASES,diagnosePlazaRecovery,samePlazaRecoveryOrder} from '../scripts/development/research/ares-p5-holdout-plaza-recovery.mjs';
test('Plaza structural cohort and cyclic gate are fixed',async()=>{
 assert.equal(PLAZA_RECOVERY_CASES.length,49);assert.equal(new Set(PLAZA_RECOVERY_CASES).size,49);
 assert.equal(samePlazaRecoveryOrder(['a','b','c'],['b','c','a']),true);
 assert.equal(samePlazaRecoveryOrder(['a','b','c'],['a','c','b']),false);
 await assert.rejects(()=>diagnosePlazaRecovery('h:unknown'),/Frozen plaza experiment/);
});
