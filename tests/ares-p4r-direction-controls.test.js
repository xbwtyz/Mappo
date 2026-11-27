import test from 'node:test';
import assert from 'node:assert/strict';
import { P4R_BASELINE,probeP4RDirectional } from '../scripts/development/research/ares-p4r-research.mjs';
import { probeFreshRtreDirectional } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { G_OPTIONS } from '../scripts/development/research/ares-p4-g-run.mjs';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
test('R3B exact baseline remains preferred',async()=>{
  const p=P4R_BASELINE.find(r=>r.category==='baseline-valid');
  const r=await probeP4RDirectional(p.id,64);assert.equal(r.category,'baseline-valid');assert.equal(r.attempts,0);assert.equal(r.witness,null);assert.equal(r.audit.status,'geometry-verified');
});
test('R3B fixed boundary and fixed river constraints still refuse',async()=>{
  const p=P4R_BASELINE.find(r=>r.category==='preflight-refused');
  const r=await probeP4RDirectional(p.id,256);assert.equal(r.category,'preflight-refused');assert.equal(r.attempts,0);
  const river=await probeFreshRtreDirectional('mixed-river',G_OPTIONS,createSpatialDestructionBudget());assert.equal(river.termination,'fixed-selected-constraint');assert.equal(river.attempts,0);
});
test('R3B Strict and narrow scope remain closed',async()=>{
  const p=P4R_BASELINE.find(r=>r.category==='search-refused');
  for(const o of [{...G_OPTIONS,mode:'strict'},{...G_OPTIONS,maxObjects:1}]){
    const r=await probeFreshRtreDirectional('g:'+p.id,o,createSpatialPreservationBudget());assert.equal(r.attempts,0);assert.equal(r.adjustedWitness,null);
  }
});
test('R3B deterministic repeat apart from timing',async()=>{
  const id='linear-medium:quad:75:y',strip=({elapsedMs,auditMs,...r})=>r;
  assert.deepEqual(strip(await probeP4RDirectional(id,64)),strip(await probeP4RDirectional(id,64)));
});
