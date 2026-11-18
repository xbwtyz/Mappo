import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeWellFormed, shapeContained, shapesOverlapInterior, inspectBuildingGeometry } from '../src/core/building-validation.js';
const poly=(x,y,w=10,h=10)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const property={id:'p',buildingIds:['a','b'],boundary:poly(0,0,50,50)};
const a={id:'a',propertyId:'p',footprint:poly(4,4),holes:[],area:100,orientation:0,accessPath:[]};
const b={id:'b',propertyId:'p',footprint:poly(25,4),holes:[],area:100,orientation:0,accessPath:[]};
const city={properties:[property],buildings:[a,b]};
test('3G-C1 exact concave polygons, edges and boundary containment',()=>{
  const L=[{x:0,y:0},{x:10,y:0},{x:10,y:3},{x:3,y:3},{x:3,y:10},{x:0,y:10}];
  assert.ok(shapeWellFormed(L));
  assert.equal(shapeWellFormed([{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}]),false);
  assert.equal(shapeContained(poly(1,1,2,2),L),true);
  assert.equal(shapeContained(poly(2,2,6,6),L),false,'concave exclusion must not be missed');
  assert.equal(shapesOverlapInterior(poly(0,0),poly(10,0)),false,'edge touch is allowed');
  assert.equal(shapesOverlapInterior(poly(0,0),poly(9,0)),true);
  assert.equal(shapesOverlapInterior(L,poly(5,5,2,2)),false,'point inside L bounding box is not overlap');
});
test('3G-C1 property containment, building collision and courtyard checks',()=>{
  const original=JSON.stringify(city);
  assert.equal(inspectBuildingGeometry(city,'a',{dx:2}).ok,true);
  assert.ok(inspectBuildingGeometry(city,'a',{dx:-8}).issues.some(x=>x.code==='property'));
  assert.ok(inspectBuildingGeometry(city,'a',{dx:17}).issues.some(x=>x.code==='collision'));
  assert.ok(inspectBuildingGeometry(city,'missing',{}).issues.some(x=>x.code==='missing'));
  assert.ok(inspectBuildingGeometry({ ...city,buildings:[{...a,holes:[poly(4,4,2,2)]},b]},'a',{dx:1}).issues.some(x=>x.code==='courtyard'));
  assert.equal(JSON.stringify(city),original,'validation must never mutate the accepted city');
});
