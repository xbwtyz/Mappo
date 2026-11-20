import test from 'node:test';
import assert from 'node:assert/strict';
import {polygonSignedArea} from '../src/core/geometry.js';
import {shapeWellFormed} from '../src/core/building-validation.js';
import {previewBuildingGeometry} from '../src/core/building-transform.js';
import {createProject} from '../src/core/city-model.js';
import {validateStoredProject} from '../src/data/project-validation.js';
import {defaultWorkspace,createProjectDocument,encodeProjectDocument,decodeProjectDocument} from '../src/data/project-format.js';
import {makeBuildingShape3H,defaultBuildingSpec3H} from '../src/editor/building-structures.js';
import {
 validateFootprintF1,insertFootprintVertexF1,moveFootprintVertexF1,
 deleteFootprintVertexF1,attachBuildingWingF1,notchBuildingOutlineF1,
 addRectangularCourtyardF1,removeBuildingCourtyardF1
} from '../src/core/building-footprint-f1.js';

const square=()=>({footprint:[{x:0,y:0},{x:12,y:0},{x:12,y:12},{x:0,y:12}],holes:[]});

test('F1 vertex insert/move/delete are pure and preserve positive simple rings',()=>{
 const source=square(),before=JSON.stringify(source);
 const inserted=insertFootprintVertexF1(source,0,.5);
 assert.equal(inserted.footprint.length,5);
 assert.deepEqual(inserted.footprint[1],{x:6,y:0});
 const moved=moveFootprintVertexF1(inserted,1,{x:6,y:-2});
 assert.ok(shapeWellFormed(moved.footprint));
 assert.ok(moved.area>inserted.area);
 const restored=deleteFootprintVertexF1(moved,1);
 assert.deepEqual(restored.footprint,source.footprint);
 assert.equal(JSON.stringify(source),before);
 assert.throws(()=>deleteFootprintVertexF1(square(),-1),/vertices/);
 assert.throws(()=>insertFootprintVertexF1(square(),0,0),/inside/);
 assert.throws(()=>moveFootprintVertexF1(square(),1,{x:0,y:12}),/simple/);
});

test('F1 connected wing is one simple exterior footprint and never mutates source',()=>{
 const original=square(),before=JSON.stringify(original);
 const wing=attachBuildingWingF1(original,0,{start:.25,end:.75,depth:4});
 assert.equal(wing.footprint.length,8);
 assert.ok(shapeWellFormed(wing.footprint));
 assert.equal(wing.holes.length,0);
 assert.equal(wing.area,180);
 assert.equal(wing.footprint[2].y,-4);
 assert.equal(JSON.stringify(original),before);
 assert.throws(()=>attachBuildingWingF1(original,0,{start:.7,end:.3,depth:2}),/nonzero/);
});

test('F1 U-like notch reduces occupied area and remains a single polygon',()=>{
 const source=square(),u=notchBuildingOutlineF1(source,2,{start:.25,end:.75,depth:4});
 assert.ok(shapeWellFormed(u.footprint));
 assert.equal(u.area,120);
 assert.equal(u.footprint.length,8);
 assert.equal(JSON.stringify(source),JSON.stringify(square()));
 assert.throws(()=>notchBuildingOutlineF1(source,2,{start:.2,end:.8,depth:25}),/simple/);
});

test('F1 courtyard is validated, subtracts area and supports later hole vertices',()=>{
 const original=square(),withHole=addRectangularCourtyardF1(original,{center:{x:6,y:6},width:4,depth:4});
 assert.equal(withHole.area,128);
 assert.equal(withHole.holes.length,1);
 const ring=insertFootprintVertexF1(withHole,0,.5,{holeIndex:0});
 assert.equal(ring.holes[0].length,5);
 assert.equal(ring.area,128);
 const restored=removeBuildingCourtyardF1(withHole,0);
 assert.deepEqual(restored.footprint,original.footprint);
 assert.equal(restored.area,144);
 assert.throws(()=>addRectangularCourtyardF1(withHole,{center:{x:6,y:6},width:2,depth:2}),/Courtyards/);
 assert.throws(()=>addRectangularCourtyardF1(original,{center:{x:11,y:6},width:4,depth:4}),/strictly inside/);
 assert.equal(JSON.stringify(original),JSON.stringify(square()));
});

test('F1 preserves old schema-9 building data and existing presets under pure edits',()=>{
 for(const morphology of ['planned','organic','radial','linear']){
  const project=createProject({seed:'f1-compat-'+morphology,size:'small',morphology});
  validateStoredProject(project);
  const building=project.city.buildings[0],property=project.city.properties.find(p=>p.id===building.propertyId);
  const before=JSON.stringify(project.city);
  const measured=validateFootprintF1(building);
  assert.ok(measured.area>1);
  const moved=previewBuildingGeometry({...building,...measured},{dx:.05,dy:.05});
  assert.equal(moved.footprint.length,building.footprint.length);
  for(const preset of ['rectangle','L','T','courtyard']){
   const shape=makeBuildingShape3H(property,{...defaultBuildingSpec3H(property),preset});
   assert.ok(shapeWellFormed(shape.footprint));
   assert.ok(validateFootprintF1(shape).area>1);
  }
  const portable=decodeProjectDocument(encodeProjectDocument(createProjectDocument(project,defaultWorkspace(project))));
  assert.equal(JSON.stringify(portable.project.city),before);
 }
});

test('F1 invalid hole topology and malformed input are safely rejected',()=>{
 const s=square(),unchanged=JSON.stringify(s);
 assert.throws(()=>addRectangularCourtyardF1(s,{center:{x:6,y:6},width:0,depth:2}),/positive/);
 assert.throws(()=>removeBuildingCourtyardF1(s,0),/existing/);
 assert.throws(()=>moveFootprintVertexF1(s,0,{x:NaN,y:2}),/finite/);
 assert.throws(()=>attachBuildingWingF1(s,0,{start:0,end:.8,depth:2}),/nonzero/);
 assert.equal(polygonSignedArea(s.footprint),144);
 assert.equal(JSON.stringify(s),unchanged);
});
