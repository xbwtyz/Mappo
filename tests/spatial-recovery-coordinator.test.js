import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup, searchSpatialNondestructiveRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialDestructionBudget, createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../src/core/spatial-recovery-coordinator.js';
import { issueIdentityReservation } from '../src/core/identity-verification.js';
const roads=['RD-0184','RD-0186'],offset0={x:-3.005274072121821,y:-37.39896113564458};
const make=()=>createProject({seed:'mappo-001',size:'medium',morphology:'organic',
  shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
const move=(project,factor,permissions)=>normalizeSpatialRoadGroup(project,1,roads,
  {x:offset0.x*factor,y:offset0.y*factor},permissions);
const flex={alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2};
const budget=()=>createSpatialDestructionBudget();
const clone=x=>JSON.parse(JSON.stringify(x));
test('unified road coordinator retains the exact qualified nondestructive witness despite destructive permission',{timeout:300000},async()=>{
  const project=make(),before=JSON.stringify(project);
  const preserving=move(project,.025,flex),op=move(project,.025,{...flex,destruction:true});
  const baseline=await searchSpatialNondestructiveRoadGroup(project,preserving,createSpatialPreservationBudget(),{reusePackingInventory:true});
  assert.equal(baseline.status,'verified-witness');
  const result=await searchSpatialUnifiedRoadGroup(project,op,budget());
  assert.equal(result.status,'verified-witness');assert.equal(result.kind,'nondestructive');
  assert.deepEqual(result.basisDelta,baseline.delta);
  assert.equal(result.delta.candidateFingerprint,baseline.delta.candidateFingerprint);
  assert.deepEqual(result.delta.retired,[]);assert.deepEqual(result.delta.added,[]);
  assert.deepEqual(result.attempts.map(r=>r.phase),['nondestructive']);
  const actual=await verifySpatialUnifiedRoadWitness(project,op,result,budget());
  assert.deepEqual(actual.identityAllocation,project.identityAllocation);
  const altered=clone(result);altered.kind='retirement';
  await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,op,altered,budget()));
  await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,{...op,revision:2},result,budget()));
  assert.equal(JSON.stringify(project),before);
  console.log('SRE_UNIFIED_ND '+JSON.stringify({attempts:result.attempts,fingerprint:result.delta.candidateFingerprint,stats:result.stats}));
});
test('unified road coordinator respects permission-off, shared budget and independently verifies destructive fallback',{timeout:300000},async()=>{
  const project=make(),before=JSON.stringify(project);
  const denied=move(project,-.5,flex);
  const refusal=await searchSpatialUnifiedRoadGroup(project,denied,createSpatialPreservationBudget());
  assert.equal(refusal.status,'refused');assert.equal(refusal.delta,null);
  assert.deepEqual(refusal.attempts.map(r=>r.phase),['nondestructive']);
  const op=move(project,-.5,{...flex,destruction:true});
  const result=await searchSpatialUnifiedRoadGroup(project,op,budget());
  console.log('SRE_UNIFIED_DESTRUCTIVE_ATTEMPTS '+JSON.stringify({kind:result.kind,attempts:result.attempts,stats:result.stats,exhausted:result.exhausted}));
  assert.equal(result.status,'verified-witness');assert.equal(result.kind,'retirement');
  assert.ok(result.delta.retired.length);assert.deepEqual(result.delta.added,[]);
  assert.equal(result.attempts[0].phase,'nondestructive');
  assert.equal(result.attempts[0].status,'refused');
  assert.ok(result.stats.work<=32000000&&result.stats.expansions<=131072);
  const actual=await verifySpatialUnifiedRoadWitness(project,op,result,budget());
  assert.deepEqual(actual.identityAllocation,project.identityAllocation);
  await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,denied,result,budget()));
  const forged=clone(result);forged.basisDelta.retired.pop();
  await assert.rejects(()=>verifySpatialUnifiedRoadWitness(project,op,forged,budget()));
  const tiny=await searchSpatialUnifiedRoadGroup(project,op,createSpatialDestructionBudget({work:1,stateExpansions:1}));
  assert.equal(tiny.status,'refused');assert.equal(tiny.delta,null);
  assert.equal(JSON.stringify(project),before);
  console.log('SRE_UNIFIED_DESTRUCTIVE '+JSON.stringify({ledger:result.ledger,stats:result.stats}));
});
test('unified optional regeneration cannot run without explicit valid context and never displaces an available nondestructive witness',{timeout:300000},async()=>{
  const project=make(),before=JSON.stringify(project),op=move(project,.025,{...flex,destruction:true,regeneration:true});
  await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,op,budget()),/context/);
  const context={projectId:op.projectId,revision:1,namespace:'12'.repeat(16)};
  const result=await searchSpatialUnifiedRoadGroup(project,op,budget(),{context});
  assert.equal(result.kind,'nondestructive');assert.equal(result.provisionalAuthorization,null);
  assert.deepEqual(result.attempts.map(r=>r.phase),['nondestructive']);
  assert.deepEqual(result.delta.added,[]);
  await verifySpatialUnifiedRoadWitness(project,op,result,budget());
  assert.equal(JSON.stringify(project),before);
});

