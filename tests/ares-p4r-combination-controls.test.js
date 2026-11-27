import test from 'node:test';
import assert from 'node:assert/strict';
import { P4R_BASELINE,P4R_COMBINATIONS,probeP4RCombination } from '../scripts/development/research/ares-p4r-research.mjs';
import { probeFreshRtreBreadthDirectional,probeFreshRtreDirectionalFallback } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { G_OPTIONS } from '../scripts/development/research/ares-p4-g-run.mjs';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
import { readFileSync } from 'node:fs';
const matrix=JSON.parse(readFileSync(new URL('./fixtures/ares-p4r-combination-matrix.json',import.meta.url),'utf8'));
test('R4C-A frozen 50 case denominator and bounded strategies',async()=>{
  const ids=Object.values(matrix.groups).flat();
  assert.equal(ids.length,50);assert.equal(new Set(ids).size,50);
  assert.deepEqual(ids.sort(),P4R_BASELINE.filter(r=>r.category==='search-refused').map(r=>r.id).sort());
  assert.deepEqual(matrix.strategies,P4R_COMBINATIONS);assert.deepEqual(matrix.caps,[64,128,256]);
  await assert.rejects(()=>probeP4RCombination(ids[0],64,'unknown'),/Unapproved/);
});
test('R4C-A both combinations prefer exact valid baseline and refuse boundary escape',async()=>{
  for(const kind of P4R_COMBINATIONS){
    const base=await probeP4RCombination(P4R_BASELINE.find(r=>r.category==='baseline-valid').id,64,kind);
    assert.equal(base.category,'baseline-valid');assert.equal(base.attempts,0);assert.equal(base.witness,null);assert.equal(base.audit.status,'geometry-verified');
    const boundary=await probeP4RCombination(P4R_BASELINE.find(r=>r.category==='preflight-refused').id,256,kind);
    assert.equal(boundary.category,'preflight-refused');assert.equal(boundary.attempts,0);
  }
});
test('R4C-A no bypass of fixed river, Strict or narrow scope',async()=>{
  for(const probe of [probeFreshRtreBreadthDirectional,probeFreshRtreDirectionalFallback]){
    const river=await probe('mixed-river',G_OPTIONS,createSpatialDestructionBudget());
    assert.equal(river.termination,'fixed-selected-constraint');assert.equal(river.attempts,0);
    for(const o of [{...G_OPTIONS,mode:'strict'},{...G_OPTIONS,maxObjects:1}]){
      const r=await probe('g:'+matrix.groups['linear-medium:quad'][0],o,createSpatialPreservationBudget());
      assert.equal(r.attempts,0);assert.equal(r.adjustedWitness,null);
    }
  }
});
test('R4C-A deterministic replay apart from timing',async()=>{
  const strip=({elapsedMs,auditMs,...r})=>r;
  for(const kind of P4R_COMBINATIONS){
    const id='linear-medium:quad:75:y';
    assert.deepEqual(strip(await probeP4RCombination(id,128,kind)),strip(await probeP4RCombination(id,128,kind)));
  }
});
