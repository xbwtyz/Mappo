import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildingFrame, previewBuildingGeometry, buildingPreviewHandles, buildingPreviewHit,
  normalizeBuildingTransform, buildingTransformDirty
} from '../src/core/building-transform.js';
import { BuildingEditSession } from '../src/editor/building.js';
import { polygonSignedArea } from '../src/core/geometry.js';

const sample={ id:'b1',propertyId:'p1',
  footprint:[{x:0,y:0},{x:12,y:0},{x:12,y:9},{x:0,y:9}],
  holes:[[{x:3,y:2},{x:8,y:2},{x:8,y:7},{x:3,y:7}]],
  entrance:{x:6,y:0},accessPath:[{x:6,y:0},{x:6,y:-6}],orientation:0,area:83
};
const city={buildings:[sample,{...sample,id:'b2',footprint:sample.footprint.map(p=>({x:p.x+22,y:p.y}))},{...sample,id:'b3',propertyId:'p2'}],
  properties:[{id:'p1',buildingIds:['b1','b2']},{id:'p2',buildingIds:['b3']}]};
test('3G-B1 move, rotate, and independent scales transform all contours and entry paths without mutating sources',()=>{
 const before=JSON.stringify(sample);
 const out=previewBuildingGeometry(sample,{dx:5,dy:3,angle:Math.PI/2,scaleX:2,scaleY:.5});
 assert.equal(out.footprint.length,4);assert.equal(out.holes[0].length,4);
 assert.ok(Math.abs(out.area-(108-25))<1e-8);
 assert.equal(out.orientation,Math.PI/2);
 assert.equal(out.accessPath.length,2);
 assert.ok(Math.abs(out.entrance.x-(6+5+4.5*.5))<1e-7);
 assert.equal(JSON.stringify(sample),before);
});
test('3G-B1 invalid transforms are rejected and immutable originals stay intact',()=>{
 assert.throws(()=>normalizeBuildingTransform({scaleX:0}),/20%/);
 assert.throws(()=>normalizeBuildingTransform({scaleY:Infinity}),/finite/);
 assert.throws(()=>normalizeBuildingTransform({dx:NaN}),/finite/);
 assert.ok(!buildingTransformDirty({dx:0,dy:0,angle:0,scaleX:1,scaleY:1}));
 const invalid={...sample,footprint:[]};
 assert.throws(()=>buildingFrame(invalid),/footprint/);
});
test('3G-B2 pointer movement and cancellation create only a transient draft',()=>{
 const original=JSON.stringify(city),session=new BuildingEditSession();
 assert.equal(session.start(city,{buildings:true},'b1'),true);
 const center={x:6,y:4.5};
 assert.equal(session.beginGesture(city,{buildings:true},center,2),true);
 assert.equal(session.moveGesture({x:13,y:8.5}),true);
 assert.equal(session.transform.dx,7);assert.equal(session.transform.dy,4);
 assert.equal(session.isPending,true);
 session.endGesture(true);assert.equal(session.isPending,false);
 session.beginGesture(city,{buildings:true},center,2);
 session.moveGesture({x:8,y:5.5});session.endGesture();
 assert.equal(session.transform.dx,2);
 assert.equal(JSON.stringify(city),original);
 assert.equal(session.focus(city,{buildings:true},'b2'),true);
 assert.equal(session.isPending,false);
 assert.equal(session.allows(city,{buildings:true},'b3'),false);
});
test('3G-B3 rotation and resize handles produce observable, cancelable previews',()=>{
 const session=new BuildingEditSession(),layers={buildings:true};session.start(city,layers,'b1');
 const rotation=buildingPreviewHandles(sample,session.transform,2).find(h=>h.kind==='rotate');
 assert.equal(buildingPreviewHit(sample,session.transform,rotation,2)?.kind,'rotate');
 assert.equal(session.beginGesture(city,layers,rotation,2),true);
 session.moveGesture({x:rotation.x+20,y:rotation.y+20});session.endGesture();
 assert.ok(Math.abs(session.transform.angle)>.01);
 session.reset();
 const corner=buildingPreviewHandles(sample,session.transform,2).find(h=>h.sx===1&&h.sy===1);
 session.beginGesture(city,layers,corner,2);
 session.moveGesture({x:corner.x+3,y:corner.y+2});session.endGesture();
 assert.ok(session.transform.scaleX>1&&session.transform.scaleY>1);
 assert.equal(session.transform.scaleX,session.transform.scaleY);
 session.lockRatio=false;
 const resized=buildingPreviewHandles(sample,session.transform,2).find(h=>h.sx===1&&h.sy===1);
 const depth=session.transform.scaleY;
 assert.equal(session.beginGesture(city,layers,resized,2),true);
 session.moveGesture({x:resized.x+3,y:resized.y});
 session.endGesture();
 assert.equal(session.transform.scaleY,depth);
 assert.ok(Math.abs(polygonSignedArea(session.previewFor(city).footprint))>108);
 assert.equal(session.reset(),true);
 assert.equal(session.isPending,false);
});
