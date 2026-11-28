import test from 'node:test';
import assert from 'node:assert/strict';
import {measureConnectedMinimum,cyclicTargets} from '../scripts/development/research/ares-p5-holdout-cyclic.mjs';
import {searchHoldoutCyclicSeeds} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const root=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
test('Minimum connected cover counts otherwise unused connectors without movement authority',()=>{
 const adj=new Map([['a',['b']],['b',['a','c']],['c',['b','d']],['d',['c','e']],['e',['d']],['z',[]]]);
 const r=measureConnectedMinimum([['a'],['e']],adj,root());
 assert.equal(r.status,'exact');assert.equal(r.minimum,5);assert.deepEqual(r.witness,['a','b','c','d','e']);
 assert.equal(measureConnectedMinimum([['a'],['z']],adj,root()).status,'no-connected-cover');
 assert.equal(measureConnectedMinimum([[]],adj,root()).status,'no-endpoint-cover');
});
test('Cyclic slots accept wrapped angular order even when pairwise orientation differs',()=>{
 const prior=['a','b','c','d'],actual=[{rid:'c',angle:-2.9},{rid:'d',angle:-2.8},{rid:'a',angle:-2.7},{rid:'b',angle:2.8}];
 assert.ok(cyclicTargets(prior,actual,root()).every(t=>Math.abs(t.delta)<1e-12));
 const swapped=actual.map(x=>({...x,rid:x.rid==='a'?'b':x.rid==='b'?'a':x.rid}));
 assert.ok(cyclicTargets(prior,swapped,root()).some(t=>Math.abs(t.delta)>1e-6));
});
test('Cyclic research refuses unapproved cases',async()=>{await assert.rejects(()=>searchHoldoutCyclicSeeds('h:radial-01'),/Frozen combined/);});
