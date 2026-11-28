import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectP5IdentityLedger} from '../scripts/development/research/ares-p5-topology-lineage.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const n=(id,x,y)=>({id,x,y}),e=(id,a,b)=>({id,a,b,kind:'lane'});
const original={nodes:[n('A',0,0),n('B',2,0),n('C',1,-1),n('D',1,1)],roads:[e('R1','A','B'),e('R2','C','D')]};
const candidate={nodes:[...original.nodes,n('J',1,0)],roads:[e('R1','A','J'),e('S1','J','B'),e('R2','C','J'),e('S2','J','D')]};
const splitChains=[{parent:'R1',children:['R1','S1']},{parent:'R2',children:['R2','S2']}];
const run=x=>inspectP5IdentityLedger(x,createSpatialPreservationBudget({work:8000000,stateExpansions:32768}));
test('P5 E/F split ledger is complete, typed, and rejects missing or reused identities',()=>{
  const input={kind:'split',original,candidate,splitChains};
  const r=run(input);assert.equal(r.status,'complete');assert.deepEqual(r.nodes.created,['J']);assert.deepEqual(r.roads.created,['S1','S2']);
  assert.equal(run({...input,candidate:{...candidate,roads:candidate.roads.filter(e=>e.id!=='R1')}}).reason,'road-retirement-held');
  assert.equal(run({...input,splitChains:[splitChains[0]]}).reason,'unclaimed-new-road');
  assert.equal(run({...input,splitChains:[...splitChains,splitChains[0]]}).reason,'split-parent');
  assert.equal(run({...input,candidate:{...candidate,roads:[...candidate.roads,e('S1','B','D')]}}).reason,'duplicate-or-invalid-identity');
  assert.equal(run({...input,candidate:{...candidate,nodes:[...candidate.nodes,n('S1',0,1)]}}).reason,'reservation-collision');
  assert.equal(run({...input,kind:'overlap'}).reason,'unsupported-operation');
});
test('P5 E/F merge ledger cannot retire a road, invent a node or misdirect an alias',()=>{
  const old={nodes:[n('A',0,0),n('B',2,0),n('C',1,1)],roads:[e('R1','A','C')]};
  const next={nodes:[n('B',0,0),n('C',1,1)],roads:[e('R1','B','C')]};
  const alias={retired:'A',survives:'B',point:{x:0,y:0}},input={kind:'synthetic-merge',original:old,candidate:next,junctionAliases:[alias]};
  assert.equal(run(input).status,'complete');
  assert.equal(run({...input,junctionAliases:[{...alias,survives:'C'}]}).reason,'merge-alias');
  assert.equal(run({...input,candidate:{...next,roads:[]}}).reason,'road-retirement-held');
  assert.equal(run({...input,candidate:{...next,nodes:[...next.nodes,n('NEW',3,3)]}}).reason,'merge-inventory');
});
