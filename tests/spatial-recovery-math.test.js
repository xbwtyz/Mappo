import test from 'node:test';
import assert from 'node:assert/strict';
import { sreMathSin,sreMathCos,sreMathAtan2 } from '../src/core/spatial-recovery-math.js';
import { roadFrameLength } from '../src/core/geometry.js';

test('bounded recovery rotation reproduces the locked failing angle without mutating native Math',()=>{
  const native=[Math.sin,Math.cos,Math.atan2,Math.hypot];
  const a=-4.627327488789011;
  assert.equal(sreMathSin(a),0.9963844521245264);
  assert.equal(sreMathCos(a),-0.084958952232872);
  assert.ok(Object.is(sreMathSin(-0),-0));
  assert.equal(sreMathCos(-0),1);
  assert.ok(Object.is(sreMathAtan2(-0,1),-0));
  assert.equal(sreMathAtan2(0,-0),Math.PI);
  assert.equal(sreMathAtan2(-0,-0),-Math.PI);
  assert.deepEqual([Math.sin,Math.cos,Math.atan2,Math.hypot],native);
});
test('fixed kernels retain binary64 accuracy over bounded geometry angles and all quadrants',()=>{
  for(let i=-8192;i<=8192;i++){
    const x=i/8,y=i/256,z=1-i/2048;
    assert.ok(Math.abs(sreMathSin(x)-Math.sin(x))<=2e-15,'sin '+x);
    assert.ok(Math.abs(sreMathCos(x)-Math.cos(x))<=2e-15,'cos '+x);
    assert.ok(Math.abs(sreMathAtan2(y,z)-Math.atan2(y,z))<=2e-15,'atan2 '+y+','+z);
  }
  for(const x of [-1e30,1e30,Infinity,NaN]){
    assert.ok(Object.is(sreMathSin(x),Math.sin(x)));
    assert.ok(Object.is(sreMathCos(x),Math.cos(x)));
  }
  assert.equal(sreMathAtan2(Infinity,-Infinity),Math.atan2(Infinity,-Infinity));
  assert.equal(roadFrameLength(3,4),5);
  assert.equal(roadFrameLength(1e300,0),1e300);
});
