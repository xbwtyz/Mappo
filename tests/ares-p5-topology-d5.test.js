import test from 'node:test';
import assert from 'node:assert/strict';
import {D4_IDS,constructD4Control} from '../scripts/development/research/ares-p5-topology-d4.mjs';
import {auditD4Control} from '../scripts/development/research/ares-p5-topology-d5.mjs';
const p={mode:'restructure',intersection:true,split:false,merge:true,overlap:false};
const reasons={near:'not-exact-coincidence',protected:'protected-road',unknown:'unknown-authorship',opaque:'opaque-node',collapse:'would-collapse-road',duplicate:'would-duplicate-edge',dependency:'external-dependency',scope:'outside-scope'};
for(const id of D4_IDS)test('P5 D5 independent synthetic audit '+id,()=>{
  const c=constructD4Control(id,p),r=auditD4Control(id,p,c);
  console.log('ARES_P5_EF_MERGE '+JSON.stringify(r));
  assert.equal(r.source,c.source);assert.equal(r.authority,'none');assert.equal(r.cityRecovery,false);assert.ok(r.stats.work<=8000000);assert.equal(r.stats.expansions,0);
  if(reasons[id]){
    assert.equal(r.status,'rejected');assert.equal(r.reason,reasons[id]);
  }else{
    assert.equal(r.status,'graph-control-verified');assert.equal(r.retainedRoads,7);assert.equal(r.retiredJunctions,1);
    const l=r.identityLedger;assert.equal(l.status,'complete');assert.equal(l.kind,'synthetic-merge');assert.deepEqual(l.roads.retired,[]);
    assert.deepEqual(l.nodes.retired,[c.witness.junctionLineage.retired]);assert.deepEqual(l.nodes.created,[]);assert.deepEqual(l.roads.created,[]);
    assert.deepEqual(l.junctionAliases,[c.witness.junctionLineage]);assert.deepEqual(l.redirectedRoadIds,c.witness.roadLineage.map(x=>x.roadId).sort());
    const denied=auditD4Control(id,{...p,merge:false},c);assert.equal(denied.reason,'permission');
    for(const mutate of [w=>w.junctionLineage.survives=w.junctionLineage.retired,w=>w.roadLineage.pop(),w=>w.retainedRoadIds.pop(),w=>w.intent.point.x+=1]){
      const fake=structuredClone(c);mutate(fake.witness);assert.equal(auditD4Control(id,p,fake).reason,'witness-lineage');
    }
    const foreign=structuredClone(c);foreign.source='0'.repeat(64);assert.equal(auditD4Control(id,p,foreign).reason,'witness-source');
  }
});
