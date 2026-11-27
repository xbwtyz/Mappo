import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createProject } from '../src/core/city-model.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { searchSpatialUnifiedRoadGroup } from '../src/core/spatial-recovery-coordinator.js';
import { createSpatialHighQualityBudget } from '../src/core/spatial-recovery-quality.js';
import { runAresSrePortfolio } from '../src/core/ares-sre-portfolio.js';
import { createAresDiagnostic } from '../src/core/ares-diagnostic-contract.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
import { APP_VERSION } from '../src/core/version.js';
const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
  shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
const original=aresReplayJson(project),flex={alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2};
const ctx=(factor,permissions=flex)=>({version:1,sessionId:'p3-d2',sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(project,1,['RD-0184','RD-0186'],
    {x:-3.005274072121821*factor,y:-37.39896113564458*factor},permissions)});
const profile={id:'research-only',version:1,criteria:['retiredProperties','retiredPlots','retiredBuildings',
  'demolishedFootprint','survivingFootprintLoss','buildingFrontageChanges','modifiedRecords'].map(metric=>({metric,direction:'min'}))};
const task=(taskId,strategyId='sre-baseline',work=8000000,stateExpansions=32768)=>({taskId,strategyId,limits:{work,stateExpansions}});
const config=(tasks,patch={})=>({tasks,diagnostics:[],profile,capacity:3,
  policy:{verificationReserveWork:2000000,verificationReserveExpansions:32,maxStagnantTasks:4},checkpoint:null,...patch});
const evidence=(context)=>createAresDiagnostic(context,{reason:'domain-violation',code:'research-routing-control',
  stage:'research',message:'Synthetic routing control only.',refs:[],source:{id:'test',version:'1'}});
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
test('P3 real portfolio preserves qualified nondestructive baseline and exact single-root accounting',async()=>{
  const context=ctx(.025),root=createSpatialPreservationBudget();
  const reference=await searchSpatialUnifiedRoadGroup(project,context.operation,createSpatialPreservationBudget());
  assert.equal(reference.status,'verified-witness');
  const options=config([task('baseline')]);
  const a=await runAresSrePortfolio(project,context,options,root);
  assert.equal(a.reason,'plan-complete');assert.equal(a.events[0].status,'proposed');
  assert.equal(hash(a.retention.incumbent.candidate),reference.delta.candidateFingerprint);
  assert.equal(a.retention.incumbent.metrics.retiredBuildings,0);
  assert.deepEqual(a.ledger.root,root.snapshot());assert.ok(root.snapshot().work<=8000000);
  assert.ok(a.ledger.settled[0].usage.work>0);
  const b=await runAresSrePortfolio(project,context,options,createSpatialPreservationBudget());
  assert.deepEqual(a,b);assert.equal(aresReplayJson(project),original);
});
test('P3 real budget refusal routes a later existing schedule with explicitly permitted destruction',async()=>{
  const context=ctx(.025,{...flex,destruction:true}),root=createSpatialDestructionBudget();
  // The first task has only enough work to report a bounded refusal.
  // The later schedule still follows its existing nondestructive-first path.
  const options=config([task('challenger','sre-grouped-first',8000000),task('tiny','sre-baseline',2000,1)]);
  const r=await runAresSrePortfolio(project,context,options,root);
  assert.equal(r.reason,'plan-complete');
  assert.deepEqual(r.events.map(e=>e.taskId),['tiny','challenger']);
  assert.equal(r.events[0].status,'refused');
  assert.equal(r.events[1].status,'proposed');
  assert.equal(r.retention.incumbent.metrics.retiredBuildings,0);
  assert.equal(r.ledger.settled[0].task.strategyId,'sre-baseline');
  assert.equal(r.ledger.settled[1].task.strategyId,'sre-grouped-first');
  assert.deepEqual(r.ledger.root,root.snapshot());
  assert.equal(aresReplayJson(project),original);
});
test('P3 real alternate schedule yields an independently verified retirement candidate under one Standard root',async()=>{
  const context=ctx(-.5,{...flex,destruction:true}),root=createSpatialDestructionBudget();
  const options=config([task('area','sre-area-deficit-direct',28000000,131000)],{diagnostics:[evidence(context)]});
  const r=await runAresSrePortfolio(project,context,options,root);
  assert.equal(r.reason,'plan-complete');
  assert.ok(r.retention.incumbent,'real authorized retirement witness required');
  assert.ok(r.retention.incumbent.metrics.retiredBuildings>0);
  assert.equal(r.ledger.settled.length,1);
  assert.deepEqual(r.ledger.root,root.snapshot());
  assert.ok(root.snapshot().work<=32000000);
  assert.equal(aresReplayJson(project),original);
  console.log('ARES_P3_REAL_PORTFOLIO '+JSON.stringify({strategy:'sre-area-deficit-direct',reason:r.reason,
    metrics:r.retention.incumbent.metrics,work:root.snapshot(),task:r.ledger.settled[0].usage}));
});
test('P3 real portfolio refuses unauthorized alternates and retains original refusal',async()=>{
  const context=ctx(-.5),root=createSpatialPreservationBudget();
  const options=config([task('baseline'),task('group','sre-grouped-first'),task('area','sre-area-deficit-direct')]);
  const r=await runAresSrePortfolio(project,context,options,root);
  assert.equal(r.reason,'no-eligible-task');assert.equal(r.retention.incumbent,null);
  assert.deepEqual(r.events.map(e=>e.taskId),['baseline']);
  assert.equal(r.events[0].status,'refused');
  assert.deepEqual(r.pending.map(t=>t.taskId),['group','area']);
  assert.equal(aresReplayJson(project),original);
});
test('P3 portfolio denies unapproved budgets, strategies and regeneration, and supports boundary stop',async()=>{
  const context=ctx(.025),options=config([task('baseline')]);
  await assert.rejects(()=>runAresSrePortfolio(project,context,options,createSpatialDestructionBudget()),/existing limits/);
  await assert.rejects(()=>runAresSrePortfolio(project,ctx(.025,{...flex,destruction:true}),options,createSpatialHighQualityBudget()),/existing limits/);
  await assert.rejects(()=>runAresSrePortfolio(project,ctx(.025,{...flex,destruction:true,regeneration:true}),options,createSpatialDestructionBudget()),/regeneration/);
  await assert.rejects(()=>runAresSrePortfolio(project,context,config([task('unknown','invented')]),createSpatialPreservationBudget()),/unknown/);
  const r=await runAresSrePortfolio(project,context,{...options,checkpoint:()=> 'stop'},createSpatialPreservationBudget());
  assert.equal(r.reason,'stopped');assert.equal(r.ledger.settled.length,0);
  assert.equal(r.retention.incumbent,null);assert.equal(aresReplayJson(project),original);
});
