import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { resolveRoadGroupB1 } from '../src/core/road-group-b1.js';
import { riReporter } from '../src/core/road-impact-model.js';
import { adaptAresGraphIssue, adaptAresGroupIssue, adaptAresFaceIssue, adaptAresIntentIssue, adaptAresImpactIssue, adaptAresRecoveryRefusal } from '../src/core/ares-diagnostic-adapters.js';
import { createAresDiagnosticContext, matchesAresDiagnosticContext } from '../src/core/ares-diagnostic-contract.js';
const ref=(collection,id)=>({collection,id});
const context=()=>({version:1,sessionId:'session-A',sourceVersion:'0.2.25-dev',operation:{
  version:1,family:'road',operation:'translate-road-group',projectId:'city-A',revision:7,
  editedRefs:[ref('roads','AB'),ref('roads','BC')],geometry:{offset:{x:0,y:75}},permissions:{}
}});
const triangle=()=>({nodes:[{id:'A',x:0,y:0},{id:'B',x:10,y:0},{id:'C',x:0,y:10}],
  roads:[{id:'AB',a:'A',b:'B',kind:'primary'},{id:'BC',a:'B',b:'C',kind:'secondary'},{id:'CA',a:'C',b:'A',kind:'lane'}]});
test('ARES maps actual graph duplicate-edge issues to typed refs and preserves original',()=>{
  const city=triangle();city.roads.push({...city.roads[0],id:'AB2'});
  const before=JSON.stringify(city),issue=buildRoadGraph(city).issues.find(i=>i.code==='duplicate-edge');
  const d=adaptAresGraphIssue(context(),issue);
  assert.equal(d.reason,'domain-violation');assert.deepEqual(d.refs,[ref('roads','AB'),ref('roads','AB2')]);
  assert.equal(JSON.stringify(city),before);
});
test('ARES maps actual group selection refusal without granting scope',()=>{
  const result=resolveRoadGroupB1(buildRoadGraph(triangle()),['AB','missing']);
  const d=adaptAresGroupIssue(context(),result.issues[0]);
  assert.equal(d.reason,'invalid-input');assert.deepEqual(d.refs,[ref('roads','missing')]);assert.equal(d.context.operation.permissions.destruction,false);
});
test('ARES keeps untyped face and object IDs unresolved',()=>{
  const d=adaptAresFaceIssue(context(),{code:'face-ambiguous',message:'Ambiguous',faceIds:['B1'],roadIds:['AB'],objectIds:['X']});
  assert.equal(d.reason,'unknown-data');assert.deepEqual(d.refs,[ref('roads','AB')]);assert.deepEqual(d.unresolvedIds,['B1','X']);
});
test('ARES does not classify unknown source codes by message or infer identity from prefixes',()=>{
  const d=adaptAresGraphIssue(context(),{code:'future',message:'protected work-limit',roadIds:['PROP-1']});
  assert.equal(d.reason,'unclassified');assert.deepEqual(d.refs,[ref('roads','PROP-1')]);
  assert.equal(adaptAresImpactIssue(context(),{kind:'defense',id:'WALL-1',code:'future',message:'Unknown',relatedIds:[]}).refs.length,0);
});
test('ARES maps actual reporter setback shape with exact unrounded measurements',()=>{
  const reporter=riReporter();reporter.emit('property','PROP-00398','road-setback','Setback',['R1','B1'],
    {oldDistance:9.123456,newDistance:8.211234,requiredDistance:8.7,oldRequiredDistance:null});
  const original=reporter.items()[0],d=adaptAresImpactIssue(context(),original);
  assert.equal(d.reason,'domain-violation');assert.deepEqual(d.refs,[ref('properties','PROP-00398')]);
  assert.deepEqual(d.unresolvedIds,['B1','R1']);assert.deepEqual(d.measurements,{unit:'map-unit',...original.metrics});
  assert.ok(Object.isFrozen(d.measurements));assert.equal(original.metrics.newDistance,8.211234);
});
test('ARES skips informational reflow/impact and distinguishes unavailable topology',()=>{
  assert.equal(adaptAresIntentIssue(context(),{code:'neighborhood-reflow-pending'}),null);
  assert.equal(adaptAresImpactIssue(context(),{severity:'info'}),null);
  assert.equal(adaptAresIntentIssue(context(),{code:'topology-analysis-unavailable',message:'Failed'}).reason,'verification-failure');
  assert.equal(adaptAresIntentIssue(context(),{code:'face-reflow-needed',message:'Reflow'}).reason,'unsupported-capability');
});
const refused=()=>({status:'refused',operation:createAresDiagnosticContext(context()).operation,delta:null,exhausted:null,
  stats:{work:10,expansions:2,remainingWork:90,remainingExpansions:8}});
test('ARES distinguishes ordinary bounded search, child budget limit and explicit Stop',()=>{
  assert.equal(adaptAresRecoveryRefusal(context(),refused()).reason,'search-exhausted');
  assert.equal(adaptAresRecoveryRefusal(context(),{...refused(),exhausted:'work'}).reason,'work-limit');
  const stopped=adaptAresRecoveryRefusal(context(),{...refused(),stopped:true,exhausted:'stateExpansions'});
  assert.equal(stopped.reason,'stopped');assert.equal(stopped.work.remainingWork,90);
});
test('ARES rejects mismatched or invalid recovery evidence and malformed source IDs',()=>{
  const c=context();c.operation.revision++;
  assert.throws(()=>adaptAresRecoveryRefusal(c,refused()));
  for(const patch of [{status:'verified-witness'},{delta:{}},{exhausted:'unknown'},{stats:null},{stopped:'yes'}])
    assert.throws(()=>adaptAresRecoveryRefusal(context(),{...refused(),...patch}));
  assert.throws(()=>adaptAresGraphIssue(context(),{code:'future',message:'bad',roadIds:['']}));
});
test('ARES rejects invalid measured evidence and preserves signed zero in context matching',()=>{
  assert.throws(()=>adaptAresImpactIssue(context(),{kind:'property',id:'P',code:'road-setback',message:'bad',metrics:{newDistance:-1,requiredDistance:8.7}}));
  const c=context(),d=adaptAresGraphIssue(c,{code:'future',message:'unknown'});
  c.operation.geometry.offset.x=-0;assert.equal(matchesAresDiagnosticContext(d,c),false);
});
