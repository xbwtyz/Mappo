import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAZA_CASES,plazaAnchorReasons,describePlazaContact,diagnoseHoldoutPlaza} from '../scripts/development/research/ares-p5-holdout-plaza-diagnostics.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
test('Plaza exposure distinguishes actual plaza roads, ordinary attached roads and other anchors',async()=>{
 const city={plaza:{vertices:['a','b','c']},roads:[{id:'s',a:'a',b:'b',plaza:true},{id:'r',a:'a',b:'d'},{id:'t',a:'d',b:'e',boundary:true},{id:'u',a:'e',b:'f'}]};
 const g={nodesById:new Map(['a','b','c','d','e','f'].map(id=>[id,{id}])),roadsById:new Map(city.roads.map(r=>[r.id,r])),terminalRoadIds:[]};
 const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768}),{reasons}=plazaAnchorReasons(city,g,b);
 assert.deepEqual([...reasons.get('a')].sort(),['plaza-vertex','road:plaza']);assert.deepEqual([...reasons.get('d')],['road:boundary']);
 const x=describePlazaContact(['r','u'],g,reasons,b);assert.equal(x.plazaEdge,false);assert.equal(x.plazaAnchor,true);assert.deepEqual(x.ordinaryAttachedRoads,['r']);
 assert.equal(describePlazaContact(['t','u'],g,reasons,b).plazaAnchor,false);
 assert.equal(PLAZA_CASES.length,100);await assert.rejects(()=>diagnoseHoldoutPlaza('h:unknown'),/Frozen plaza/);
});
