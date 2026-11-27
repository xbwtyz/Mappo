import test from 'node:test';
import assert from 'node:assert/strict';
import { createAresStrategyRegistry } from '../src/core/ares-strategy-registry.js';
import { createAresDiagnostic } from '../src/core/ares-diagnostic-contract.js';
import { createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';

const budget=()=>createSpatialPreservationBudget();
const context=(permissions={})=>({version:1,sessionId:'p3-a',sourceVersion:'0.2.25-dev',operation:{
  version:1,family:'road',operation:'translate-road-group',projectId:'city-A',revision:7,
  editedRefs:[{collection:'roads',id:'R2'},{collection:'roads',id:'R1'}],geometry:{offset:{x:0,y:75}},permissions}});
const diagnostic=(ctx,reason='domain-violation')=>createAresDiagnostic(ctx,{reason,code:'road-setback',
  stage:'discovery',message:'Test evidence',refs:[{collection:'properties',id:'P1'}],
  source:{id:'test-provider',version:'1'}});
const strategy=(id,patch={})=>({id,version:1,requiredCapabilities:[],requiredPermissions:[],blockerReasons:[],...patch});
const assess=(r,c,capabilities=[],diagnostics=[])=>r.assess(c,{capabilities,diagnostics},budget());
test('P3 strategy descriptors are stable, detached, immutable and order-independent',()=>{
  const a=strategy('z',{requiredCapabilities:['water','roads'],blockerReasons:['scope-limited','domain-violation']});
  const b=strategy('a');
  const r=createAresStrategyRegistry([a,b],budget()),reference=createAresStrategyRegistry([b,a],budget());
  a.requiredCapabilities.push('injected');b.id='changed';
  assert.deepEqual(r.descriptors(),reference.descriptors());
  assert.deepEqual(r.descriptors().map(d=>d.id),['a','z']);
  assert.ok(Object.isFrozen(r.descriptors()[1].requiredCapabilities));
  assert.ok(Object.isFrozen(r.descriptors()));
});
test('P3 strategy routing retains explicit missing capability and permission reasons',()=>{
  const r=createAresStrategyRegistry([
    strategy('baseline'),
    strategy('retirement',{requiredPermissions:['destruction'],requiredCapabilities:['parcel-recovery'],blockerReasons:['domain-violation']}),
    strategy('scaling',{requiredPermissions:['uniformScaling']}),
    strategy('vertical',{requiredCapabilities:['continuous-elevation']}),
    strategy('scope',{blockerReasons:['scope-limited']})],budget());
  const ctx=context(),d=diagnostic(ctx),rows=assess(r,ctx,[],[d]).assessments;
  const get=id=>rows.find(r=>r.descriptor.id===id);
  assert.equal(get('baseline').status,'eligible-for-consideration');
  assert.equal(get('retirement').status,'permission-required');
  assert.deepEqual(get('retirement').missingPermissions,['destruction']);
  assert.deepEqual(get('retirement').missingCapabilities,['parcel-recovery']);
  assert.deepEqual(get('retirement').matchedReasons,['domain-violation']);
  assert.equal(get('scaling').status,'permission-required');
  assert.equal(get('vertical').status,'unsupported-capability');
  assert.equal(get('scope').status,'not-relevant');
  const permitted=context({destruction:true}),p=assess(r,permitted,['parcel-recovery'],[diagnostic(permitted)]);
  assert.equal(p.assessments.find(r=>r.descriptor.id==='retirement').status,'eligible-for-consideration');
  assert.equal(p.context.operation.permissions.uniformScaling,false);
  assert.equal(p.context.operation.permissions.regeneration,false);
  assert.ok(Object.isFrozen(p.assessments[0]));
  assert.equal(Object.hasOwn(p,'applyReady'),false);
});
test('P3 blocker-driven routing is deterministic without activating unobserved strategies',()=>{
  const a=strategy('scope',{blockerReasons:['scope-limited','domain-violation']});
  const b=strategy('other',{blockerReasons:['protected-content']});
  const r=createAresStrategyRegistry([a,b],budget()),c=context();
  const issues=[diagnostic(c),diagnostic(c,'scope-limited')];
  const x=assess(r,c,[],issues),y=assess(r,c,[],issues.slice().reverse());
  assert.deepEqual(x,y);assert.deepEqual(x.assessments.find(r=>r.descriptor.id==='scope').matchedReasons,['domain-violation','scope-limited']);
  assert.equal(assess(r,c).assessments[1].status,'not-relevant');
  assert.equal(x.assessments[0].status,'not-relevant');
});
test('P3 stale and malformed diagnostic evidence cannot route a strategy',()=>{
  const r=createAresStrategyRegistry([strategy('baseline')],budget()),c=context(),d=diagnostic(c);
  for(const changed of [{...c,sessionId:'new'},{...c,operation:{...c.operation,revision:8}},
    context({destruction:true}),{...c,operation:{...c.operation,geometry:{offset:{x:-0,y:75}}}}])
    assert.throws(()=>assess(r,changed,[],[d]),/Stale/);
  for(const patch of [{reason:'invented'},{refs:['P1']},{applyReady:true}])
    assert.throws(()=>assess(r,c,[],[{...d,...patch}]));
});
test('P3 registry rejects injected execution, authority, invalid versions and duplicate IDs',()=>{
  const d=strategy('x');
  for(const inputs of [[d,d],[{...d,version:2}],[{...d,execute:()=>null}],[{...d,write:true}],
    [{...d,requiredPermissions:['topologyRestructure']}],[{...d,requiredCapabilities:['x','x']}],
    [{...d,blockerReasons:['impossible']}],[{...d,requiredCapabilities:Array(1)}],
    [{...d,id:''}],[{id:'missing',version:1}],[Object.assign(Object.create({id:'x'}),d)]])
    assert.throws(()=>createAresStrategyRegistry(inputs,budget()));
});
test('P3 registry and routing consume one caller budget and fail closed on exhaustion',()=>{
  const tiny=()=>createSpatialPreservationBudget({work:1,stateExpansions:1});
  assert.throws(()=>createAresStrategyRegistry([strategy('x',{requiredCapabilities:['a']})],tiny()),/budget/);
  const root=budget(),r=createAresStrategyRegistry([strategy('x',{requiredCapabilities:['a']})],root);
  const prior=root.snapshot().work;
  assert.ok(prior>0);r.assess(context(),{capabilities:['a'],diagnostics:[]},root);
  assert.ok(root.snapshot().work>prior);
  assert.throws(()=>r.assess(context(),{capabilities:['a'],diagnostics:[diagnostic(context())]},tiny()),/budget/);
  assert.throws(()=>r.assess(context(),{capabilities:[],diagnostics:[]}),/budget/);
});
