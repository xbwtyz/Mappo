import test from 'node:test';
import assert from 'node:assert/strict';
import {RADIAL_IDS,radialRecipe,radialOptions} from '../scripts/development/research/ares-p4x-radial-scope.mjs';
import {runP4XRadial} from '../scripts/development/research/ares-p4x-radial-run.mjs';
import {X7_IDS} from '../scripts/development/research/ares-p4x-x7-scope.mjs';
import {X56_IDS} from '../scripts/development/research/ares-p4x-hybrid.mjs';
import {runP4XX7} from '../scripts/development/research/ares-p4x-x7-run.mjs';
import {runP4XHybrid} from '../scripts/development/research/ares-p4x-x56-run.mjs';
import {probeFreshRtreRadial} from '../scripts/development/research/ares-rtre-single-junction.mjs';
import {verifyFreshRtreRadialWitness} from '../scripts/development/research/ares-rtre-verify.mjs';
import {G_MANIFEST} from '../scripts/development/research/ares-p4-g-corpus.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const root=()=>createSpatialPreservationBudget(G_MANIFEST.search.root);
test('radial scope freezes eight refusals and existing per-case caps',async()=>{
  assert.equal(RADIAL_IDS.length,8);assert.equal(new Set(RADIAL_IDS).size,8);
  assert.deepEqual(RADIAL_IDS.map(id=>radialOptions('g:'+id).maxNeighbors),[4,4,4,5,6,6,7,10]);
  for(const id of RADIAL_IDS){const r=radialOptions('g:'+id);assert.equal(r.maxCandidates,256);assert.equal(r.maxHops,6);assert.equal(r.maxObjects,10000);assert.equal(r.mode,'adaptive');}
  for(const id of [...new Set([...X7_IDS,...X56_IDS])].filter(id=>!RADIAL_IDS.includes(id)))await assert.rejects(()=>runP4XRadial(id),/Unapproved/);
  await assert.rejects(()=>probeFreshRtreRadial('g:unknown',root()),/Unapproved/);
  await assert.rejects(()=>verifyFreshRtreRadialWitness('g:unknown',{},root()),/Unapproved/);
});
test('radial search is deterministic on fresh fixture',async()=>assert.deepEqual(await runP4XRadial(RADIAL_IDS[0]),await runP4XRadial(RADIAL_IDS[0])));
test('radial audit rejects altered cap',async()=>{
  const id='g:'+RADIAL_IDS[0],e=await probeFreshRtreRadial(id,root());
  const a=await verifyFreshRtreRadialWitness(id,{...e,maxNeighbors:10},createSpatialPreservationBudget(G_MANIFEST.audit.root));
  assert.equal(a.status,'rejected');assert.equal(a.reason,'evidence-mismatch');
});
test('previous X56 and X7 recovered witnesses still verify',async()=>{
  for(const r of [await runP4XHybrid('linear-medium:eight-loop:75:y'),await runP4XX7('planned-medium:eight-chain:100:y')]){
    assert.equal(r.category,'geometry-recovered');assert.equal(r.audit.status,'geometry-verified');
  }
});
