import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { APP_VERSION } from '../src/core/version.js';
import { MAX_PROJECT_BYTES } from '../src/data/project-validation.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { exportAresPreflightDiagnostic, replayAresPreflightDiagnostic } from '../src/core/ares-diagnostic-replay.js';

const source='a'.repeat(40);
const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const ids=['RD-0113','RD-0114'];
const context=(offset={x:99999,y:99999})=>({version:1,sessionId:'diagnostic-session',sourceVersion:APP_VERSION,
  operation:{version:1,family:'road',operation:'translate-road-group',projectId:project.city.id,revision:7,
    editedRefs:ids.map(id=>({collection:'roads',id})),geometry:{offset},permissions:{}}});
const options={confirmed:true,sourceRevision:source};
const replayOptions={expectedSourceRevision:source};
const capture=(ctx=context())=>exportAresPreflightDiagnostic(project,ctx,options);

test('ARES explicit diagnostic export replays a real blocked road intent without accepted mutation',()=>{
  const before=JSON.stringify(project),ctx=context(),text=capture(ctx),result=replayAresPreflightDiagnostic(text,replayOptions);
  const expected=prepareRoadGroupIntentB1(project,ids,ctx.operation.geometry.offset);
  assert.equal(result.status,'reproduced');assert.equal(result.observed.status,expected.status);
  assert.ok(result.observed.diagnostics.length);assert.equal(result.observed.facesResolved,expected.facesResolved===true);
  assert.equal(Object.hasOwn(result,'candidate'),false);assert.equal(Object.hasOwn(result.observed,'applyReady'),false);
  assert.equal(JSON.stringify(project),before);assert.equal(capture(ctx),text);
  assert.ok(Object.isFrozen(result.observed.diagnostics));
});
test('ARES reproduces eligible intent without claiming that it is an accepted solution',()=>{
  const ctx=context({x:.05,y:0}),result=replayAresPreflightDiagnostic(capture(ctx),replayOptions);
  const expected=prepareRoadGroupIntentB1(project,ids,ctx.operation.geometry.offset);
  assert.equal(result.status,'reproduced');assert.equal(result.observed.draftable,true);
  assert.deepEqual(result.observed.proposedNodes,expected.proposedNodes.map(n=>({id:n.id,x:n.x,y:n.y})));
  assert.equal(Object.hasOwn(result.observed,'project'),false);
});
test('ARES diagnostic preserves signed zero, exact selected intent and permission flags',()=>{
  const ctx=context({x:-0,y:1});ctx.operation.permissions.destruction=true;
  const text=capture(ctx),result=replayAresPreflightDiagnostic(text,{...replayOptions,expectedContext:ctx});
  assert.equal(result.status,'reproduced');assert.ok(Object.is(result.context.operation.geometry.offset.x,-0));
  assert.equal(result.context.operation.permissions.destruction,true);
  assert.equal(result.context.operation.permissions.regeneration,false);
  const changed=context({x:0,y:1});changed.operation.permissions.destruction=true;
  assert.throws(()=>replayAresPreflightDiagnostic(text,{...replayOptions,expectedContext:changed}),/Stale/);
});
test('ARES rejects implicit export, wrong source, wrong application and stale context',()=>{
  assert.throws(()=>exportAresPreflightDiagnostic(project,context(),{sourceRevision:source}),/confirmation/);
  assert.throws(()=>exportAresPreflightDiagnostic(project,context(),{confirmed:true,sourceRevision:'main'}),/source revision/);
  const text=capture(),wrong=context();wrong.sourceVersion='future';
  assert.throws(()=>exportAresPreflightDiagnostic(project,wrong,options),/application version/);
  assert.throws(()=>replayAresPreflightDiagnostic(text,{expectedSourceRevision:'b'.repeat(40)}),/revision mismatch/);
  const stale=context();stale.operation.revision++;
  assert.throws(()=>replayAresPreflightDiagnostic(text,{...replayOptions,expectedContext:stale}),/Stale/);
});
test('ARES validates real snapshot schema and project identity without migrating or adopting',()=>{
  const wrong=context();wrong.operation.projectId='other';
  assert.throws(()=>exportAresPreflightDiagnostic(project,wrong,options),/identity or schema/);
  const old=JSON.parse(JSON.stringify(project));old.schemaVersion=10;
  assert.throws(()=>exportAresPreflightDiagnostic(old,context(),options),/identity or schema/);
  const invalid=JSON.parse(JSON.stringify(project));invalid.city.nodes[0].x=999999;
  assert.throws(()=>exportAresPreflightDiagnostic(invalid,context(),options));
});
test('ARES detects changed recorded observation rather than trusting supplied diagnostic',()=>{
  const envelope=JSON.parse(capture());envelope.observed.status='fabricated';
  const result=replayAresPreflightDiagnostic(JSON.stringify(envelope),replayOptions);
  assert.equal(result.status,'mismatch');assert.notEqual(result.observed.status,'fabricated');
});
test('ARES rejects unsupported/malformed diagnostic envelopes and oversize input',()=>{
  assert.throws(()=>replayAresPreflightDiagnostic('{',replayOptions),/JSON/);
  assert.throws(()=>replayAresPreflightDiagnostic(' '.repeat(MAX_PROJECT_BYTES+1),replayOptions),/oversized/);
  const text=capture(),envelope=JSON.parse(text);
  for(const patch of [{version:2},{kind:'full-search'},{format:'mappo-project'},{applyReady:true}]){
    assert.throws(()=>replayAresPreflightDiagnostic(JSON.stringify({...envelope,...patch}),replayOptions));
  }
  assert.throws(()=>replayAresPreflightDiagnostic(text.replace('"observed":{','"observed":{"__proto__":{},'),replayOptions),/unsafe/);
});
