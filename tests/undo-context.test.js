import test from 'node:test';
import assert from 'node:assert/strict';
import { describeUndoContext } from '../src/core/undo-context.js';
const h = n => ({ mode: 'pan', history: Array(n).fill({}) });
test('undo follows active editing tool, then current workspace section', () => {
  const state = {
    section: 'districts', selection: { kind: 'district', id: 'D1' },
    outline: h(2), water: h(3), terrain: h(0), district: h(1), defense: h(4)
  };
  assert.equal(describeUndoContext(state).kind, 'district');
  assert.equal(describeUndoContext(state).controlId, 'undoDistrictButton');
  state.section = 'defenses';
  assert.equal(describeUndoContext(state).kind, 'defense');
  state.water.mode = 'river';
  assert.equal(describeUndoContext(state).kind, 'water', 'active shape tool wins over tab');
  state.water.mode = 'pan'; state.section = 'city';
  assert.equal(describeUndoContext(state).kind, 'outline');
});
test('landscape selection chooses water/mountains without stealing other histories', () => {
  const state = {
    section: 'landscape', outline: h(4), water: h(2), terrain: h(0),
    district: h(8), defense: h(3), selection: null
  };
  assert.equal(describeUndoContext(state).available, false);
  state.selection = { kind: 'terrain', id: 'T1' };
  assert.equal(describeUndoContext(state).kind, 'terrain');
  assert.equal(describeUndoContext(state).available, false);
  state.selection = { kind: 'water', id: 'W1' };
  assert.equal(describeUndoContext(state).available, true);
  assert.match(describeUndoContext(state).description, /2 available/);
});
test('an empty history does not offer an action', () => {
  const state = { section: 'districts', district: h(0), outline: h(10) };
  assert.equal(describeUndoContext(state).available, false);
  assert.equal(describeUndoContext(state).label, 'Undo district');
});
