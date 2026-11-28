import test from 'node:test';
import assert from 'node:assert/strict';
import { createAresDiagnosticContext, createAresDiagnostic, matchesAresDiagnosticContext, ARES_REFUSAL_REASONS } from '../src/core/ares-diagnostic-contract.js';
import { createAresConstraintRegistry } from '../src/core/ares-constraint-registry.js';
const ref=(collection,id)=>({collection,id});
const context=()=>({version:1,sessionId:'session-A',sourceVersion:'0.2.25-dev',operation:{
  version:1,family:'road',operation:'translate-road-group',projectId:'city-A',revision:7,
  editedRefs:[ref('roads','R2'),ref('roads','R1')],geometry:{offset:{x:75,y:-10}},permissions:{}
}});
const issue=()=>({reason:'domain-violation',code:'road-setback',stage:'verification',
  message:'Street setback is below the required distance.',refs:[ref('properties','P1'),ref('roads','R1'),ref('properties','P1')],
  source:{id:'road-impact',version:'1'},work:{work:10,expansions:2,remainingWork:90,remainingExpansions:8}});
test('ARES context reuses existing normalized operation, preserves intent and defaults off',()=>{
  const input=context(), result=createAresDiagnosticContext(input);
  input.operation.geometry.offset.x=1;
  assert.deepEqual(result.operation.geometry.offset,{x:75,y:-10});
  assert.deepEqual(result.operation.editedRefs,[ref('roads','R1'),ref('roads','R2')]);
  assert.equal(result.operation.permissions.destruction,false);
  assert.equal(result.operation.permissions.regeneration,false);
  assert.ok(Object.isFrozen(result.operation.geometry.offset));
});
test('ARES evidence is detached, typed, sorted and immutable',()=>{
  const input=issue(), result=createAresDiagnostic(context(),input);
  input.refs[0].id='changed';input.work.work=99;
  assert.deepEqual(result.refs,[ref('properties','P1'),ref('roads','R1')]);
  assert.equal(result.work.work,10);assert.ok(Object.isFrozen(result.refs[0]));
  assert.ok(Object.isFrozen(result.source));assert.ok(Object.isFrozen(result.work));
});
test('ARES refuses invalid context and unrecognized authority fields',()=>{
  for(const patch of [{version:2},{sessionId:''},{mode:'Restructure'}])
    assert.throws(()=>createAresDiagnosticContext({...context(),...patch}));
  const bad=context();bad.operation.geometry.offset.x=Infinity;
  assert.throws(()=>createAresDiagnosticContext(bad));
  const unsupported=context();unsupported.operation.editedRefs=[ref('nodes','N1')];
  assert.throws(()=>createAresDiagnosticContext(unsupported));
});
test('ARES diagnostic distinguishes reasons without asserting global impossibility',()=>{
  for(const reason of ARES_REFUSAL_REASONS){
    const result=createAresDiagnostic(context(),{...issue(),reason});
    assert.equal(result.reason,reason);assert.equal(Object.hasOwn(result,'globallyImpossible'),false);
    assert.equal(Object.hasOwn(result,'applyReady'),false);
  }
});
test('ARES rejects malformed evidence, unknown refs and impossible work counts',()=>{
  for(const patch of [{reason:'impossible'},{refs:[ref('constructor','X')]},{refs:['P1']},
    {source:{id:'x',version:'1',verified:true}},{work:{work:1,expansions:2,remainingWork:0,remainingExpansions:0}},
    {work:{work:-1,expansions:0,remainingWork:0,remainingExpansions:0}},{applyReady:true}])
    assert.throws(()=>createAresDiagnostic(context(),{...issue(),...patch}));
});
test('ARES context matching rejects changed revision, session, intent and permissions',()=>{
  const evidence=createAresDiagnostic(context(),issue());
  assert.equal(matchesAresDiagnosticContext(evidence,context()),true);
  for(const mutate of [c=>c.sessionId='other',c=>c.sourceVersion='future',c=>c.operation.revision++,c=>c.operation.geometry.offset.x++,c=>c.operation.permissions.destruction=true,c=>c.operation.projectId='other',c=>c.operation.editedRefs=[ref('roads','R3')]]){
    const c=context();mutate(c);assert.equal(matchesAresDiagnosticContext(evidence,c),false);
  }
  assert.equal(matchesAresDiagnosticContext({version:1,context:{}},context()),false);
});
test('ARES descriptor registry admits synthetic vertical capability without central feature cases',()=>{
  const a={id:'water',version:1,capabilities:['shore','crossing']},b={id:'synthetic-elevation',version:1,capabilities:['vertical-clearance']};
  const registry=createAresConstraintRegistry([a,b]);a.capabilities.push('vertical-clearance');
  assert.deepEqual(registry.descriptors(),createAresConstraintRegistry([b,{id:'water',version:1,capabilities:['crossing','shore']}]).descriptors());
  assert.equal(registry.supports('synthetic-elevation','vertical-clearance'),true);
  assert.equal(registry.supports('water','vertical-clearance'),false);
  assert.equal(registry.supports('missing','vertical-clearance'),false);
  assert.ok(Object.isFrozen(registry.descriptors()[0].capabilities));
});
test('ARES descriptor registry fails closed on duplicates, versions and injected write authority',()=>{
  const d={id:'water',version:1,capabilities:['shore']};
  for(const entries of [[d,d],[{...d,version:2}],[{...d,capabilities:['shore','shore']}],[{...d,write:true}],[{...d,capabilities:[]}],[{...d,query:()=>[]}]]){
    assert.throws(()=>createAresConstraintRegistry(entries));
  }
});
