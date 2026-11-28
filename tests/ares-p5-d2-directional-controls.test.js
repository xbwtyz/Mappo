import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectP5OverlapInterval} from '../scripts/development/research/ares-p5-topology-d2.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const p=(x,y)=>({x,y});
test('P5 D2B contained interval in either query direction',()=>{
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
  const inner=[p(2,0),p(8,0)],outer=[p(0,0),p(10,0)];
  const f=inspectP5OverlapInterval(...inner,...outer,b),r=inspectP5OverlapInterval(...outer,...inner,b);
  assert.equal(f.relation,'contained-span');assert.equal(r.relation,'contained-span');
  assert.equal(f.length,6);assert.ok(Math.abs(r.length-6)<1e-9);
  assert.deepEqual(f.directionalCuts.forward,[]);assert.equal(f.directionalCuts.reverse.length,2);
  assert.equal(f.legacyForwardMiss,true);assert.equal(r.legacyForwardMiss,false);
  assert.equal(f.exact,true);assert.equal(r.exact,true);
});
test('P5 D2B directional checks do not normalize separated, touching or crossing roads',()=>{
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
  const a=p(0,0),c=p(10,0);
  for(const [x,y] of [[p(11,0),p(20,0)],[p(10,0),p(20,0)],[p(2,1),p(8,1)],[p(5,-1),p(5,1)]])
    assert.equal(inspectP5OverlapInterval(a,c,x,y,b),null);
  const partial=inspectP5OverlapInterval(a,c,p(5,0),p(15,0),b);
  assert.equal(partial.relation,'partial-span');assert.equal(partial.length,5);
  assert.equal(inspectP5OverlapInterval(a,c,c,a,b).relation,'duplicate-span');
  assert.ok(b.snapshot().work>0);
});
