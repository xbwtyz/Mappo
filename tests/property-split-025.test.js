import test from 'node:test';
import assert from 'node:assert/strict';
import { polygonSignedArea } from '../src/core/geometry.js';
import { shapeWellFormed, shapesOverlapInterior } from '../src/core/building-validation.js';
import { propertySplitDraft025, propertySplitGeometry025 } from '../src/core/property-split-geometry-025.js';

const rect=[{x:0,y:0},{x:40,y:0},{x:40,y:30},{x:0,y:30}];
const concave=[{x:0,y:0},{x:40,y:0},{x:40,y:14},{x:20,y:14},{x:20,y:30},{x:0,y:30}];
const squarePlot=[{x:0,y:0},{x:40,y:0},{x:40,y:30},{x:0,y:30}];
const lower=[{x:0,y:0},{x:40,y:0},{x:40,y:14},{x:0,y:14}];
const upper=[{x:0,y:14},{x:20,y:14},{x:20,y:30},{x:0,y:30}];
const fixture=(boundary,plots)=>({properties:[{id:'PROP-S',boundary,
  plotIds:plots.map((_,i)=>'PLOT-'+i),frontageRoadId:'ROAD-S',frame:{}}],plots:plots.map((poly,i)=>({
    id:'PLOT-'+i,propertyId:'PROP-S',boundary:poly
  }))});
const assertCoverage=(source,g)=>{
  assert.ok(shapeWellFormed(g.left)&&shapeWellFormed(g.right));
  assert.equal(shapesOverlapInterior(g.left,g.right),false);
  assert.ok(Math.abs(g.areaLeft+g.areaRight-polygonSignedArea(source))<.02);
  for(const side of ['left','right']){
    const total=g.fragments.filter(f=>f.side===side)
      .reduce((sum,f)=>sum+polygonSignedArea(f.boundary),0);
    assert.ok(Math.abs(total-g['area'+side[0].toUpperCase()+side.slice(1)])<.02);
  }
};
test('025 P1/P2: straight angled divider clips an accepted convex quadrilateral and its plot',()=>{
  const city=fixture(rect,[squarePlot]),before=JSON.stringify(city);
  const g=propertySplitGeometry025(city,'PROP-S',.3,2,.65);
  assertCoverage(rect,g);
  assert.equal(g.fragments.length,2);
  assert.equal(g.fragments.every(f=>f.crossesCut),true);
  assert.equal(JSON.stringify(city),before);
});
test('025 P1/P2: concave L is partitioned into two connected properties with complete convex plots',()=>{
  const city=fixture(concave,[lower,upper]),before=JSON.stringify(city);
  const g=propertySplitGeometry025(city,'PROP-S',.3,3,.5);
  assertCoverage(concave,g);
  assert.ok(g.left.length>=5&&g.right.length>=5);
  assert.equal(JSON.stringify(city),before);
});
test('025 P1: a cut exiting and reentering concavity is rejected without mutating accepted geometry',()=>{
  const city=fixture(concave,[lower,upper]),before=JSON.stringify(city);
  const draft=propertySplitDraft025(city,'PROP-S',.8,3,.5);
  assert.equal(draft.cut.length,2);
  assert.throws(()=>propertySplitGeometry025(city,'PROP-S',.8,3,.5),/crosses or touches another property edge/);
  assert.equal(JSON.stringify(city),before);
});
test('025 P1: degenerate, sliver, invalid boundary and invalid exit edge fail closed',()=>{
  const city=fixture(rect,[squarePlot]);
  for(const [f,e,t] of [[.01,2,.5],[.5,0,.5],[.5,2,1],[.5,2,0],[0,2,.5]])
    assert.throws(()=>propertySplitGeometry025(city,'PROP-S',f,e,t));
  assert.equal(propertySplitGeometry025(city,'PROP-S',.5,2,.5).left.length,4);
});


test('a cut following the frontage and adjacent collinear boundary is rejected', () => {
  const boundary = [rect[0], {x: 20, y: 0}, ...rect.slice(1)];
  const city = fixture(boundary, [squarePlot]);
  assert.throws(() => propertySplitGeometry025(city, 'PROP-S', .5, 1, .5),
    /touches or follows the frontage or exit edge ambiguously/);
});
