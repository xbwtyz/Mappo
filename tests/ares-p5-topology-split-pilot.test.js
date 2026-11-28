import test from 'node:test';
import assert from 'node:assert/strict';
import {constructP5SplitPilot} from '../scripts/development/research/ares-p5-topology-observe.mjs';
const permissions={mode:'restructure',intersection:true,split:true,merge:false,overlap:false};
for(const [id,count] of [['g:radial-small:eight-loop:100:x',5],['g:linear-medium:eight-chain:100:diagonal',9]])test('P5 C1 detached graph construction '+id,async()=>{
  const r=await constructP5SplitPilot(id,permissions);
  console.log('ARES_P5_C1 '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.equal(r.independentlyVerified,false);
  assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);assert.ok(r.attempts<=1);
  assert.ok(['graph-candidate','preflight-refused','candidate-refused','work-limit'].includes(r.status));
  if(r.status==='graph-candidate'){
    assert.equal(r.attempts,1);assert.equal(r.witness.contacts.length,count);
    assert.equal(r.witness.reservedNodeIds.length,count);
    assert.equal(r.witness.reservedRoadIds.length,count*2);
    assert.equal(new Set([...r.witness.reservedNodeIds,...r.witness.reservedRoadIds]).size,count*3);
    assert.equal(r.witness.graph.components,1);
    for(const l of r.witness.lineage){
      assert.equal(l.children[0].id,l.parent);assert.equal(l.children[0].a,l.originalEndpoints[0]);assert.equal(l.children.at(-1).b,l.originalEndpoints[1]);
      for(let i=1;i<l.children.length;i++)assert.equal(l.children[i-1].b,l.children[i].a);
    }
    const replay=await constructP5SplitPilot(id,permissions);assert.deepEqual(replay,r);
  }else assert.ok(r.reason);
  for(const deny of [{...permissions,mode:'adaptive'},{...permissions,intersection:false},{...permissions,split:false}]){
    const blocked=await constructP5SplitPilot(id,deny);
    assert.equal(blocked.status,'preflight-refused');assert.equal(blocked.attempts,0);assert.equal(blocked.witness,undefined);
  }
});
test('P5 C1 rejects arbitrary project and unapproved case',async()=>{
  await assert.rejects(constructP5SplitPilot({},permissions),/Frozen P5 C1/);
  await assert.rejects(constructP5SplitPilot('g:radial-small:eight-loop:50:y',permissions),/Frozen P5 C1/);
});
