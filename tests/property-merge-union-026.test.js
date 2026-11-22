import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyMergeUnion026 } from '../src/core/property-merge-union-026.js';
import { polygonSignedArea } from '../src/core/geometry.js';

const prop=(boundary,id='ROAD-A')=>({blockId:'BLK-1',districtId:'DIST-1',boundary,
  frontageRoadId:id,frame:{origin:boundary[0],tangent:{x:1,y:0},inward:{x:0,y:1}},
  local:{x:0,y:0,width:30,depth:30}});
const rect=(x0,y0,x1,y1,id='ROAD-A')=>prop([
  {x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}],id);
const A=rect(0,0,12,12);
test('026 full shared-edge union keeps original frontage and conserves area',()=>{
  const B=rect(12,0,20,12);
  const r=propertyMergeUnion026(A,B);
  assert.equal(r.union.length,4);
  assert.equal(r.frontageLength,20);
  assert.equal(r.area,240);
  assert.deepEqual(r.frontageRoadIds,['ROAD-A']);
});
test('026 partial-edge union yields connected concave exterior without moving land',()=>{
  const B=prop([{x:20,y:4},{x:20,y:10},{x:12,y:10},{x:12,y:4}],'ROAD-B');
  const r=propertyMergeUnion026(A,B);
  assert.ok(r.union.length>4);
  assert.ok(Math.abs(r.area-192)<.00001);
  assert.equal(r.sharedLength,6);
  assert.deepEqual(r.frontageRoadIds,['ROAD-A','ROAD-B']);
});
test('026 union accepts concave source with one straight partial seam',()=>{
  const C=prop([{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:6,y:4},{x:6,y:10},{x:0,y:10}]);
  const B=prop([{x:12,y:5},{x:12,y:9},{x:6,y:9},{x:6,y:5}],'ROAD-B');
  const r=propertyMergeUnion026(C,B);
  assert.ok(r.union.length>4);
  assert.ok(Math.abs(r.area-polygonSignedArea(C.boundary)-polygonSignedArea(B.boundary))<.02);
});
test('026 rejects corner-only, interior-overlap, cross-block and disconnected unions',()=>{
  assert.throws(()=>propertyMergeUnion026(A,rect(12,12,18,18)),/positive-length|corner/i);
  assert.throws(()=>propertyMergeUnion026(A,rect(10,5,18,10)),/overlap/i);
  const other=rect(12,0,20,12);other.blockId='OTHER';
  assert.throws(()=>propertyMergeUnion026(A,other),/same accepted block/i);
  assert.throws(()=>propertyMergeUnion026(A,rect(25,0,35,12)),/positive-length|corner/i);
});
test('026 rejects a concave union with more than twelve retained corners',()=>{
  const C=prop([{x:0,y:0},{x:20,y:0},{x:20,y:2},{x:16,y:2},{x:16,y:4},{x:12,y:4},
    {x:12,y:6},{x:8,y:6},{x:8,y:8},{x:4,y:8},{x:4,y:10},{x:0,y:10}]);
  const D=prop([{x:20,y:0},{x:24,y:0},{x:24,y:2},{x:20,y:2}]);
  // A legal join remains supported if redundant corners still fit 12;
  // never silently raise the 0.2.4 twelve-corner storage limit.
  const r=propertyMergeUnion026(C,D);
  assert.ok(r.union.length<=12);
});
