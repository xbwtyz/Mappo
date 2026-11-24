// Read-only capacity audit, not a solver or a relaxation of production policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createProject } from '../src/core/city-model.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { prepareRoadGroupIntentB1,readRoadGroupTopologyB1 } from '../src/core/road-intent-c1.js';
import { createLareContext } from '../src/core/reconciliation-context.js';
import { createLareBudget } from '../src/core/reconciliation-budget.js';
import { occupiedAreaS10 } from '../src/core/building-occupancy-s10.js';
import { boundsOf,pointInPolygon,polygonSignedArea } from '../src/core/geometry.js';
import { distanceToSegment } from '../src/core/boundary.js';
import { STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK } from '../src/core/placement.js';

const roads=['RD-0184','RD-0186'],delta={x:-3.005274072121821,y:-37.39896113564458};
const hash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const eps=1e-5;
const sum=a=>a.reduce((n,v)=>n+v,0);

// Conservative upper bound via a covering grid. Only exclude a cell when
// its entire closed square is outside the block, or entirely within one
// forbidden road-setback capsule. Distance to a segment is 1-Lipschitz.
// The half diagonal provides a conservative distance bound on every point.
// Retain boundary/uncertain cells in full. No concave-block half-plane
// intersection is treated as an upper bound.
function gridUpper(ring,edges,h){
  const box=boundsOf(ring),r=Math.SQRT2*h/2;
  const nx=Math.ceil((box.maxX-box.minX)/h)+2,ny=Math.ceil((box.maxY-box.minY)/h)+2;
  assert.ok(nx*ny<2000000,'Grid research cap');
  let cells=0,outside=0,setback=0;
  for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
    const p={x:box.minX+(ix-.5)*h,y:box.minY+(iy-.5)*h};
    const ds=edges.map(e=>distanceToSegment(p,e.a,e.b));
    if(!pointInPolygon(p,ring)&&Math.min(...ds)>r+eps){outside++;continue;}
    if(edges.some((e,i)=>ds[i]+r<e.margin-eps)){setback++;continue;}
    cells++;
  }
  const raw=Math.abs(polygonSignedArea(ring));
  return {h,upper:Math.min(raw,cells*h*h)+eps,cells,outside,setback};
}

