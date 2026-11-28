import test from 'node:test';
import assert from 'node:assert/strict';
import {rotationCoverGroups,projectRotation} from '../scripts/development/research/ares-p5-holdout-rotation.mjs';
import {searchHoldoutRotationSeeds} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const root=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
test('Rotation cover counts connectors, refuses empty clauses, preserves cap',()=>{
 const adj=new Map([['a',['b']],['b',['a','c']],['c',['b']],['z',[]]]);
 assert.equal(rotationCoverGroups([[]],adj,root()).status,'empty-clause');
 assert.equal(rotationCoverGroups([['a'],['z']],adj,root()).status,'no-connected-cover');
 assert.deepEqual(rotationCoverGroups([['a'],['c']],adj,root()).groups[0],['a','b','c']);
 assert.throws(()=>rotationCoverGroups([['a']],adj,root(),5),/four/);
});
test('Angular projection moves only allowed point, preserves exact coordinates and displacement cap',()=>{
 const g={nodesById:new Map([['a',{x:0,y:0}],['b',{x:10,y:0}],['c',{x:0,y:10}]])};
 const exact=new Map([['a',{x:0,y:0}],['b',{x:10,y:0}]]),points=new Map([['c',{x:0,y:-1}]]);
 projectRotation(g,exact,points,[{ids:['a','b','c'],sign:1}],{x:20,y:0},1,root());
 assert.ok(points.get('c').y>0);assert.equal(points.size,1);assert.deepEqual(exact.get('b'),{x:10,y:0});assert.ok(Math.hypot(points.get('c').x,points.get('c').y-10)<=20);
});
test('Rotation research refuses noncohort cases and caller projects',async()=>{
 await assert.rejects(()=>searchHoldoutRotationSeeds('h:radial-01'),/Frozen combined/);
 await assert.rejects(()=>searchHoldoutRotationSeeds({caseId:'h:radial-12'}),/Frozen holdout/);
});
