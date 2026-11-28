import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseHoldoutConstraints} from '../scripts/development/research/ares-p5-holdout-constraint-diagnostics.mjs';
test('Holdout constraints refuse non-holdout and caller projects',async()=>{
  await assert.rejects(()=>diagnoseHoldoutConstraints('g:radial-small:eight-loop:100:x'),/Frozen holdout/);
  await assert.rejects(()=>diagnoseHoldoutConstraints({caseId:'h:radial-01'}),/Frozen holdout/);
  await assert.rejects(()=>diagnoseHoldoutConstraints('h:radial-26'),/Frozen holdout/);
});
