import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyP5Contact,p5Permissions,p5PermissionReasons} from '../scripts/development/research/ares-p5-topology-contract.mjs';
const p=(x,y)=>({x,y});
const all={mode:'restructure',intersection:true,split:true,merge:true,overlap:true};
test('P5 exact contact taxonomy, no snapping or deletion authority',()=>{
  const cases=[
    [[p(0,0),p(10,0),p(5,-5),p(5,5)],'interior-interior'],
    [[p(0,0),p(10,0),p(5,0),p(5,5)],'endpoint-interior'],
    [[p(0,0),p(10,0),p(10,0),p(10,5)],'endpoint-endpoint'],
    [[p(0,0),p(10,0),p(5,0),p(15,0)],'overlap'],
    [[p(0,0),p(10,0),p(10,0),p(15,0)],'endpoint-endpoint'],
    [[p(0,0),p(10,0),p(0,1),p(10,1)],'none'],
    [[p(0,0),p(0,0),p(0,-1),p(0,1)],'indeterminate'],
    [[p(0,0),p(10,0),p(10+1e-10,0),p(10+1e-10,5)],'indeterminate']
  ];
  for(const [points,kind] of cases){
    const c=classifyP5Contact(...points);assert.equal(c.kind,kind);
    assert.equal(classifyP5Contact(points[2],points[3],points[0],points[1]).kind,kind);
    assert.ok(Object.isFrozen(c));
  }
  assert.deepEqual(p5PermissionReasons(all,{kind:'interior-interior'}),[]);
  assert.deepEqual(p5PermissionReasons(all,{kind:'overlap'}),['overlap-resolution-held']);
  assert.deepEqual(p5PermissionReasons(all,{kind:'endpoint-endpoint'}),['identity-consolidation-held']);
});
test('P5 explicit separate permissions, strict/adaptive always blocked, malformed input refused',()=>{
  for(const mode of ['strict','adaptive'])assert.ok(p5PermissionReasons({...all,mode},{kind:'interior-interior'}).includes('restructure-required'));
  for(const k of ['intersection','split'])assert.ok(p5PermissionReasons({...all,[k]:false},{kind:'interior-interior'}).includes('permission-'+k));
  assert.throws(()=>p5Permissions({...all,destruction:true}),/Explicit/);
  assert.throws(()=>p5Permissions({mode:'restructure'}),/Explicit/);
  assert.throws(()=>p5Permissions({...all,split:1}),/Explicit/);
  assert.throws(()=>p5Permissions({...all,get split(){return true;}}),/Explicit/);
  assert.ok(Object.isFrozen(p5Permissions(all)));
});
