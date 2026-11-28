import test from 'node:test';
import assert from 'node:assert/strict';
import {X56_IDS,hybridGroups} from '../scripts/development/research/ares-p4x-hybrid.mjs';
import {X34_IDS} from '../scripts/development/research/ares-p4x-analytical.mjs';
import {runP4XHybrid} from '../scripts/development/research/ares-p4x-x56-run.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {G_MANIFEST} from '../scripts/development/research/ares-p4-g-corpus.mjs';
test('X56 frozen ten refusals and no wider authority',async()=>{
  assert.equal(X56_IDS.length,10);assert.equal(new Set(X56_IDS).size,10);
  assert.equal(X56_IDS.filter(id=>id.startsWith('radial')).length,7);
  for(const id of [...X34_IDS.filter(id=>!X56_IDS.includes(id)),'unknown'])await assert.rejects(()=>runP4XHybrid(id),/Unapproved/);
});
test('X56 connected groups may include real eligible connectors but not fixed nodes or a fifth neighbor',()=>{
  const graph={adjacency:new Map([['a',['b']],['b',['a','c']],['c',['b','d']],['d',['c','e']],['e',['d']]])};
  const rows=['a','b','c','d','e'].map(id=>({ref:{id}})),budget=()=>createSpatialPreservationBudget(G_MANIFEST.search.root);
  const tele=()=>({subsets:0,coveringGroups:0,connectedGroups:0,connectorGroups:0});
  const pairs=[{movable:['a']},{movable:['d']}];
  assert.deepEqual(hybridGroups(graph,rows,new Set(),pairs,budget(),tele()),[['a','b','c','d']]);
  assert.deepEqual(hybridGroups(graph,rows.filter(r=>r.ref.id!=='b'),new Set(),pairs,budget(),tele()),[]);
  assert.deepEqual(hybridGroups(graph,rows,new Set(),[{movable:['a']},{movable:['e']}],budget(),tele()),[]);
});
test('X56 deterministic replay with shared bounded root',async()=>{
  assert.deepEqual(await runP4XHybrid(X56_IDS[0]),await runP4XHybrid(X56_IDS[0]));
});
