import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyFreshRtreWitness } from '../scripts/development/research/ares-rtre-verify.mjs';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const recorded=JSON.parse(readFileSync(new URL('./fixtures/ares-p4-evidence/geometry-45978603404.json',import.meta.url),'utf8')).rows;
const linear=recorded.find(r=>r.caseId==='holdout-linear'),mixed=recorded.find(r=>r.caseId==='mixed-small'),river=recorded.find(r=>r.caseId==='mixed-river');
const options=r=>({mode:'adaptive',...r.limits,maxNeighbors:r.maxNeighbors,maxCandidates:r.maxCandidates});
const audit=(r,budget=createSpatialDestructionBudget(),opts=options(r))=>verifyFreshRtreWitness(r.caseId,opts,r,budget);
test('F2 independently replays recorded linear geometry and all 45 final provider observations',async()=>{
  const r=await audit(linear);
  assert.equal(r.status,'geometry-verified');assert.equal(r.finalChecked,45);assert.equal(r.sweptUnresolved,0);
  assert.deepEqual(r.changedRoadIds,linear.adjustedWitness.changedRoadIds);
  console.log('ARES_P4_F2 '+JSON.stringify({id:linear.caseId,...r}));
});
test('F2 mixed adjusted and exact baseline preserve distinct swept uncertainty',async()=>{
  const a=await audit(mixed,createSpatialPreservationBudget());
  assert.equal(a.status,'geometry-verified');assert.equal(a.finalChecked,33);assert.equal(a.sweptUnresolved,2);
  const baseline={...mixed,adjustedWitness:null};
  const b=await audit(baseline,createSpatialPreservationBudget());
  assert.equal(b.status,'geometry-verified');assert.equal(b.finalChecked,21);assert.equal(b.sweptUnresolved,1);
  console.log('ARES_P4_F2 '+JSON.stringify({id:mixed.caseId,adjusted:a,baseline:b}));
});
test('F2 refuses altered exact coordinates, unauthorized neighbors and stale source evidence',async()=>{
  const altered=structuredClone(linear),selected=altered.adjustedWitness.updates.find(u=>!altered.adjustedWitness.neighbors.some(n=>n.id===u.id));
  selected.point.x+=1;assert.equal((await audit(altered)).reason,'coordinate-update');
  const unauthorized=structuredClone(linear);unauthorized.adjustedWitness.neighbors[0].id=selected.id;
  assert.equal((await audit(unauthorized)).reason,'neighbor-authority');
  const stale={...linear,snapshotFingerprint:'0'.repeat(64)};
  assert.equal((await audit(stale)).reason,'evidence-mismatch');
});
test('F2 recomputes rather than trusts road coverage or provider claims',async()=>{
  const missing=structuredClone(linear);missing.adjustedWitness.changedRoadIds.pop();
  assert.equal((await audit(missing)).reason,'changed-road-evidence');
  const falseClear=structuredClone(mixed);falseClear.adjustedWitness.constraints.sweptUnresolved=[];
  assert.equal((await audit(falseClear,createSpatialPreservationBudget())).reason,'constraint-evidence-mismatch');
});
test('F2 refuses fixed river, Strict adjustment, missing scope and exhausted audit budget',async()=>{
  assert.equal((await audit(river)).reason,'no-valid-witness');
  assert.equal((await audit(linear,createSpatialDestructionBudget(),{...options(linear),mode:'strict'})).reason,'neighbor-authority');
  const narrow={...options(linear),maxObjects:1};
  assert.equal((await audit({...linear,limits:{...linear.limits,maxObjects:1}},createSpatialDestructionBudget(),narrow)).reason,'scope-refused');
  const low=await audit(linear,createSpatialDestructionBudget({work:1,stateExpansions:1}));
  assert.equal(low.status,'unverified');assert.equal(low.reason,'work-limit');
});
