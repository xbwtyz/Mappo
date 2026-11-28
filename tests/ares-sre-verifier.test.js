import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialDestructionBudget, createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { searchSpatialUnifiedRoadGroup } from '../src/core/spatial-recovery-coordinator.js';
import { createAresSreVerifier, ARES_SRE_METRICS } from '../src/core/ares-sre-verifier.js';
import { createAresCandidateRetention } from '../src/core/ares-candidate-retention.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
import { APP_VERSION } from '../src/core/version.js';
const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
  shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
const original=aresReplayJson(project);
const flex={alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2};
const context=(factor,permissions=flex)=>({version:1,sessionId:'p3-c2',sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(project,1,['RD-0184','RD-0186'],
    {x:-3.005274072121821*factor,y:-37.39896113564458*factor},permissions)});
const budget=()=>createSpatialDestructionBudget();
const profile={id:'research-consequences',version:1,criteria:ARES_SRE_METRICS.map(metric=>({metric,direction:'min'}))};
const proposal=(v,r)=>({version:1,context:v.context,snapshotFingerprint:v.snapshotFingerprint,
  proposal:{kind:r.kind,delta:r.delta,basisDelta:r.basisDelta}});
const setup=async(ctx,root=budget())=>{
  const v=await createAresSreVerifier(project,ctx,root);
  return {v,root,r:createAresCandidateRetention(ctx,v.snapshotFingerprint,profile,3,v.verify,root)};
};
let ordinary,destructive;
async function witness(destroy){
  const ctx=destroy?context(-.5,{...flex,destruction:true}):context(.025);
  if(destroy)destructive??=searchSpatialUnifiedRoadGroup(project,ctx.operation,budget());
  else ordinary??=searchSpatialUnifiedRoadGroup(project,ctx.operation,createSpatialPreservationBudget());
  return destroy?destructive:ordinary;
}
test('P3 real nondestructive SRE search and independent retention use a single existing root',async()=>{
  const ctx=context(.025),root=createSpatialPreservationBudget(),{v,r}=await setup(ctx,root);
  const searched=await searchSpatialUnifiedRoadGroup(project,ctx.operation,root);
  assert.equal(searched.status,'verified-witness');assert.equal(searched.kind,'nondestructive');
  const before=root.snapshot().work;
  assert.equal((await r.consider(proposal(v,searched))).status,'retained');
  const row=r.snapshot().incumbent,m=row.metrics;
  assert.equal(v.snapshotFingerprint,createHash('sha256').update(original).digest('hex'));
  for(const k of ['retiredProperties','retiredPlots','retiredBuildings','demolishedFootprint'])assert.equal(m[k],0);
  assert.ok(m.modifiedRecords>0);assert.ok(root.snapshot().work>before);
  assert.ok(root.snapshot().work<=8000000);
  assert.equal(createHash('sha256').update(JSON.stringify(row.candidate)).digest('hex'),searched.delta.candidateFingerprint);
  assert.equal(aresReplayJson(project),original);
});
test('P3 real retirement consequences are independently measured from verified city membership',async()=>{
  const ctx=context(-.5,{...flex,destruction:true}),{v,r}=await setup(ctx);
  // Standalone verifier qualification reuses a known real witness produced
  // under a separate existing search budget, not a portfolio comparison.
  const searched=await witness(true);assert.equal(searched.kind,'retirement');
  await r.consider(proposal(v,searched));
  const row=r.snapshot().incumbent,m=row.metrics;
  for(const [c,k] of [['properties','retiredProperties'],['plots','retiredPlots'],['buildings','retiredBuildings']])
    assert.equal(m[k],project.city[c].length-row.candidate.city[c].length);
  assert.ok(m.retiredBuildings>0);
  const surviving=new Set(row.candidate.city.buildings.map(b=>b.id));
  const loss=project.city.buildings.filter(b=>!surviving.has(b.id)).reduce((s,b)=>s+b.area,0);
  assert.equal(m.demolishedFootprint,loss);
  assert.equal(aresReplayJson(project),original);
});
test('P3 independently verified incumbent survives forged delta and unauthorized evidence',async()=>{
  const ctx=context(.025),{v,r}=await setup(ctx),searched=await witness(false);
  await r.consider(proposal(v,searched));const before=r.snapshot();
  const forged=JSON.parse(JSON.stringify(proposal(v,searched)));
  forged.proposal.delta.candidateFingerprint='b'.repeat(64);
  await assert.rejects(()=>r.consider(forged));
  await assert.rejects(()=>r.consider({...proposal(v,searched),proposal:{...proposal(v,searched).proposal,ledger:{buildings:0}}}));
  await assert.rejects(()=>r.consider(proposal(v,{...searched,kind:'retirement'})),/Unauthorized/);
  assert.deepEqual(r.snapshot(),before);
  assert.equal(aresReplayJson(project),original);
});
test('P3 source binding detects stale contexts and rejects unsupported regeneration',async()=>{
  const ctx=context(.025),{v,r}=await setup(ctx),searched=await witness(false);
  await assert.rejects(()=>r.consider({...proposal(v,searched),context:{...ctx,sessionId:'different'}}),/Stale/);
  await assert.rejects(()=>r.consider({...proposal(v,searched),snapshotFingerprint:'b'.repeat(64)}),/Stale/);
  await assert.rejects(()=>createAresSreVerifier(project,context(.025,{...flex,destruction:true,regeneration:true}),budget()),/regeneration/);
  const changed=JSON.parse(original);changed.city.name='different';
  const other=await createAresSreVerifier(changed,ctx,budget());
  assert.notEqual(other.snapshotFingerprint,v.snapshotFingerprint);
  await assert.rejects(()=>other.verify(proposal(v,searched).proposal,{context:ctx,snapshotFingerprint:v.snapshotFingerprint,profile},budget()),/Stale/);
  assert.equal(r.snapshot().incumbent,null);
});
test('P3 unsupported ranking metric and budget exhaustion fail closed',async()=>{
  const ctx=context(.025),{v}=await setup(ctx),searched=await witness(false);
  const unsupported=createAresCandidateRetention(ctx,v.snapshotFingerprint,
    {id:'unsupported',version:1,criteria:[{metric:'imaginary',direction:'max'}]},1,v.verify,budget());
  await assert.rejects(()=>unsupported.consider(proposal(v,searched)),/Unsupported ARES SRE ranking metric/);
  assert.equal(unsupported.snapshot().incumbent,null);
  await assert.rejects(()=>createAresSreVerifier(project,ctx,createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
});
