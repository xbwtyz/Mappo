import { verifySpatialRestorationAudit, SRE_RESTORATION_AUDIT_MAX_WITNESSES } from '../src/core/spatial-recovery-restoration-audit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/core/city-model.js';
import {normalizeSpatialRoadGroup} from '../src/core/spatial-recovery-road-adapter.js';
import {createSpatialDestructionBudget} from '../src/core/spatial-recovery-contract.js';
import {createSpatialHighQualityBudget,SRE_HIGH_QUALITY_LIMITS} from '../src/core/spatial-recovery-quality.js';
import {LARE_DEMOLITION_LIMITS} from '../src/core/reconciliation-budget.js';
import {searchSpatialUnifiedRoadGroup,verifySpatialUnifiedRoadWitness} from '../src/core/spatial-recovery-coordinator.js';
import {validateStoredProject} from '../src/data/project-validation.js';
const make=irregularProperties=>createProject({seed:'mappo-001',size:'medium',morphology:'organic',shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
const permissions={destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2};
const move=(project,scale,p=permissions)=>normalizeSpatialRoadGroup(project,1,['RD-0184','RD-0186'],{x:-3.005274072121821*scale,y:-37.39896113564458*scale},p);
const high={quality:'high'};
test('detached quality policy rejects mismatched budgets, permissions and schedules without mutation',async()=>{
  assert.equal(LARE_DEMOLITION_LIMITS.work,32000000);
  assert.deepEqual(SRE_HIGH_QUALITY_LIMITS,{work:256000000,stateExpansions:131072});
  assert.throws(()=>createSpatialDestructionBudget(SRE_HIGH_QUALITY_LIMITS));
  const project=make(false),before=JSON.stringify(project),op=move(project,.025);
  const spent=createSpatialHighQualityBudget();spent.spend();
  for(const b of [createSpatialDestructionBudget(),spent])
    await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,op,b,high),/fresh matching/);
  await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,move(project,.025,{...permissions,destruction:false}),createSpatialHighQualityBudget(),high),/destruction permission/);
  await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,move(project,.025,{...permissions,regeneration:true}),createSpatialHighQualityBudget(),high),/no regeneration/);
  await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,op,createSpatialHighQualityBudget(),{...high,schedule:'baseline'}),/diversified scheduling/);
  await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,op,createSpatialDestructionBudget(),{quality:'unknown'}),/quality/);
  assert.equal(JSON.stringify(project),before);
});
test('high quality preserves exact nondestructive priority and standard default',{timeout:300000},async()=>{
  const project=make(false),before=JSON.stringify(project),op=move(project,.025);
  const a=await searchSpatialUnifiedRoadGroup(project,op,createSpatialDestructionBudget());
  const b=await searchSpatialUnifiedRoadGroup(project,op,createSpatialHighQualityBudget(),high);
  assert.equal(b.kind,'nondestructive');assert.equal(b.delta.candidateFingerprint,'84a142db28b1251734fb8a7c6b6e263d4c45f00e4c5fd525b3a00e82faab1201');
  assert.deepEqual(b.delta,a.delta);assert.deepEqual(b.attempts.map(r=>r.phase),['nondestructive']);
  assert.equal(a.stats.work,b.stats.work);
  await verifySpatialUnifiedRoadWitness(project,op,b,createSpatialDestructionBudget());
  assert.equal(JSON.stringify(project),before);
});
test('integrated high quality reproduces qualified irregular severe reverse witness with independent standard-budget verification',{timeout:300000},async()=>{
  const project=make(true),before=JSON.stringify(project),op=move(project,-1),budget=createSpatialHighQualityBudget();
  const result=await searchSpatialUnifiedRoadGroup(project,op,budget,{...high,captureRestorationAudit:true});
  assert.equal(result.status,'verified-witness');assert.equal(result.kind,'retirement');
  assert.equal(result.delta.candidateFingerprint,'bbcbad96e73f85b19a2afd51743c9b6f00485daba564ee800576c5239bb80ec1');
  assert.deepEqual(['properties','plots','buildings'].map(k=>result.delta.retired.filter(r=>r.collection===k).length),[10,19,14]);
  assert.deepEqual(result.stats,budget.snapshot());assert.equal(result.stats.work,217305910);assert.equal(result.stats.expansions,51331);
  assert.ok(result.stats.work<=256000000&&result.stats.expansions<=131072);
  assert.ok(result.attempts.some(r=>r.phase==='iterative-child-1'));assert.ok(result.attempts.some(r=>r.phase==='final-refinement-0.95'));
  const actual=await verifySpatialUnifiedRoadWitness(project,op,result,createSpatialDestructionBudget());
  validateStoredProject(actual);assert.deepEqual(actual.identityAllocation,project.identityAllocation);assert.deepEqual(result.delta.added,[]);
  await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,move(project,-1,{...permissions,destruction:false}),result,createSpatialDestructionBudget()));
  const forged=structuredClone(result);forged.basisDelta.retired.pop();
  await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,op,forged,createSpatialDestructionBudget()));
  const trail=result.restorationTrail;
  assert.ok(trail.length>1);assert.deepEqual(trail.at(-1),result.basisDelta);
  assert.ok(Object.isFrozen(trail));
  const auditBudget=createSpatialDestructionBudget();
  console.log('SRE_RESTORATION_CAPTURE '+JSON.stringify({quality:'high',witnesses:trail.length,bytes:Buffer.byteLength(JSON.stringify(trail)),projectBytes:Buffer.byteLength(before),finalBasisBytes:Buffer.byteLength(JSON.stringify(result.basisDelta)),maxWitnesses:SRE_RESTORATION_AUDIT_MAX_WITNESSES}));
  // This is a qualification probe, not a new production refusal rule.
  // Keep the full selected lineage even if the detached audit cap is too small.
  if(trail.length<=SRE_RESTORATION_AUDIT_MAX_WITNESSES){
    const audit=await verifySpatialRestorationAudit(project,op,trail,result.basisDelta,auditBudget);
    assert.ok(audit.restored.length>0);
    assert.equal(audit.finalRetired.length,result.delta.retired.length);
    console.log('SRE_RESTORATION_CAPTURE_REPLAY '+JSON.stringify({quality:'high',verified:true,stats:auditBudget.snapshot(),gross:audit.grossRetired.length,restored:audit.restored.length,final:audit.finalRetired.length}));
  }else console.log('SRE_RESTORATION_CAPTURE_REPLAY '+JSON.stringify({quality:'high',verified:false,reason:'detached-witness-cap'}));
  assert.equal(JSON.stringify(project),before);
  console.log('SRE_HIGH_QUALITY_INTEGRATED '+JSON.stringify({fingerprint:result.delta.candidateFingerprint,stats:result.stats,ledger:result.ledger,attempts:result.attempts}));
});
