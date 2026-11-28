import test from 'node:test';
import assert from 'node:assert/strict';
import {constructP5CombinedPilot} from '../scripts/development/research/ares-p5-topology-observe.mjs';
import {auditP5CombinedPilot} from '../scripts/development/research/ares-p5-topology-audit.mjs';
import {g2Seed,G2_CASES} from '../scripts/development/research/ares-p5-topology-g2-lock.mjs';
const permissions={mode:'restructure',intersection:true,split:true,merge:false,overlap:false};
for(const id of Object.keys(G2_CASES))test('P5 G2 combined detached pilot '+id,async()=>{
  const {recipe,seed}=g2Seed(id),c=await constructP5CombinedPilot(id,permissions);
  assert.equal(c.source,recipe.source);assert.equal(c.authority,'none');assert.equal(c.independentlyVerified,false);
  assert.ok(c.stats.work<=8000000);assert.ok(c.stats.expansions<=32768);assert.ok(c.attempts<=1);
  if(c.status!=='graph-candidate'){
    console.log('ARES_P5_G2 '+JSON.stringify({caseId:id,arm:seed.arm,construction:c,audit:null}));
    assert.ok(['preflight-refused','candidate-refused','work-limit'].includes(c.status));assert.ok(c.reason);return;
  }
  assert.equal(c.attempts,1);assert.deepEqual(c.witness.neighbors,seed.best.neighbors);
  assert.equal(c.witness.contacts.length,seed.best.pairs.length);
  const r=await auditP5CombinedPilot(id,permissions,c);
  console.log('ARES_P5_G2 '+JSON.stringify({caseId:id,arm:seed.arm,construction:c,audit:r}));
  assert.equal(r.source,c.source);assert.equal(r.authority,'none');assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
  assert.ok(['topology-final-verified','rejected','unverified'].includes(r.status));
  if(r.status==='topology-final-verified'){
    assert.equal(r.contacts,seed.best.pairs.length);assert.equal(r.identityLedger.status,'complete');
    assert.deepEqual(r.identityLedger.roads.retired,[]);assert.deepEqual(r.identityLedger.nodes.retired,[]);
    assert.deepEqual(r.finalBlockers,[]);assert.ok(r.finalChecks>=3*c.witness.translatedRoadIds.length);
    assert.equal(r.sweptChecks,3*c.witness.translatedRoadIds.length);
  }else assert.ok(r.reason);
  const wrong=structuredClone(c);wrong.witness.neighbors[0].point.x+=1;
  assert.equal((await auditP5CombinedPilot(id,permissions,wrong)).reason,'seed-evidence');
  const altered=structuredClone(c);altered.witness.requested[0].point.y+=1;
  assert.equal((await auditP5CombinedPilot(id,permissions,altered)).reason,'exact-intent');
  const denied=await auditP5CombinedPilot(id,{...permissions,split:false},c);
  assert.equal(denied.reason,'permission');
});
test('P5 G2 rejects held recipes and unauthorized modes before construction',async()=>{
  await assert.rejects(constructP5CombinedPilot('g:radial-small:eight-loop:50:y',permissions),/Frozen P5 G2 case/);
  await assert.rejects(auditP5CombinedPilot('g:unapproved',permissions,{}),/Frozen P5 G2 case/);
  const c=await constructP5CombinedPilot(Object.keys(G2_CASES)[0],{...permissions,mode:'adaptive'});
  assert.equal(c.reason,'permission');assert.equal(c.attempts,0);
});
