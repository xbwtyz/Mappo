import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLareParcelCandidates } from '../src/core/reconciliation-parcels.js';
import { larePlotAdjacency,verifyLarePlotDeformation } from '../src/core/reconciliation-plots.js';
import { createLareBudget,LARE_LIMITS,LareBudgetExceeded } from '../src/core/reconciliation-budget.js';
import { validatePlotTiling027 } from '../src/core/plot-partition-027.js';
import { partitionPropertyPolygon024 } from '../src/core/property-polygons-024.js';
import { propertyGeometryPreview3I } from '../src/core/property-geometry.js';
import { propertyFits } from '../src/core/placement.js';

const rect=(l,f,r,b)=>[{x:l,y:f},{x:r,y:f},{x:r,y:b},{x:l,y:b}];
function fixture(boundary=rect(2,5,35,35),split=true){
  const points=rect(0,0,100,100),edges=points.map((a,i)=>({a,b:points[(i+1)%4],road:{id:'R'+i,kind:'lane'}}));
  const property={id:'P',blockId:'F',frontageRoadId:'R0',boundary,plotIds:split?['P1','P2']:['P1'],buildingIds:['B']};
  const plots=propertyGeometryPreview3I({properties:[property]},'P',boundary,split?[.5]:[]).plots
    .map(p=>({...p,propertyId:'P',blockId:'F',frontageRoadId:'R0'}));
  return {property,plots,edge:edges[0],edges,fixedRings:[rect(20,15,24,20)]};
}
const solve=(input)=>generateLareParcelCandidates(input,createLareBudget());
test('B1R independently trims one side without moving a fixed building',()=>{
  const input=fixture(),before=JSON.stringify(input),candidates=solve(input);
  assert.ok(candidates.length);
  assert.ok(candidates.some(c=>c.family==='independent-left'&&Math.abs(c.property.boundary[1].x-35)<1e-6));
  for(const c of candidates){assert.ok(propertyFits(c.property.boundary,input.edges.map(e=>e.a),input.edges));
    assert.deepEqual(c.plots.map(p=>p.id),input.property.plotIds);
    validatePlotTiling027(c.property.boundary,c.plots);}
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(candidates,solve(input));
});
test('B1R frontage sliding explores positions and retains fixed ownership',()=>{
  const input=fixture(rect(15,5,40,35));
  const c=solve(input);
  assert.ok(c.some(x=>x.family==='world-preserved'));
  assert.ok(c.some(x=>x.family==='frontage-slide'&&Math.abs(x.property.boundary[0].x-15)>1e-6));
  assert.ok(c.every(x=>x.property.frontageRoadId==='R0'&&x.property.blockId==='F'&&x.property.id==='P'));
  assert.ok(c.length<=LARE_LIMITS.parcelCandidates);
});
test('B1R taper keeps strip divider topology',()=>{
  const input=fixture(rect(15,5,45,35));
  const c=solve(input),t=c.find(x=>x.family.startsWith('taper-'));
  assert.ok(t);
  assert.deepEqual(larePlotAdjacency(t.plots,createLareBudget()),['P1|P2']);
  assert.equal(validatePlotTiling027(t.property.boundary,t.plots).plotCount,2);
});
test('B1R concave affine layout retains all flexible cells and adjacency',()=>{
  const input=fixture(rect(15,5,45,35));
  const boundary=[{x:15,y:5},{x:45,y:5},{x:45,y:35},{x:30,y:25},{x:15,y:35}];
  const plots=partitionPropertyPolygon024(boundary).map((boundary,i)=>({id:'Q'+i,boundary}));
  input.property={...input.property,boundary,plotIds:plots.map(p=>p.id)};
  input.plots=plots;
  const c=solve(input),expected=larePlotAdjacency(plots,createLareBudget());
  assert.ok(c.some(x=>x.family==='affine-shear'));
  for(const x of c){assert.equal(x.property.boundary.length,5);
    assert.deepEqual(larePlotAdjacency(x.plots,createLareBudget()),expected);
    validatePlotTiling027(x.property.boundary,x.plots);}
});
test('B1R fixed and decision-required parcels cannot be reshaped',()=>{
  const input=fixture();
  assert.deepEqual(solve({...input,mode:'fixed'}),[]);
  assert.deepEqual(solve({...input,mode:'decision-required'}),[]);
  assert.deepEqual(solve({...input,fixedRings:[rect(200,200,205,205)]}),[]);
});
test('B1R shared budget limits geometry work and plot identity is independently checked',()=>{
  const input=fixture();
  assert.throws(()=>generateLareParcelCandidates(input,createLareBudget({work:1,stateExpansions:1})),LareBudgetExceeded);
  const wrong=input.plots.map((p,i)=>({...p,id:'wrong'+i}));
  assert.throws(()=>verifyLarePlotDeformation(input.property.boundary,input.plots,wrong,createLareBudget()),/identity/);
});

test('B1R flexible mesh hinge changes a polygon non-affinely without splitting any plot',()=>{
  const input=fixture(rect(15,5,45,35));
  const boundary=[{x:15,y:5},{x:45,y:5},{x:45,y:20},{x:45,y:35},{x:30,y:25},{x:15,y:35},{x:15,y:20}];
  const plots=[
    {id:'LOW',boundary:rect(15,5,45,20)},
    {id:'LEFT',boundary:[{x:15,y:20},{x:30,y:20},{x:30,y:25},{x:15,y:35}]},
    {id:'RIGHT',boundary:[{x:30,y:20},{x:45,y:20},{x:45,y:35},{x:30,y:25}]}
  ];
  input.property={...input.property,boundary,plotIds:plots.map(p=>p.id)};input.plots=plots;
  const next=solve(input).find(c=>c.family==='polygon-hinge');
  assert.ok(next,'Expected safe non-affine hinge');
  assert.deepEqual(next.plots.map(p=>p.id),plots.map(p=>p.id));
  assert.deepEqual(larePlotAdjacency(next.plots,createLareBudget()),larePlotAdjacency(plots,createLareBudget()));
  assert.equal(validatePlotTiling027(next.property.boundary,next.plots).plotCount,3);
  assert.ok(Math.abs(next.property.boundary[3].x-boundary[3].x)>1e-6);
});
