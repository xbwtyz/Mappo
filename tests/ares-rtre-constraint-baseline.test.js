import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFreshRtreConstraintBaseline } from '../scripts/development/research/ares-rtre-constraint-baseline.mjs';
import { materializeAresP3Case } from '../scripts/development/research/ares-p3-fixtures.mjs';
import { discoverAresLandscape } from '../src/core/ares-landscape-observation.js';
import { discoverAresDefense } from '../src/core/ares-defense-observation.js';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const options={mode:'adaptive',maxObjects:10000,maxHops:6};
const sortEvidence=rows=>[...rows].sort((a,b)=>{
  const key=r=>JSON.stringify([r.provider.id,r.query.refs[0].id,r.query.phase]);
  return key(a)<key(b)?-1:key(a)>key(b)?1:0;
});
test('RTRE segment evaluators reproduce P2 exact baseline mixed-small landscape and defense evidence',async()=>{
  const f=materializeAresP3Case('mixed-small'),a=await inspectFreshRtreConstraintBaseline('mixed-small',options,createSpatialPreservationBudget());
  const l=await discoverAresLandscape(f.project,f.context,createSpatialPreservationBudget()),
    d=await discoverAresDefense(f.project,f.context,createSpatialPreservationBudget());
  assert.ok(a.changedRoadRefs.length>0);
  assert.deepEqual(sortEvidence(a.landscape),sortEvidence(l.evidence));
  assert.deepEqual(sortEvidence(a.defense.map(x=>x.constraint)),sortEvidence(d.evidence.map(x=>x.constraint)));
  for(const row of a.defense){
    const other=d.evidence.find(e=>e.constraint.query.refs[0].id===row.constraint.query.refs[0].id&&e.constraint.query.phase===row.constraint.query.phase);
    assert.deepEqual(row.measurements,other.measurements);
  }
  assert.deepEqual(a,await inspectFreshRtreConstraintBaseline('mixed-small',options,createSpatialPreservationBudget()));
});
test('RTRE dry baseline has satisfied landscape and defense observations, not city verification',async()=>{
  const a=await inspectFreshRtreConstraintBaseline('dry-positive',options,createSpatialPreservationBudget());
  assert.equal(a.status,'final-observed-satisfied');assert.ok(a.changedRoadRefs.length>0);
  assert.ok(a.landscape.every(e=>e.summary==='observed-satisfied'));assert.ok(a.defense.every(e=>e.constraint.summary==='observed-satisfied'));
  assert.deepEqual(a.finalBlockers,[]);assert.deepEqual(a.sweptUnresolved,[]);
});
test('Exact mixed-river intent remains blocked by real landscape corridor evidence even with destruction permission',async()=>{
  const a=await inspectFreshRtreConstraintBaseline('mixed-river',options,createSpatialDestructionBudget());
  // Source may be preflight-refused if required incident closure is incomplete.
  // In either case never infer landscape clearance or allow geometry dispatch.
  if(a.status==='preflight-refused'){assert.equal(a.changedRoadRefs.length,0);return;}
  assert.equal(a.status,'final-blocked');
  assert.ok(a.finalBlockers.some(e=>e.provider.id==='ares-water'&&e.rows.some(r=>r.outcome==='violated')));
});
test('RTRE constraint research rejects imported cities, narrow scope and exhausted work',async()=>{
  const f=materializeAresP3Case('dry-positive');
  await assert.rejects(inspectFreshRtreConstraintBaseline(f.project,options,createSpatialPreservationBudget()),/recipe ID/);
  const n=await inspectFreshRtreConstraintBaseline('dry-positive',{...options,maxObjects:1},createSpatialPreservationBudget());
  assert.equal(n.status,'preflight-refused');assert.equal(n.changedRoadRefs.length,0);
  await assert.rejects(inspectFreshRtreConstraintBaseline('dry-positive',options,createSpatialPreservationBudget({work:1,stateExpansions:1})),/budget/);
});
