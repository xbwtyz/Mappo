import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileMergeBuildings026 } from '../src/editor/property-merge-adaptation-026.js';

function fixture(){
  const footprint=[{x:8,y:9},{x:11,y:9},{x:11,y:12},{x:8,y:12}];
  const boundary=[{x:0,y:0},{x:24,y:0},{x:24,y:20},{x:0,y:20}];
  const building={id:'BLD-1',propertyId:'PROP-A',blockId:'BLOCK-A',
    frontageRoadId:'ROAD-A',footprint,holes:[],area:9,orientation:0,
    plotIds:['PLOT-1'],entrance:{x:9,y:9},
    accessPath:[{x:9,y:9},{x:999,y:999}],roofTone:100,type:'house',shape:'rect'};
  const property={id:'PROP-A',blockId:'BLOCK-A',plotIds:['PLOT-1'],buildingIds:['BLD-1'],boundary};
  const city={properties:[property],
    plots:[{id:'PLOT-1',propertyId:'PROP-A',blockId:'BLOCK-A',boundary}],
    buildings:[building],
    roads:[{id:'ROAD-A',a:'NODE-A',b:'NODE-B',kind:'street'}],
    nodes:[{id:'NODE-A',x:0,y:0},{id:'NODE-B',x:24,y:0}]};
  return {city,property,originals:new Map([['BLD-1',structuredClone(building)]])};
}
test('026 access changes require per-building authorization when provenance is unproven',()=>{
  const {city,property,originals}=fixture();
  const before=JSON.stringify(city);
  const blocked=reconcileMergeBuildings026(city,property,['ROAD-A'],originals,new Set());
  assert.equal(blocked.changes.length,1);
  assert.equal(blocked.issues.length,1);
  assert.equal(blocked.issues[0].code,'authorization');
  assert.equal(JSON.stringify(city),before);
  const allowed=reconcileMergeBuildings026(city,property,['ROAD-A'],originals,new Set(['BLD-1']));
  assert.deepEqual(allowed.issues,[]);
  assert.equal(allowed.changes.length,1);
  assert.equal(allowed.changes[0].kind,'entrance-or-route');
  assert.notDeepEqual(city.buildings[0].accessPath,originals.get('BLD-1').accessPath);
  assert.deepEqual(city.buildings[0].footprint,originals.get('BLD-1').footprint);
  assert.equal(city.buildings[0].id,'BLD-1');
});

test('026 preserves accepted setback-frontage access without needless building edits',()=>{
  const {city,property,originals}=fixture();
  city.nodes[0].y=-5;city.nodes[1].y=-5;
  city.buildings[0].accessPath=[{x:9,y:9},{x:9,y:0}];
  const original=JSON.stringify(city);
  const result=reconcileMergeBuildings026(city,property,['ROAD-A'],originals,new Set(),
    [{roadId:'ROAD-A',segment:[{x:0,y:0},{x:24,y:0}]}]);
  assert.deepEqual(result.issues,[]);
  assert.deepEqual(result.changes,[]);
  assert.equal(JSON.stringify(city),original);
});
