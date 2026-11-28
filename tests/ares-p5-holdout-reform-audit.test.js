import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFreshRtreReformWitness} from '../scripts/development/research/ares-rtre-verify.mjs';
import {REFORM_AUDIT_ARMS,reformAuditSeed} from '../scripts/development/research/ares-p5-holdout-reform-audit-lock.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const budget=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
for(const arm of REFORM_AUDIT_ARMS)test('Independent numerical geometry audit '+arm,async()=>{
 const a=await verifyFreshRtreReformWitness('h:linear-09',arm,budget());
 console.log('ARES_HOLDOUT_REFORM_AUDIT '+JSON.stringify(a));
 assert.equal(a.caseId,'h:linear-09');
 assert.ok(a.stats.work<=8000000&&a.stats.expansions<=32768);
 assert.ok(['geometry-verified','rejected','unverified'].includes(a.status));
 if(a.status==='geometry-verified'){assert.equal(a.arm,arm);assert.equal(a.neighborCount,5);assert.equal(a.sweptUnresolved,0);assert.equal(a.finalChecked,a.changedRoadIds.length*3);}
});
test('No arbitrary reform audit geometry or profiles',async()=>{
 assert.throws(()=>reformAuditSeed('h:linear-09','c4-d100'),/Frozen reform audit/);
 await assert.rejects(()=>verifyFreshRtreReformWitness('h:radial-12','c8-d100',budget()),/Frozen reform audit/);
});
