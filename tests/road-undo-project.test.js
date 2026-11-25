import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRoadUndoProject } from './helpers/road-undo-project.js';

const ns='0123456789abcdef0123456789abcdef';
const allocation=n=>({version:1,namespaces:n?{[ns]:{building:n}}:{}});
const baseline={schemaVersion:11,identityAllocation:allocation(0),city:{nodes:[{id:'N-1',x:1,y:2}]},custom:{value:'preserved'}};
const accepted={...baseline,identityAllocation:allocation(1),city:{nodes:[{id:'N-1',x:2,y:2}]}};
const restored={...baseline,identityAllocation:accepted.identityAllocation};
const check=value=>assertRoadUndoProject(JSON.stringify(value),JSON.stringify(baseline),JSON.stringify(accepted));

test('Road replay comparison permits only the exact committed allocator metadata',()=>{
  check(restored);
  assert.throws(()=>check(baseline),/exact committed allocator/);
  assert.throws(()=>check({...restored,identityAllocation:allocation(2)}),/exact committed allocator/);
});
test('Road replay comparison refuses changed geometry, metadata or root membership',()=>{
  assert.throws(()=>check(accepted),/exact project field: city/);
  assert.throws(()=>check({...restored,custom:{value:'changed'}}),/exact project field: custom/);
  assert.throws(()=>check({...restored,extra:true}),/root keys/);
  const {custom,...missing}=restored;
  assert.throws(()=>check(missing),/root keys/);
  const {identityAllocation,...missingAllocator}=restored;
  assert.throws(()=>check(missingAllocator),/include allocator metadata/);
});