test('unified recovery checkpoint observation is opt-in, read-only and preserves ordinary deterministic results',{timeout:300000},async()=>{
  const project=make(),before=JSON.stringify(project),op=move(project,.025,{...flex,destruction:true});
  const direct=await searchSpatialUnifiedRoadGroup(project,op,budget());
  const observed=[];
  const actual=await searchSpatialUnifiedRoadGroup(project,op,budget(),{checkpoint:state=>{
    assert.ok(Object.isFrozen(state));
    assert.ok(Object.isFrozen(state.stats));
    assert.equal(state.hasIncumbent,false);
    assert.equal(state.incumbentKind,null);
    assert.equal(Object.hasOwn(state,'candidateProject'),false);
    assert.equal(Object.hasOwn(state,'delta'),false);
    observed.push(state);
    return 'continue';
  }});
  assert.deepEqual(actual,direct);
  assert.deepEqual(observed.map(s=>s.phase),['nondestructive']);
  assert.equal(observed[0].stats.work,0);
  assert.equal(JSON.stringify(project),before);
  await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,op,budget(),{checkpoint:1}),/observer/);
  await assert.rejects(()=>searchSpatialUnifiedRoadGroup(project,op,budget(),{checkpoint:()=> 'invalid'}),/decision/);
});

test('unified recovery can stop before any search without spending work or inventing a candidate',async()=>{
  const project=make(),before=JSON.stringify(project),op=move(project,.025,flex),parent=createSpatialPreservationBudget();
  const result=await searchSpatialUnifiedRoadGroup(project,op,parent,{checkpoint:()=> 'stop'});
  assert.equal(result.stopped,true);
  assert.equal(result.status,'refused');
  assert.equal(result.delta,null);
  assert.equal(result.basisDelta,null);
  assert.deepEqual(result.attempts,[]);
  assert.equal(result.stats.work,0);
  assert.equal(result.stats.expansions,0);
  assert.equal(result.exhausted,null);
  assert.equal(JSON.stringify(project),before);
});

test('unified recovery pauses on the same budget and stops with independently replayable bound incumbent',{timeout:300000},async()=>{
  const project=make(),before=JSON.stringify(project),op=move(project,-.5,{...flex,destruction:true});
  const parent=budget(),seen=[];
  let enter,resume;
  const entered=new Promise(resolve=>{enter=resolve;});
  const hold=new Promise(resolve=>{resume=resolve;});
  const task=searchSpatialUnifiedRoadGroup(project,op,parent,{checkpoint:async state=>{
    seen.push(state);
    if(seen.length===1){enter(state);await hold;}
    if(state.hasIncumbent)return 'stop';
    return 'continue';
  }});
  // Fail rather than hang if a future implementation exits before checkpoint.
  const first=await Promise.race([entered,task.then(()=>{throw Error('No checkpoint');})]);
  assert.equal(first.phase,'nondestructive');
  const atPause=parent.snapshot();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(parent.snapshot(),atPause);
  resume();
  const result=await task;
  assert.equal(result.stopped,true);
  assert.equal(result.status,'verified-witness');
  assert.equal(result.kind,'retirement');
  assert.ok(result.delta.retired.length>0);
  assert.deepEqual(result.delta.added,[]);
  assert.equal(seen.at(-1).hasIncumbent,true);
  assert.equal(seen.at(-1).phase,'restoration');
  assert.ok(!result.attempts.some(row=>row.phase==='restoration'));
  assert.deepEqual(result.stats,seen.at(-1).stats);
  assert.deepEqual(result.stats,parent.snapshot());
  assert.ok(result.stats.work<=32000000&&result.stats.expansions<=131072);
  const candidate=await verifySpatialUnifiedRoadWitness(project,op,result,budget());
  assert.deepEqual(candidate.identityAllocation,project.identityAllocation);
  assert.equal(JSON.stringify(project),before);
});
