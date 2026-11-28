import test from 'node:test';
import assert from 'node:assert/strict';
import {X7_SCOPE,X7_IDS,x7Recipe,x7Options,x7Groups} from '../scripts/development/research/ares-p4x-x7-scope.mjs';
import {X34_IDS,X34_COVER} from '../scripts/development/research/ares-p4x-analytical.mjs';
import {X56_IDS} from '../scripts/development/research/ares-p4x-hybrid.mjs';
import {runP4XX7} from '../scripts/development/research/ares-p4x-x7-run.mjs';
import {runP4XHybrid} from '../scripts/development/research/ares-p4x-x56-run.mjs';
import {runP4XAnalytical} from '../scripts/development/research/ares-p4x-x34-run.mjs';
import {probeFreshRtreX7,probeFreshRtreHybrid,probeFreshRtreAnalytical} from '../scripts/development/research/ares-rtre-single-junction.mjs';
import {verifyFreshRtreX7Witness} from '../scripts/development/research/ares-rtre-verify.mjs';
import {R5_OPTIONS} from '../scripts/development/research/ares-p4-g-run.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {G_MANIFEST} from '../scripts/development/research/ares-p4-g-corpus.mjs';
const root=()=>createSpatialPreservationBudget(G_MANIFEST.search.root);
test('X7 exact frozen per-case authority and previous arm caps',async()=>{
  assert.deepEqual([...X7_IDS].sort(),X34_COVER.rows.filter(r=>r.min>4||['radial-small:five-chain:50:y','radial-small:five-branch:75:diagonal'].includes(r.id)).map(r=>r.id).sort());
  for(const r of X7_SCOPE.rows){assert.equal(x7Options('g:'+r.id).maxNeighbors,r.minimum);assert.equal(x7Options('g:'+r.id).maxCandidates,256);}
  for(const id of X34_IDS.filter(id=>!X7_IDS.includes(id)))await assert.rejects(()=>runP4XX7(id),/Unapproved/);
  await assert.rejects(()=>probeFreshRtreX7('g:unknown',root()),/Unapproved/);
  await assert.rejects(()=>verifyFreshRtreX7Witness('g:unknown',{},root()),/Unapproved/);
  await assert.rejects(()=>probeFreshRtreHybrid('g:'+X56_IDS[0],{...R5_OPTIONS,maxNeighbors:5},root()),/Unapproved/);
  await assert.rejects(()=>probeFreshRtreAnalytical('g:'+X34_IDS[0],{...R5_OPTIONS,maxNeighbors:5},root()),/Unapproved/);
});
test('X7 fresh scope rejects missing connector or incorrect minimum seed',()=>{
  const ids=['a','b','c','d','e','f'],graph={adjacency:new Map(ids.map((id,i)=>[id,[ids[i-1],ids[i+1]].filter(Boolean)]))};
  const rows=ids.map(id=>({ref:{id}})),pairs=[{movable:['a']},{movable:['e']}],recipe={minimum:5,witness:ids.slice(0,5)};
  const tele=()=>({subsets:0,coveringGroups:0,connectedGroups:0,connectorGroups:0});
  assert.deepEqual(x7Groups(graph,rows,new Set(),pairs,root(),tele(),recipe),[ids.slice(0,5)]);
  assert.throws(()=>x7Groups(graph,rows.filter(r=>r.ref.id!=='c'),new Set(),pairs,root(),tele(),recipe),/no longer matches/);
  assert.throws(()=>x7Groups(graph,rows,new Set(),pairs,root(),tele(),{minimum:5,witness:['a','b','c','e','f']}),/no longer matches/);
});
test('X7 deterministic fresh search',async()=>assert.deepEqual(await runP4XX7(X7_IDS[0]),await runP4XX7(X7_IDS[0])));
test('X34 and X56 historical known recovered controls remain independently verified at cap4',async()=>{
  const a=await runP4XAnalytical('organic-large:quad:100:y'),b=await runP4XHybrid('linear-medium:eight-loop:75:y');
  for(const r of [a,b]){assert.equal(r.category,'geometry-recovered');assert.equal(r.audit.status,'geometry-verified');assert.ok(r.witness.neighbors.length<=4);}
});
test('X7 verifier rejects evidence carrying a different case allowance',async()=>{
  const id='g:'+X7_IDS[0],evidence=await probeFreshRtreX7(id,root());
  const result=await verifyFreshRtreX7Witness(id,{...evidence,maxNeighbors:10},createSpatialPreservationBudget(G_MANIFEST.audit.root));
  assert.equal(result.status,'rejected');assert.equal(result.reason,'evidence-mismatch');
});
