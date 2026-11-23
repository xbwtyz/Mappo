import test from 'node:test';
import assert from 'node:assert/strict';
import { hitBuilding } from '../src/core/building-selection.js';

const box=(x,y,w,h=w)=>[
  {x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const region=(id,kind,parentId,ring)=>({id,kind,parentId,ring});
const building=(id,regions)=>({id,geometry:{version:1,regions},
  components:[{id:'CMP-'+id,parentId:null}]});

test('S10-B selects disconnected roots without introducing writable legacy fields',()=>{
  const b=building('multi',[
    region('R-A','solid',null,box(0,0,10)),
    region('R-B','solid',null,box(30,0,10)),
    region('R-H','void','R-B',box(33,3,4)),
  ]);
  const old=JSON.stringify(b);
  assert.equal(hitBuilding({x:5,y:5},[b]).id,'multi');
  assert.equal(hitBuilding({x:38,y:8},[b]).id,'multi');
  assert.equal(hitBuilding({x:35,y:5},[b]),null);
  assert.equal(JSON.stringify(b),old);
});

test('S10-B selects nested islands but not ownership of independent courtyard occupants',()=>{
  const parent=building('court',[
    region('R-A','solid',null,box(0,0,100)),
    region('R-B','void','R-A',box(20,20,60)),
    region('R-C','solid','R-B',box(40,40,20)),
  ]);
  const independent=building('independent',[
    region('R-D','solid',null,box(25,25,10)),
  ]);
  assert.equal(hitBuilding({x:10,y:10},[parent,independent]).id,'court');
  assert.equal(hitBuilding({x:50,y:50},[parent,independent]).id,'court');
  assert.equal(hitBuilding({x:30,y:30},[parent,independent]).id,'independent');
  assert.equal(hitBuilding({x:70,y:70},[parent,independent]),null);
});
