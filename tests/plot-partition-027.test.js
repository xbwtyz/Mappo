import test from 'node:test';
import assert from 'node:assert/strict';
import { splitConvexPlot027,mergeConvexPlots027,validatePlotTiling027 } from '../src/core/plot-partition-027.js';
import { polygonSignedArea } from '../src/core/geometry.js';
const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}];
test('B04 straight angled divider conserves convex geometry, then exact join',()=>{
  const split=splitConvexPlot027(square,0,.3,2,.6);
  assert.equal(split.plots.length,2);
  assert.ok(Math.abs(split.plots.reduce((a,p)=>a+polygonSignedArea(p),0)-100)<.005);
  validatePlotTiling027(square,split.plots.map((boundary,id)=>({id,boundary})));
  const union=mergeConvexPlots027(...split.plots);
  assert.ok(Math.abs(polygonSignedArea(union)-100)<.005);
});
test('B04 multi-corner concave parent may be tiled by convex triangles',()=>{
  const l=[{x:0,y:0},{x:12,y:0},{x:12,y:4},{x:4,y:4},{x:4,y:12},{x:0,y:12}];
  assert.deepEqual(validatePlotTiling027(l,[
    {boundary:[l[0],l[1],l[2],l[3],l[4],l[5]].slice(0,0).concat([l[0],l[1],l[3]])},
    {boundary:[l[1],l[2],l[3]]},
    {boundary:[l[0],l[3],l[4],l[5]]}
  ]).plotCount,3);
});
test('B04 bad divider, disconnected merge, overlaps and gaps fail closed',()=>{
  assert.throws(()=>splitConvexPlot027(square,1,.5,1,.8),/distinct/);
  assert.throws(()=>splitConvexPlot027(square,0,.00001,2,.5),/interior/);
  const shifted=square.map(p=>({x:p.x+30,y:p.y}));
  assert.throws(()=>mergeConvexPlots027(square,shifted),/share/);
  assert.throws(()=>validatePlotTiling027(square,[{boundary:square},{boundary:square}]),/area|overlap/);
  assert.throws(()=>validatePlotTiling027(square,[{boundary:splitConvexPlot027(square,0,.5,2,.5).plots[0]}]),/gap/);
});
