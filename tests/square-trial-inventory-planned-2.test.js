import test from 'node:test';
import assert from 'node:assert/strict';
import {inventorySquareTournament} from '../scripts/development/research/square-trial-tournament-inventory.mjs';
const ids=["planned-08","planned-09","planned-10","planned-11","planned-12","planned-13"],results=[];
for(const id of ids)test('Square S3a corrected three-arm frozen input '+id,()=>{
 const r=inventorySquareTournament(id);results.push(r);
 console.log('SQUARE_TOURNAMENT_INPUT '+JSON.stringify(r));
 assert.equal(r.id,id);assert.equal(r.authority,'none');assert.equal(r.recovery,'not-run');
 assert.equal(Boolean(r.adaptive),id.startsWith('radial-'));
 for(const a of [r.control,r.experimental,...(r.adaptive?[r.adaptive]:[])]){
  assert.ok(['generation-refused','graph-refused','selected','selection-limit','selection-unavailable'].includes(a.status));
  if(a.status==='selected'){assert.equal(a.selection.ids.length,r.recipe.count);assert.match(a.source,/^[a-f0-9]{64}$/);}
  if(a.reason)assert.doesNotMatch(a.reason,/Cannot read properties|not defined|not a function/);
 }
 if(r.adaptive?.status==='selected'){
  assert.ok(r.adaptive.hub.vertices.length>=4&&r.adaptive.hub.area>1);
  assert.equal(r.adaptive.hub.roadIds.length,r.adaptive.hub.vertices.length);
  if(r.control.status==='selected'){
   assert.equal(r.adaptive.nodes,r.control.nodes);assert.equal(r.adaptive.roads,r.control.roads);
   assert.equal(r.adaptive.maxDegree,r.control.maxDegree);
   assert.equal(r.adaptive.protectedRoads+r.adaptive.hub.roadIds.length,r.control.protectedRoads);
   assert.equal(r.adaptive.properties,r.control.properties);assert.equal(r.adaptive.buildings,r.control.buildings);
  }
 }
});
test('Square S3a shard must produce admitted experimental sources',()=>{
 assert.equal(results.length,ids.length);
 assert.ok(results.some(r=>r.experimental.status==='selected'),'Squareless adapter produced no selected sources.');
 
});
