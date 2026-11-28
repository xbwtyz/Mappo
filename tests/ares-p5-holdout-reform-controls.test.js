import test from 'node:test';
import assert from 'node:assert/strict';
import {COMBINED_CASES,REFORM_ARMS,searchHoldoutNumericalReform} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
import {rotationCoverGroups,reformRotationCoverGroups} from '../scripts/development/research/ares-p5-holdout-rotation.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const budget=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
test('Only six fixed arms and eleven frozen cases',async()=>{
 assert.equal(COMBINED_CASES.length,11);assert.equal(REFORM_ARMS.length,6);
 await assert.rejects(()=>searchHoldoutNumericalReform('h:radial-24','c9-d150'),/Frozen reform arm/);
 await assert.rejects(()=>searchHoldoutNumericalReform('h:radial-01','c8-d150'),/Frozen combined/);
});
test('Five mandatory connected neighbors remain refused by four-cap control',()=>{
 const ids=['a','b','c','d','e'],clauses=ids.map(x=>[x]),adj=new Map(ids.map((x,i)=>[x,ids.filter((_,j)=>Math.abs(i-j)===1)]));
 assert.equal(rotationCoverGroups(clauses,adj,budget()).groups.length,0);
 assert.throws(()=>rotationCoverGroups(clauses,adj,budget(),8),/cap must be four/);
 assert.deepEqual(reformRotationCoverGroups(clauses,adj,budget(),8).groups,[ids]);
 assert.throws(()=>reformRotationCoverGroups(clauses,adj,budget(),9),/Invalid reform/);
});
