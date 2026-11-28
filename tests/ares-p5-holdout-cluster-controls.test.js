import test from 'node:test';
import assert from 'node:assert/strict';
import {measureContactCover,measureConnectedFour} from '../scripts/development/research/ares-p5-holdout-cover.mjs';
import {CLUSTER_CASES,diagnoseHoldoutCluster} from '../scripts/development/research/ares-p5-holdout-cluster-diagnostics.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const root=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
test('Exact cover distinguishes empty, blocked, shared and disjoint contacts',()=>{
 assert.equal(measureContactCover([],root()).minimum,0);
 assert.equal(measureContactCover([[]],root()).status,'no-endpoint-cover');
 assert.equal(measureContactCover([['a','b'],['b','c']],root()).minimum,1);
 assert.equal(measureContactCover([['a','b'],['c','d'],['e'],['f'],['g']],root()).minimum,5);
 // Triangle has packing bound 1 but exact minimum 2.
 assert.equal(measureContactCover([['a','b'],['b','c'],['a','c']],root()).minimum,2);
});
test('Connected cover counts connector nodes and refuses disconnected groups',()=>{
 const a=new Map([['a',['b']],['b',['a','c']],['c',['b']],['z',[]]]);
 assert.deepEqual(measureConnectedFour([['a'],['c']],a,root()).witness,['a','b','c']);
 assert.equal(measureConnectedFour([['a'],['z']],a,root()).status,'requires-more-than-four-or-disconnected');
});
test('Only unresolved holdout cases admitted',async()=>{
 assert.equal(CLUSTER_CASES.length,29);
 await assert.rejects(()=>diagnoseHoldoutCluster('h:radial-11'),/Only frozen unresolved/);
 await assert.rejects(()=>diagnoseHoldoutCluster({caseId:'h:radial-01'}),/Frozen holdout/);
});
