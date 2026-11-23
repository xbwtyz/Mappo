import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { polygonSignedArea } from '../src/core/geometry.js';
import {
  S10_REGION_LIMITS, canonicalizeBuildingRegionsS10,
  createS10GeometryBudget, regionDepthS10
} from '../src/core/building-topology-s10.js';
import {
  canonicalizeBuildingComponentsS10, validateBuildingStructureS10
} from '../src/core/building-components-s10.js';
import {
  occupiedAreaS10, pointOccupancyS10,
  polygonIntersectionAreaS10, occupiedIntersectionAreaS10,
  occupiedRegionsOverlapS10, occupiedPlotAreaS10
} from '../src/core/building-occupancy-s10.js';
import {
  legacyBuildingShapeToS10, projectSimpleBuildingS10, reserveBuildingPartIdS10
} from '../src/core/building-geometry-adapter-s10.js';

const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const solid=(id,ring,parentId=null,componentId='BC-ROOT')=>
  ({id,kind:'solid',parentId,componentId,ring});
const voidRegion=(id,ring,parentId)=>({id,kind:'void',parentId,ring});
const geom=(...regions)=>({version:1,regions});
const components=[{id:'BC-ROOT',parentId:null}];
const tree=()=>geom(
  solid('root',rect(0,0,20,20)),
  voidRegion('courtyard',rect(4,4,12,12),'root'),
  solid('island',rect(8,8,4,4),'courtyard'),
  voidRegion('inner',rect(9,9,2,2),'island')
);
const clone=x=>JSON.parse(JSON.stringify(x));

test('S10-A P1/P2 canonical solid-void containment, deterministic order and no mutation',()=>{
  const original=tree(),before=JSON.stringify(original);
  const shuffled=geom(original.regions[2],original.regions[0],
    original.regions[3],original.regions[1]);
  const result=canonicalizeBuildingRegionsS10(shuffled);
  assert.deepEqual(result.regions.map(r=>r.id),['root','courtyard','island','inner']);
  assert.equal(regionDepthS10(result,'inner'),3);
  assert.equal(result.regions.length,4);
  assert.equal(JSON.stringify(original),before);
  assert.deepEqual(canonicalizeBuildingRegionsS10(result),result);
  assert.deepEqual(validateBuildingStructureS10(shuffled,components).components,components);
});

test('S10-A P2 rejects missing parents, cycles, wrong alternation, duplicate IDs and depth overflow',()=>{
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    voidRegion('a',rect(2,2,2,2),'missing'))),/missing parent/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    solid('a',rect(0,0,10,10),'b'),
    voidRegion('b',rect(2,2,5,5),'a'))),/cycle/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    voidRegion('wrong',rect(0,0,10,10),null))),/alternate/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    solid('r',rect(0,0,10,10)),solid('r',rect(15,0,3,3)))),/unique/);
  const deep=[solid('level-0',rect(0,0,200,200))];
  for(let i=1;i<=8;i++)deep.push((i%2?
    voidRegion('level-'+i,rect(i*4,i*4,200-i*8,200-i*8),'level-'+(i-1)):
    solid('level-'+i,rect(i*4,i*4,200-i*8,200-i*8),'level-'+(i-1))));
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(...deep)),/eight levels/);
});

test('S10-A P2 refuses touching, overlapping, intersecting or improperly contained rings',()=>{
  const outer=solid('r',rect(0,0,20,20));
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    outer,voidRegion('bad',rect(0,3,5,5),'r'))),/strictly inside/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    outer,voidRegion('a',rect(3,3,7,7),'r'),
    voidRegion('b',rect(8,4,7,7),'r'))),/overlap/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    outer,voidRegion('a',rect(3,3,4,4),'r'),
    voidRegion('b',rect(7,3,4,4),'r'))),/touch/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    solid('r1',rect(0,0,10,10)),solid('r2',rect(2,2,3,3)))),/contain/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    solid('r1',rect(0,0,10,10)),solid('r2',rect(10,0,4,4)))),/touch/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    solid('r',[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}]))),/ring/);
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    solid('r',[{x:0,y:0},{x:NaN,y:0},{x:0,y:5}]))),/invalid coordinates/);
});

test('S10-A P2 canonicalizes clockwise input without mutating the source',()=>{
  const input=geom(solid('r',rect(0,0,8,8).reverse()));
  const original=JSON.stringify(input);
  const normal=canonicalizeBuildingRegionsS10(input);
  assert.equal(polygonSignedArea(normal.regions[0].ring),64);
  assert.equal(JSON.stringify(input),original);
});

