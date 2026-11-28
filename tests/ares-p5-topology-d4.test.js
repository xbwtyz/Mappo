import test from 'node:test';
import assert from 'node:assert/strict';
import {D4_IDS,materializeD4Control,constructD4Control} from '../scripts/development/research/ares-p5-topology-d4.mjs';
const permissions={mode:'restructure',intersection:true,split:false,merge:true,overlap:false};
const expected={near:'not-exact-coincidence',protected:'protected-road',unknown:'unknown-authorship',opaque:'opaque-node',collapse:'would-collapse-road',duplicate:'would-duplicate-edge',dependency:'external-dependency',scope:'outside-scope'};
for(const id of D4_IDS)test('P5 D3-D4 exact junction identity control '+id,()=>{
  const f=materializeD4Control(id),r=constructD4Control(id,permissions);
  console.log('ARES_P5_D4 '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.equal(r.independentlyVerified,false);assert.equal(r.cityRecovery,false);
  assert.ok(r.stats.work<=8000000);assert.ok(r.attempts<=1);
  if(id==='exact'||id==='exact-reversed'){
    assert.equal(r.status,'graph-control-candidate');assert.equal(r.attempts,1);
    assert.equal(r.witness.junctionLineage.survives,f.intent.id);assert.equal(r.witness.junctionLineage.retired,f.retire);
    assert.deepEqual(r.witness.retainedRoadIds,f.city.roads.map(e=>e.id));
    assert.equal(r.witness.graph.nodes,f.city.nodes.length-1);assert.equal(r.witness.graph.roads,f.city.roads.length);assert.equal(r.witness.graph.components,1);
    assert.equal(r.witness.roadLineage.length,2);
    assert.deepEqual(constructD4Control(id,permissions),r);
  }else{assert.equal(r.status,'refused');assert.equal(r.reason,expected[id]);assert.equal(r.attempts,0);assert.equal(r.witness,undefined);}
});
test('P5 D4 requires specific explicit junction-consolidation permission',()=>{
  for(const p of [{...permissions,mode:'strict'},{...permissions,mode:'adaptive'},{...permissions,merge:false},{...permissions,intersection:false}]){
    const r=constructD4Control('exact',p);assert.equal(r.reason,'permission');assert.equal(r.attempts,0);
  }
  assert.throws(()=>constructD4Control({},permissions),/Frozen D4/);
  assert.throws(()=>constructD4Control('exact',{...permissions,destruction:true}),/Explicit/);
});
