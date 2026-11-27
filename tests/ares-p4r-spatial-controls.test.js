import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P4R_BASELINE,probeP4RSpatial } from '../scripts/development/research/ares-p4r-research.mjs';
import { observeR4SpatialScope } from '../scripts/development/research/ares-p4r-scope-observation.mjs';
import { SPATIAL_HOPS,SPATIAL_STRATEGIES } from '../scripts/development/research/ares-p4r-register-spatial-tests.mjs';
import { probeFreshRtreFirstValid,probeFreshRtreBreadth } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { G_OPTIONS } from '../scripts/development/research/ares-p4-g-run.mjs';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const matrix=JSON.parse(readFileSync(new URL('./fixtures/ares-p4r-spatial-matrix.json',import.meta.url),'utf8'));
const id='linear-medium:quad:75:y';
test('R4C-B frozen 50 case denominator and hard bounds',async()=>{
  const ids=Object.values(matrix.groups).flat();
  assert.equal(ids.length,50);assert.equal(new Set(ids).size,50);
  assert.deepEqual(ids.sort(),P4R_BASELINE.filter(r=>r.category==='search-refused').map(r=>r.id).sort());
  assert.deepEqual(matrix.hops,SPATIAL_HOPS);assert.deepEqual(matrix.strategies,SPATIAL_STRATEGIES);
  for(const h of [5,12]){await assert.rejects(()=>probeP4RSpatial(id,h,'original'),/Unapproved/);await assert.rejects(()=>observeR4SpatialScope(id,h),/Unapproved/);}
  await assert.rejects(()=>probeP4RSpatial('unknown',10,'original'),/Unknown/);
  await assert.rejects(()=>probeP4RSpatial(id,10,'unknown'),/Unapproved/);
});
test('R4C-B wider observation never grants fixed boundary, river or Strict authority',async()=>{
  const boundary=P4R_BASELINE.find(r=>r.category==='preflight-refused').id;
  const valid=P4R_BASELINE.find(r=>r.category==='baseline-valid').id;
  for(const probe of [probeFreshRtreFirstValid,probeFreshRtreBreadth]){
    const o={...G_OPTIONS,maxCandidates:256,maxHops:10};
    const b=await probe('g:'+boundary,o,createSpatialPreservationBudget());assert.equal(b.status,'preflight-refused');assert.equal(b.attempts,0);
    const r=await probe('mixed-river',o,createSpatialDestructionBudget());assert.equal(r.termination,'fixed-selected-constraint');assert.equal(r.attempts,0);
    const s=await probe('g:'+id,{...o,mode:'strict'},createSpatialPreservationBudget());assert.equal(s.attempts,0);assert.equal(s.adjustedWitness,null);
    const v=await probe('g:'+valid,o,createSpatialPreservationBudget());assert.equal(v.status,'baseline-valid');assert.equal(v.attempts,0);assert.equal(v.adjustedWitness,null);
  }
});
test('R4C-B deterministic replay at widened scope',async()=>{
  const strip=({elapsedMs,auditMs,...r})=>r;
  for(const kind of SPATIAL_STRATEGIES)assert.deepEqual(strip(await probeP4RSpatial(id,10,kind)),strip(await probeP4RSpatial(id,10,kind)));
});