test('S10-A P4 components enforce one root, valid hierarchy and every solid assignment',()=>{
  const g=tree(),valid=[{id:'BC-ROOT',parentId:null},
    {id:'BC-PAVILION',parentId:'BC-ROOT',name:'Courtyard wing'}];
  const assigned=clone(g);assigned.regions[2].componentId='BC-PAVILION';
  const result=validateBuildingStructureS10(assigned,valid);
  assert.equal(result.components.length,2);
  assert.equal(result.geometry.regions[2].componentId,'BC-PAVILION');
  assert.throws(()=>canonicalizeBuildingComponentsS10([],g),/components/);
  assert.throws(()=>canonicalizeBuildingComponentsS10([
    {id:'a',parentId:null},{id:'b',parentId:null}],g),/exactly one/);
  assert.throws(()=>canonicalizeBuildingComponentsS10([
    {id:'BC-ROOT',parentId:null},{id:'c',parentId:'missing'}],g),/missing/);
  assert.throws(()=>canonicalizeBuildingComponentsS10([
    {id:'BC-ROOT',parentId:null},{id:'c1',parentId:'c2'},
    {id:'c2',parentId:'c1'}],g),/cycle/);
  assert.throws(()=>canonicalizeBuildingComponentsS10(components,{
    version:1,regions:[solid('r',rect(0,0,4,4),null,'missing')]}),/unknown component/);
});

test('S10-A P3 occupancy honors holes, nested islands and multiple roots',()=>{
  const g=tree();
  assert.equal(occupiedAreaS10(g),268);
  assert.equal(pointOccupancyS10(g,{x:2,y:2}),'solid');
  assert.equal(pointOccupancyS10(g,{x:6,y:6}),'void');
  assert.equal(pointOccupancyS10(g,{x:8.5,y:8.5}),'solid');
  assert.equal(pointOccupancyS10(g,{x:9.5,y:9.5}),'void');
  assert.equal(pointOccupancyS10(g,{x:4,y:6}),'boundary');
  assert.equal(pointOccupancyS10(g,{x:25,y:25}),'outside');
  const two=geom(solid('a',rect(0,0,10,10)),solid('b',rect(20,0,10,10)));
  assert.equal(occupiedAreaS10(two),200);
  assert.equal(pointOccupancyS10(two,{x:15,y:5}),'outside');
});

test('S10-A P3 actual occupied intersection allows independent courtyard occupant',()=>{
  const outer=geom(solid('outer',rect(0,0,20,20)),
    voidRegion('court',rect(4,4,12,12),'outer'));
  const pavilion=geom(solid('pav',rect(5,5,2,2)));
  const crossing=geom(solid('cross',rect(3,5,3,3)));
  assert.equal(occupiedIntersectionAreaS10(outer,pavilion),0);
  assert.equal(occupiedRegionsOverlapS10(outer,pavilion),false);
  assert.ok(occupiedIntersectionAreaS10(outer,crossing)>0);
  assert.equal(occupiedRegionsOverlapS10(outer,crossing),true);
  const isolated=geom(solid('isolated',rect(22,0,4,4)));
  assert.equal(occupiedRegionsOverlapS10(outer,isolated),false);
  assert.equal(occupiedRegionsOverlapS10(
    geom(solid('a',rect(0,0,10,10))),
    geom(solid('b',rect(10,0,5,5)))),false);
});

test('S10-A P3 polygon intersection is area-accurate for concavity and boundary contacts',()=>{
  const L=[{x:0,y:0},{x:8,y:0},{x:8,y:3},
    {x:3,y:3},{x:3,y:8},{x:0,y:8}];
  assert.equal(polygonSignedArea(L),39);
  assert.ok(Math.abs(polygonIntersectionAreaS10(L,rect(2,2,3,3))-5)<1e-6);
  assert.equal(polygonIntersectionAreaS10(rect(0,0,10,10),rect(10,2,3,3)),0);
  assert.ok(Math.abs(polygonIntersectionAreaS10(rect(0,0,10,10),rect(5,5,10,10))-25)<1e-6);
});

test('S10-A P3 occupied plot area accounts for hole and island parity',()=>{
  const g=tree();
  assert.equal(occupiedPlotAreaS10(g,rect(0,0,20,20)),268);
  assert.ok(Math.abs(occupiedPlotAreaS10(g,rect(0,0,10,10))-67)<1e-6);
  assert.ok(Math.abs(occupiedPlotAreaS10(g,rect(4,4,12,12))-12)<1e-6);
  assert.equal(occupiedPlotAreaS10(g,rect(22,22,4,4)),0);
});

test('S10-A P2/P3 malformed input and bounded work fail safely',()=>{
  const before=JSON.stringify(tree());
  assert.throws(()=>canonicalizeBuildingRegionsS10(geom(
    solid('overlong',Array.from({length:1025},(_,i)=>({x:i,y:i}))))),/1024/);
  assert.throws(()=>canonicalizeBuildingRegionsS10({
    version:2,regions:[solid('r',rect(0,0,4,4))]}),/version 1/);
  assert.throws(()=>occupiedPlotAreaS10(tree(),rect(0,0,10,10),
    createS10GeometryBudget(1)),/budget/);
  assert.equal(JSON.stringify(tree()),before);
  assert.equal(S10_REGION_LIMITS.maxRegions,128);
  assert.equal(S10_REGION_LIMITS.maxComponents,64);
});

