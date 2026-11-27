import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { APP_VERSION } from '../src/core/version.js';
import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { normalizeSpatialRoadGroup } from '../src/core/spatial-recovery-road-adapter.js';
import { searchSpatialUnifiedRoadGroup } from '../src/core/spatial-recovery-coordinator.js';
import { exportAresStandardRefusalDiagnostic, replayAresStandardRefusalDiagnostic } from '../src/core/ares-diagnostic-replay.js';

const source='a'.repeat(40);
const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
  shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties:false});
const roads=['RD-0184','RD-0186'];
const context=(permissions={alternativeFrontage:true,uniformScaling:true,maxLinearReduction:.2})=>({
  version:1,sessionId:'standard-refusal',sourceVersion:APP_VERSION,
  operation:normalizeSpatialRoadGroup(project,7,roads,
    {x:-3.005274072121821*-.5,y:-37.39896113564458*-.5},permissions)
});
const limits={work:8000000,stateExpansions:32768},tiny={work:1,stateExpansions:1};
const options=(caps=limits)=>({confirmed:true,sourceRevision:source,limits:caps,quality:'standard',schedule:'baseline',controlled:false});
const expected={expectedSourceRevision:source};
const search=(ctx,caps)=>searchSpatialUnifiedRoadGroup(project,ctx.operation,
  ctx.operation.permissions.destruction?createSpatialDestructionBudget(caps):createSpatialPreservationBudget(caps));
let tinyFixture;
async function getTiny(){
  if(!tinyFixture){
    const ctx=context(),result=await search(ctx,tiny);
    tinyFixture={ctx,result,text:exportAresStandardRefusalDiagnostic(project,ctx,result,options(tiny))};
  }
  return tinyFixture;
}
test('ARES reproduces actual completed Standard coordinator refusal and phase accounting',{timeout:300000},async()=>{
  const before=JSON.stringify(project),ctx=context(),result=await search(ctx,limits);
  assert.equal(result.status,'refused');assert.equal(result.delta,null);
  const text=exportAresStandardRefusalDiagnostic(project,ctx,result,options());
  const replay=await replayAresStandardRefusalDiagnostic(text,{...expected,expectedContext:ctx});
  assert.equal(replay.status,'reproduced');
  assert.deepEqual(replay.observed.diagnostic.work,result.stats);
  assert.deepEqual(replay.observed.attempts.map(r=>r.phase),result.attempts.map(r=>r.phase));
  assert.equal(Object.hasOwn(replay.observed,'delta'),false);
  assert.equal(JSON.stringify(project),before);
});
test('ARES preserves a bounded budget refusal with explicit destructive permission but never returns a candidate',async()=>{
  const before=JSON.stringify(project),ctx=context({destruction:true}),result=await search(ctx,tiny);
  assert.equal(result.status,'refused');
  const text=exportAresStandardRefusalDiagnostic(project,ctx,result,options(tiny));
  const replay=await replayAresStandardRefusalDiagnostic(text,expected);
  assert.equal(replay.status,'reproduced');assert.equal(replay.context.operation.permissions.destruction,true);
  assert.equal(replay.observed.diagnostic.work.work,result.stats.work);
  assert.equal(Object.hasOwn(replay.observed,'candidate'),false);
  assert.equal(JSON.stringify(project),before);
});
test('ARES rejects unconfirmed, incompatible, stopped and mismatched recovery capture',async()=>{
  const {ctx,result}=await getTiny();
  for(const patch of [{confirmed:false},{quality:'high'},{schedule:'grouped-first'},{controlled:true},
    {limits:{work:8000001,stateExpansions:1}},{limits:{work:2,stateExpansions:1}}]){
    assert.throws(()=>exportAresStandardRefusalDiagnostic(project,ctx,result,{...options(tiny),...patch}));
  }
  for(const patch of [{stopped:true},{status:'verified-witness'},{delta:{}},{basisDelta:{}},{provisionalAuthorization:{}}])
    assert.throws(()=>exportAresStandardRefusalDiagnostic(project,ctx,{...result,...patch},options(tiny)));
  assert.throws(()=>exportAresStandardRefusalDiagnostic(project,context({destruction:true,regeneration:true}),result,options(tiny)),/Regeneration/);
});
test('ARES replay rejects stale context, wrong source, unsafe scope and over-ceiling limits',async()=>{
  const {ctx,text}=await getTiny(),stale={...ctx,operation:{...ctx.operation,revision:8}};
  await assert.rejects(()=>replayAresStandardRefusalDiagnostic(text,{...expected,expectedContext:stale}),/Stale/);
  await assert.rejects(()=>replayAresStandardRefusalDiagnostic(text,{expectedSourceRevision:'b'.repeat(40)}),/revision mismatch/);
  const envelope=JSON.parse(text);
  for(const patch of [{kind:'road-group-preflight'},{applyReady:true},{limits:{work:8000001,stateExpansions:1}}])
    await assert.rejects(()=>replayAresStandardRefusalDiagnostic(JSON.stringify({...envelope,...patch}),expected));
});
test('ARES recovery replay detects tampered phase evidence without trusting exported claims',async()=>{
  const {text}=await getTiny(),envelope=JSON.parse(text);
  envelope.observed.attempts.push({phase:'fabricated'});
  const result=await replayAresStandardRefusalDiagnostic(JSON.stringify(envelope),expected);
  assert.equal(result.status,'mismatch');assert.ok(!result.observed.attempts.some(r=>r.phase==='fabricated'));
});
