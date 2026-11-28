import test from 'node:test';
import assert from 'node:assert/strict';
import {angularLineProposals} from '../scripts/development/research/ares-p5-holdout-local-angular.mjs';
import {searchHoldoutLocalAngular,LOCAL_ANGULAR_CASES} from '../scripts/development/research/ares-p5-holdout-combined-seeds.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
test('Angular line sampling explores both sides within displacement disk',()=>{
 const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768}),old={x:0,y:1},current={x:0,y:2};
 const points=[...angularLineProposals(current,old,5,[[{x:-3,y:0},{x:3,y:0}]],b)];
 assert.ok(points.some(p=>p.y<0)&&points.some(p=>p.y>0));
 assert.ok(points.every(p=>Math.hypot(p.x-old.x,p.y-old.y)<=5&&(p.x!==old.x||p.y!==old.y)));
});
test('Local angular arm is restricted to the five unresolved four-neighbor cases',async()=>{
 assert.equal(LOCAL_ANGULAR_CASES.length,5);
 await assert.rejects(()=>searchHoldoutLocalAngular('h:radial-12'),/Frozen local angular/);
});
