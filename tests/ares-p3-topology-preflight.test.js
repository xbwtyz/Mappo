import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { inspectAresP3Topology } from '../scripts/development/research/ares-p3-topology-preflight.mjs';
import { createSpatialDestructionBudget, createSpatialPreservationBudget } from '../src/core/spatial-recovery-contract.js';
import { aresReplayJson } from '../src/core/ares-diagnostic-replay.js';
test('P3 topology preflight reports real typed river blockers and preserves the source',()=>{
  const f=materializeAresP3Case('mixed-river'),before=aresReplayJson(f.project),b=createSpatialDestructionBudget();
  const a=inspectAresP3Topology(f.project,f.context,b);
  assert.equal(a.status,'preflight-refused');
  assert.ok(a.diagnostics.some(d=>['domain-violation','protected-content','unsupported-capability'].includes(d.reason)));
  assert.deepEqual(a,inspectAresP3Topology(f.project,f.context,createSpatialDestructionBudget()));
  assert.equal(aresReplayJson(f.project),before);
  assert.ok(b.snapshot().work>0);
});
test('P3 preflight permits qualified dry control and propagates insufficient work and stale identity',()=>{
  const f=materializeAresP3Case('dry-positive');
  assert.equal(inspectAresP3Topology(f.project,f.context,createSpatialPreservationBudget()).status,'eligible');
  assert.throws(()=>inspectAresP3Topology(f.project,f.context,createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
  const stale={...f.context,operation:{...f.context.operation,projectId:'wrong'}};
  assert.throws(()=>inspectAresP3Topology(f.project,stale,createSpatialPreservationBudget()),/identity/);
});
