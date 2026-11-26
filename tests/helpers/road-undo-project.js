import assert from 'node:assert/strict';

// Compare serialized snapshots across Node and browser realms. Undo must
// restore all pre-edit root fields and city data, except for the allocator,
// which must remain exactly at the accepted post-edit high-water state.
export function assertRoadUndoProject(restoredJSON, beforeJSON, acceptedJSON) {
  const restored=JSON.parse(restoredJSON);
  const expected=JSON.parse(beforeJSON);
  const accepted=JSON.parse(acceptedJSON);
  for (const [label,project] of [['before',expected],['accepted',accepted],['restored',restored]]) {
    assert.ok(Object.hasOwn(project,'identityAllocation'),label+' snapshot must include allocator metadata');
  }
  assert.deepEqual(restored.identityAllocation,accepted.identityAllocation,
    'Undo must retain the exact committed allocator state');
  expected.identityAllocation=accepted.identityAllocation;
  assert.deepEqual(Object.keys(restored),Object.keys(expected),'Undo must preserve all project root keys and order');
  for (const key of Object.keys(expected)) {
    assert.deepEqual(restored[key],expected[key],'Undo must restore the exact project field: '+key);
  }
  // Preserve the original byte-for-byte JSON comparison, with only the
  // explicitly approved allocator expectation substituted.
  assert.equal(restoredJSON,JSON.stringify(expected),'Undo must restore the complete serialized project except committed allocator marks');
}
