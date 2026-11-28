import test from 'node:test';
import assert from 'node:assert/strict';
import { P4R_BASELINE,probeP4RBreadth } from '../scripts/development/research/ares-p4r-research.mjs';
import { probeFreshRtreBreadth } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { G_OPTIONS } from '../scripts/development/research/ares-p4-g-run.mjs';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
test('R3A exact baseline preferred without any neighbor changes',async()=>{
  const p=P4R_BASELINE.find(r=>r.category==='baseline-valid');
  const r=await probeP4RBreadth(p.id,64);assert.equal(r.category,'baseline-valid');assert.equal(r.attempts,0);assert.equal(r.witness,null);assert.equal(r.audit.status,'geometry-verified');
});
test('R3A boundary and fixed selected river constraints still refuse',async()=>{
  const p=P4R_BASELINE.find(r=>r.category==='preflight-refused');
  const r=await probeP4RBreadth(p.id,256);assert.equal(r.category,'preflight-refused');assert.equal(r.attempts,0);
  const river=await probeFreshRtreBreadth('mixed-river',G_OPTIONS,createSpatialDestructionBudget());assert.equal(river.termination,'fixed-selected-constraint');assert.equal(river.attempts,0);
});
test('R3A Strict cannot adjust neighbors and narrow scope remains closed',async()=>{
  const p=P4R_BASELINE.find(r=>r.category==='search-refused');
  const r=await probeFreshRtreBreadth('g:'+p.id,{...G_OPTIONS,mode:'strict'},createSpatialPreservationBudget());
  assert.equal(r.attempts,0);assert.equal(r.adjustedWitness,null);
  const narrow=await probeFreshRtreBreadth('g:'+p.id,{...G_OPTIONS,maxObjects:1},createSpatialPreservationBudget());
  assert.equal(narrow.attempts,0);assert.equal(narrow.adjustedWitness,null);
});
test('R3A repeated breadth search deterministic outside timing fields',async()=>{
  const id='linear-medium:quad:75:y',strip=({elapsedMs,auditMs,...r})=>r;
  assert.deepEqual(strip(await probeP4RBreadth(id,64)),strip(await probeP4RBreadth(id,64)));
});
