import test from 'node:test';
import assert from 'node:assert/strict';
import {constructP5HoldoutSplit} from '../scripts/development/research/ares-p5-topology-observe.mjs';
import {auditP5HoldoutSplit} from '../scripts/development/research/ares-p5-topology-audit.mjs';
import {HOLDOUT_SPLIT_PERMISSIONS} from '../scripts/development/research/ares-p5-holdout-lock.mjs';
test('Holdout topology fixed permission and recipe restrictions',async()=>{
  assert.deepEqual(HOLDOUT_SPLIT_PERMISSIONS,{mode:'restructure',intersection:true,split:true,merge:false,overlap:false});
  assert.ok(Object.isFrozen(HOLDOUT_SPLIT_PERMISSIONS));
  await assert.rejects(constructP5HoldoutSplit('h:unknown'),/Frozen holdout/);
  await assert.rejects(constructP5HoldoutSplit('g:radial-small:eight-loop:100:x'),/Frozen holdout/);
  await assert.rejects(auditP5HoldoutSplit('h:unknown',{}),/Frozen holdout/);
  await assert.rejects(auditP5HoldoutSplit('g:radial-small:eight-loop:100:x',{}),/Frozen holdout/);
});