test('read-only Cinderdale-settings capacity and frontage audit',()=>{
  const summary=[];
  for(const irregularProperties of [false,true]){
    const project=createProject({seed:'mappo-001',size:'medium',morphology:'organic',
      shapeOptions:{profile:'balanced',stretch:30,asymmetry:58,bend:44},irregularProperties});
    validateStoredProject(project);
    const before=hash(project),city=project.city;
    const roadIndex=new Map(city.roads.map(r=>[[r.a,r.b].sort().join(':'),r]));
    const sourceBuildings=new Map(city.buildings.map(b=>[b.id,b]));
    const sourceNodes=new Map(city.nodes.map(n=>[n.id,n]));
    const areas=new Map(city.buildings.map(b=>[b.id,occupiedAreaS10(b.geometry)]));
    for(const scale of [0.025,0.125,.25,.5,.75,1,-.25,-.5,-1]){
      const offset={x:delta.x*scale,y:delta.y*scale};
      const draft=prepareRoadGroupIntentB1(project,roads,offset);
      const topology=readRoadGroupTopologyB1(project,draft);
      assert.ok(topology?.graph.valid&&topology?.faces.valid&&topology?.identity.valid,'Expected unchanged road/face topology');
      const context=createLareContext(project,draft,new Map(),createLareBudget());
      const props=new Map(context.properties.map(p=>[p.id,p]));
      const nodes=topology.graph.nodesById;
      const rows=[];
      for(const id of context.blockIds){
        const block=city.blocks.find(b=>b.id===id);
        const ring=block.vertices.map(v=>nodes.get(v));
        const edges=block.vertices.map((v,i)=>{
          const w=block.vertices[(i+1)%block.vertices.length],road=roadIndex.get([v,w].sort().join(':'));
          assert.ok(road&&Number.isFinite(STREET_WIDTHS[road.kind]));
          return {a:nodes.get(v),b:nodes.get(w),road,margin:(STREET_WIDTHS[road.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK};
        });
        const oldRing=block.vertices.map(v=>sourceNodes.get(v));
        const originalArea=Math.abs(polygonSignedArea(oldRing)),area=Math.abs(polygonSignedArea(ring));
        const resolutions=[1,.5,.25].map(h=>gridUpper(ring,edges,h));
        const upper=Math.min(...resolutions.map(r=>r.upper));
        const buildings=city.buildings.filter(b=>b.blockId===id);
        const movable=buildings.filter(b=>props.get(b.propertyId)?.buildings.find(p=>p.id===b.id)?.mode==='rigid');
        const movableIds=new Set(movable.map(b=>b.id));
        const rigidArea=sum(buildings.map(b=>areas.get(b.id)));
        const movableArea=sum(movable.map(b=>areas.get(b.id))),fixedArea=rigidArea-movableArea;
        const scenarios=[1,.95,.9,.8].map(factor=>{
          const required=fixedArea+movableArea*factor*factor;
          // Allow the model's tiny occupied-area overlap tolerance and
          // numerical slack. An excess is a necessary-capacity failure,
          // not a packing proof. Passing is only "not ruled out".
          const slack=.01+buildings.length*(buildings.length-1)*1e-5/2;
          return {factor,required,headroom:upper-required,areaRuledOut:required>upper+slack};
        });
        const frontage=city.properties.filter(p=>p.blockId===id).map(p=>{
          const edge=edges.find(e=>e.road.id===p.frontageRoadId);
          assert.ok(edge);
          const length=Math.hypot(edge.b.x-edge.a.x,edge.b.y-edge.a.y);
          const oldLen=Math.hypot(sourceNodes.get(edge.road.a).x-sourceNodes.get(edge.road.b).x,
            sourceNodes.get(edge.road.a).y-sourceNodes.get(edge.road.b).y);
          const width=Math.hypot(p.boundary[1].x-p.boundary[0].x,p.boundary[1].y-p.boundary[0].y);
          const minimum=Math.min(7,width);
          return {id:p.id,road:p.frontageRoadId,length,oldLen,width,minimum,shorterThanMinimum:length<minimum-eps};
        });
        const row={block:id,originalArea,area,upper,buildings:buildings.length,movable:movable.length,
          fixedArea,movableArea,rigidArea,scenarios,resolutions,
          requiredMinimumFactorUpper:movableArea>0?Math.sqrt(Math.max(0,(upper-fixedArea)/movableArea)):null,
          frontage:frontage.filter(f=>f.shorterThanMinimum),
          shortestFrontages:frontage.slice().sort((a,b)=>a.length/b.minimum-b.length/a.minimum).slice(0,3)};
        rows.push(row);
        console.log('FEASIBILITY_BLOCK '+JSON.stringify({irregularProperties,scale,...row}));
      }
      const known=[.025,.125,.25,.5,-.25].includes(scale);
      const report={irregularProperties,scale,known,blocks:rows.length,
        ruledOutAt: [1,.95,.9,.8].map(factor=>({factor,blocks:rows.filter(r=>r.scenarios.find(s=>s.factor===factor).areaRuledOut).map(r=>r.block)})),
        frontageTooShort:rows.flatMap(r=>r.frontage.map(f=>f.id)),
        tightest:rows.slice().sort((a,b)=>a.scenarios[0].headroom-b.scenarios[0].headroom).slice(0,3)
          .map(r=>({block:r.block,upper:r.upper,required:r.rigidArea,headroom:r.scenarios[0].headroom}))};
      // A bound must not rule out known full-size strict witnesses.
      if([.025,.125,-.25].includes(scale))assert.equal(report.ruledOutAt[0].blocks.length,0,'Upper bound contradicted strict witness');
      assert.equal(hash(project),before,'Audit mutated project');
      summary.push(report);
      console.log('FEASIBILITY_CASE '+JSON.stringify(report));
    }
  }
  assert.equal(summary.length,18);
  console.log('FEASIBILITY_SUMMARY '+JSON.stringify({cases:summary.length,unresolved:summary.filter(s=>!s.known).length,
    areaRuledOut:summary.filter(s=>!s.known).map(s=>({irregularProperties:s.irregularProperties,scale:s.scale,ruledOutAt:s.ruledOutAt,frontageTooShort:s.frontageTooShort}))}));
});
