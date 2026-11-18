import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildFailureMessage, defenseInvalidField } from '../src/core/validation-feedback.js';
test('failed rebuild guidance describes atomicity while preserving error details', () => {
  const message = rebuildFailureMessage('The river crosses an invalid bank.');
  assert.match(message, /river crosses/);
  assert.match(message, /No city changes were applied/);
  assert.match(message, /last valid city/);
  assert.match(rebuildFailureMessage(null), /Review the unfinished draft/);
});
test('defense validation highlights only the relevant control', () => {
  assert.equal(defenseInvalidField('Tower spacing must be between 40 and 200'), 'towerSpacingInput');
  assert.equal(defenseInvalidField('Choose 1–8 gates'), 'gateCountInput');
  assert.equal(defenseInvalidField('Seed is invalid'), 'fortificationSeedInput');
  assert.equal(defenseInvalidField('Unknown error'), null);
});
