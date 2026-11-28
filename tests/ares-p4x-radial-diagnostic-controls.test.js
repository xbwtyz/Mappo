import test from 'node:test';
import assert from 'node:assert/strict';
import {diskPairBound,orientationDiskInterval} from '../scripts/development/research/ares-p4x-displacement-diagnostics.mjs';
import {runRadialDiagnostic} from '../scripts/development/research/ares-p4x-radial-diagnostic-run.mjs';
import {createDiagnosticCapture} from '../scripts/development/research/ares-p4x-diagnostic-capture.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {G_MANIFEST} from '../scripts/development/research/ares-p4-g-corpus.mjs';
const p=(x,y,r=0)=>({x,y,r});
test('disk bound certifies only robust proper crossing',()=>{
  assert.equal(diskPairBound(p(-10,0,.1),p(10,0,.1),p(0,-10,.1),p(0,10,.1)).inevitableProperCrossing,true);
  assert.equal(diskPairBound(p(-10,0,20),p(10,0,20),p(0,-10,20),p(0,10,20)).inevitableProperCrossing,false);
  assert.equal(diskPairBound(p(-10,0),p(10,0),p(0,1),p(0,10)).inevitableProperCrossing,false);
  const a=p(0,0,2),b=p(10,0,3),c=p(0,10,4),i=orientationDiskInterval(a,b,c);
  for(const dx of [-1,1])for(const dy of [-1,1]){const x={x:a.x+dx*a.r,y:a.y},y={x:b.x,y:b.y+dy*b.r},z={x:c.x+dx*c.r,y:c.y};const o=(y.x-x.x)*(z.y-x.y)-(y.y-x.y)*(z.x-x.x);assert.ok(o>=i.lo&&o<=i.hi);}
});
test('metered capture records best actual rejection and recurring pair count',()=>{
  const b=createSpatialPreservationBudget(G_MANIFEST.search.root),d=createDiagnosticCapture(),n=[{id:'a',old:{x:0,y:0},point:{x:1,y:0}}],pair={code:'unnormalized-crossing',roadIds:['a','b']};
  d.record({valid:false,issues:['unnormalized-crossing'],conflictPairs:[pair,{...pair,roadIds:['c','d']}]},n,1,'test',b);
  d.record({valid:false,issues:['unnormalized-crossing'],conflictPairs:[pair]},n,2,'test',b);
  const out=d.finish();assert.equal(out.best.attempt,2);assert.equal(out.recurrence[0].count,2);assert.equal(out.completed,2);assert.ok(b.snapshot().work>0);
});
test('diagnostics refuse unknown case and arm',async()=>{
  await assert.rejects(()=>runRadialDiagnostic('unknown','prior'),/Unapproved/);
  await assert.rejects(()=>runRadialDiagnostic('radial-small:eight-loop:50:y','extra'),/Unapproved/);
});
