import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P4R_BASELINE,probeP4RAdaptivePortfolio } from '../scripts/development/research/ares-p4r-research.mjs';
import { probeFreshRtreAdaptivePortfolio } from '../scripts/development/research/ares-rtre-single-junction.mjs';
import { G_OPTIONS } from '../scripts/development/research/ares-p4-g-run.mjs';
import { createSpatialPreservationBudget,createSpatialDestructionBudget } from '../src/core/spatial-recovery-contract.js';
const matrix=JSON.parse(readFileSync(new URL('./fixtures/ares-p4r-spatial-matrix.json',import.meta.url),'utf8'));
const id='organic-large:eight-chain:100:diagonal';
test('R4C-C denominator and fixed scope',async()=>{
  const ids=Object.values(matrix.groups).flat();
  assert.equal(ids.length,50);assert.equal(new Set(ids).size,50);
  assert.deepEqual(ids.sort(),P4R_BASELINE.filter(r=>r.category==='search-refused').map(r=>r.id).sort());
  for(const h of [5,8,12])await assert.rejects(()=>probeP4RAdaptivePortfolio(id,h),/Unapproved/);
  await assert.rejects(()=>probeP4RAdaptivePortfolio('unknown',10),/Unknown/);
});
test('R4C-C fixed boundary, river, Strict and baseline controls',async()=>{
  const o={...G_OPTIONS,maxCandidates:256,maxHops:10},probe=probeFreshRtreAdaptivePortfolio;
  const boundary=P4R_BASELINE.find(r=>r.category==='preflight-refused').id;
  const valid=P4R_BASELINE.find(r=>r.category==='baseline-valid').id;
  const b=await probe('g:'+boundary,o,createSpatialPreservationBudget());assert.equal(b.status,'preflight-refused');assert.equal(b.attempts,0);
  const r=await probe('mixed-river',o,createSpatialDestructionBudget());assert.equal(r.termination,'fixed-selected-constraint');assert.equal(r.attempts,0);
  const s=await probe('g:'+id,{...o,mode:'strict'},createSpatialPreservationBudget());assert.equal(s.attempts,0);assert.equal(s.adjustedWitness,null);
  const v=await probe('g:'+valid,o,createSpatialPreservationBudget());assert.equal(v.status,'baseline-valid');assert.equal(v.attempts,0);assert.equal(v.adjustedWitness,null);
});
test('R4C-C repeatable shared portfolio on stubborn case',async()=>{
  const strip=({elapsedMs,auditMs,...r})=>r;
  const a=await probeP4RAdaptivePortfolio(id,10),b=await probeP4RAdaptivePortfolio(id,10);
  assert.deepEqual(strip(a),strip(b));
  assert.ok(a.portfolio.attempted.breadth>0);assert.ok(a.portfolio.attempted.directional>0);
  assert.ok(a.portfolio.switches>0);
});