test('S10-A P4 simple-footprint projection is detached, equivalent, and fails closed',()=>{
  const old={footprint:rect(0,0,20,20),holes:[rect(4,4,4,4)],
    customName:'Keep me'};
  const before=JSON.stringify(old);
  const result=legacyBuildingShapeToS10(old);
  const simple=projectSimpleBuildingS10(result.geometry,result.components);
  assert.equal(simple.ok,true);
  assert.deepEqual(simple.footprint,old.footprint);
  assert.deepEqual(simple.holes,old.holes);
  assert.equal(simple.area,384);
  simple.footprint[0].x=999;
  assert.equal(result.geometry.regions[0].ring[0].x,0);
  assert.equal(JSON.stringify(old),before);
  const multi=geom(solid('a',rect(0,0,5,5)),solid('b',rect(12,0,5,5)));
  assert.equal(projectSimpleBuildingS10(multi,components).code,'unsupported-topology');
  assert.equal(projectSimpleBuildingS10(tree(),components).code,'unsupported-topology');
  assert.equal(projectSimpleBuildingS10({
    version:1,regions:[solid('bad',rect(0,0,4,4),null,'missing')]
  },components).code,'invalid-topology');
  assert.throws(()=>legacyBuildingShapeToS10({...old,geometry:{opaque:true}}),/overwrite/);
  assert.throws(()=>legacyBuildingShapeToS10({...old,components:[]}),/overwrite/);
});

test('S10-A P4 deterministic scoped ID reservation does not mutate existing IDs',()=>{
  const used=new Set(['REG-MAN-000001','REG-MAN-000002','BC-MAN-000001']);
  assert.equal(reserveBuildingPartIdS10(used,'REG-MAN'),'REG-MAN-000003');
  assert.equal(reserveBuildingPartIdS10(used,'BC-MAN'),'BC-MAN-000002');
  assert.equal(used.size,3);
  assert.throws(()=>reserveBuildingPartIdS10(used,'other'),/known prefix/);
});

test('S10-A P4 adapter verifies existing generated schema-9 cities without touching them',()=>{
  for(const morphology of ['planned','organic','radial','linear']){
    const project=createProject({seed:'s10a-'+morphology,size:'small',morphology});
    const before=JSON.stringify(project);
    const buildings=project.city.buildings.slice(0,5);
    assert.ok(buildings.length>0);
    for(const building of buildings) {
      const adapted=legacyBuildingShapeToS10(building);
      const projected=projectSimpleBuildingS10(adapted.geometry,adapted.components);
      assert.equal(projected.ok,true);
      assert.deepEqual(projected.footprint,building.footprint);
      assert.deepEqual(projected.holes,building.holes);
      assert.ok(Math.abs(occupiedAreaS10(adapted.geometry)-building.area)<.02);
    }
    assert.equal(JSON.stringify(project),before);
    assert.equal(project.schemaVersion,9);
  }
});

test('S10-A P1 64 legacy courtyard holes fit the proposed 128-region budget',()=>{
  const holes=[];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)
    holes.push(rect(4+x*10,4+y*10,2,2));
  const original={footprint:rect(0,0,90,90),holes};
  const adapted=legacyBuildingShapeToS10(original);
  assert.equal(adapted.geometry.regions.length,65);
  assert.equal(occupiedAreaS10(adapted.geometry),8100-64*4);
  assert.equal(projectSimpleBuildingS10(adapted.geometry,adapted.components).holes.length,64);
});

test('S10-A P5 nested compatible metadata is deeply detached from canonical output',()=>{
  const g=geom({...solid('r',rect(0,0,12,12)),extensions:{notes:{author:'original'}}});
  g.extensions={history:{marker:1}};
  const c=[{id:'BC-ROOT',parentId:null,extensions:{label:{text:'original'}}}];
  const normalized=validateBuildingStructureS10(g,c);
  normalized.geometry.regions[0].extensions.notes.author='edited';
  normalized.geometry.extensions.history.marker=2;
  normalized.components[0].extensions.label.text='edited';
  assert.equal(g.regions[0].extensions.notes.author,'original');
  assert.equal(g.extensions.history.marker,1);
  assert.equal(c[0].extensions.label.text,'original');
});
test('S10-A P5 disjoint polygon intersection still rejects invalid input',()=>{
  const invalid=[{x:0,y:0},{x:5,y:5},{x:5,y:0},{x:0,y:5}];
  assert.throws(()=>polygonIntersectionAreaS10(invalid,rect(50,50,5,5)),/valid CCW/);
});
