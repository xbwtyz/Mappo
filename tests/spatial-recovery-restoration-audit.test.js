import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup, searchSpatialGroupedRetirementRoadGroup, restoreSpatialRoadRetirements } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialDestructionBudget, spatialRefKey } from '../src/core/spatial-recovery-contract.js';
import { verifySpatialRestorationAudit, SRE_RESTORATION_AUDIT_MAX_WITNESSES } from '../src/core/spatial-recovery-restoration-audit.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const make=()=>createProject({seed:'mappo-001',size:'medium',morphology:'organic',
  shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
const opFor=p=>normalizeSpatialRoadGroup(p,1,['RD-0184','RD-0186'],{x:1.5026370360609105,y:18.69948056782279},
  {destruction:true,alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2});
const budget=()=>createSpatialDestructionBudget();
test('detached restoration audit independently replays real broad seed and improved retirement membership',{timeout:300000},async()=>{
  const project=make(),before=JSON.stringify(project),op=opFor(project);
  const seed=await searchSpatialGroupedRetirementRoadGroup(project,op,budget());
  assert.equal(seed.status,'verified-witness');
  const restored=await restoreSpatialRoadRetirements(project,op,seed.delta,budget(),{proposalPolicy:'diversified'});
  assert.equal(restored.status,'verified-witness');
  assert.ok(restored.delta.retired.length<seed.delta.retired.length,'Known restoration fixture did not improve');
  const shared=budget(),result=await verifySpatialRestorationAudit(project,op,[seed.delta,restored.delta],restored.delta,shared);
  assert.ok(result.restored.length>0);
  const keys=rs=>rs.map(spatialRefKey).sort();
  assert.deepEqual(keys(result.grossRetired),keys(seed.delta.retired));
  assert.deepEqual(keys(result.finalRetired),keys(restored.delta.retired));
  assert.deepEqual(keys(result.restored),keys(seed.delta.retired.filter(r=>!keys(restored.delta.retired).includes(spatialRefKey(r)))));
  assert.deepEqual(keys(result.transitions[1].restored),keys(result.restored));
  assert.ok(result.grossRetiredFootprint>=result.finalRetiredFootprint);
  assert.ok(Math.abs(result.grossRetiredFootprint-result.finalRetiredFootprint-result.restoredFootprint)<1e-6);
  assert.equal(result.finalBasisFingerprint,restored.delta.candidateFingerprint);
  assert.ok(Object.isFrozen(result.restored));assert.ok(shared.snapshot().work>0);
  const altered=copy(seed.delta);altered.retired.pop();
  await assert.rejects(()=>verifySpatialRestorationAudit(project,op,[altered,restored.delta],restored.delta,budget()));
  await assert.rejects(()=>verifySpatialRestorationAudit(project,op,[seed.delta],restored.delta,budget()),/basis/);
  await assert.rejects(()=>verifySpatialRestorationAudit(project,op,[seed.delta,seed.delta],seed.delta,budget()),/Duplicate/);
  await assert.rejects(()=>verifySpatialRestorationAudit(project,op,[seed.delta,restored.delta],restored.delta,createSpatialDestructionBudget({work:1,stateExpansions:1})),/budget/);
  assert.equal(JSON.stringify(project),before);
});
test('restoration audit rejects missing, oversized and permission-off evidence before replay',async()=>{
  const project=make(),op=opFor(project),stub={candidateFingerprint:'x',retired:[],added:[]};
  for(const trail of [[],Array(SRE_RESTORATION_AUDIT_MAX_WITNESSES+1).fill(stub)])
    await assert.rejects(()=>verifySpatialRestorationAudit(project,op,trail,stub,budget()),/basis/);
  await assert.rejects(()=>verifySpatialRestorationAudit(project,{...op,permissions:{...op.permissions,destruction:false}},[stub],stub,budget()),/basis/);
  await assert.rejects(()=>verifySpatialRestorationAudit(project,op,[stub],stub,budget()),/retirement-only/);
});
