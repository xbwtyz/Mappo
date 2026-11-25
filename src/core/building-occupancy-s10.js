// S10-A read-only occupancy calculations for alternating solid/void regions.
// Polygon intersections are computed from deterministic ear-clipped triangles,
// not sampled bounding boxes or signed-s10OccupancyArea approximations.
import { polygonSignedArea, pointInPolygon } from './geometry.js';
import { shapeWellFormed } from './building-validation.js';
import { validateBuildingStructureS10 } from './building-components-s10.js';
import {
  canonicalizeBuildingRegionsS10, createS10GeometryBudget,
  pointOnS10Ring, regionDepthS10
} from './building-topology-s10.js';

const S10_OCCUPANCY_EPS=1e-9;
const s10OccupancyCross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const s10OccupancyArea=poly=>Math.abs(polygonSignedArea(poly));
const s10OccupancyBBox=ring=>({
  minX:Math.min(...ring.map(p=>p.x)),minY:Math.min(...ring.map(p=>p.y)),
  maxX:Math.max(...ring.map(p=>p.x)),maxY:Math.max(...ring.map(p=>p.y))
});
const s10OccupancySeparated=(a,b)=>a.maxX<=b.minX+S10_OCCUPANCY_EPS||b.maxX<=a.minX+S10_OCCUPANCY_EPS||
  a.maxY<=b.minY+S10_OCCUPANCY_EPS||b.maxY<=a.minY+S10_OCCUPANCY_EPS;

function s10OccupancyTriangulate(ring,budget) {
  if(!shapeWellFormed(ring))throw Error('S10 intersection requires a valid CCW ring.');
  const active=ring.map((_,i)=>i);
  // Collinear points affect historical coordinates but not triangulation.
  let trimmed=true;
  while(trimmed&&active.length>3) {
    trimmed=false;
    for(let j=0;j<active.length;j++) {
      const a=ring[active[(j+active.length-1)%active.length]],
        b=ring[active[j]],c=ring[active[(j+1)%active.length]];
      budget.charge();
      if(Math.abs(s10OccupancyCross(a,b,c))>S10_OCCUPANCY_EPS)continue;
      const dot=(b.x-a.x)*(b.x-c.x)+(b.y-a.y)*(b.y-c.y);
      if(dot<=S10_OCCUPANCY_EPS){active.splice(j,1);trimmed=true;break;}
    }
  }
  const tris=[];
  while(active.length>3){
    let cut=false;
    for(let j=0;j<active.length;j++) {
      const ia=active[(j+active.length-1)%active.length],
        ib=active[j],ic=active[(j+1)%active.length];
      const a=ring[ia],b=ring[ib],c=ring[ic];
      budget.charge();
      if(s10OccupancyCross(a,b,c)<=S10_OCCUPANCY_EPS)continue;
      let blocked=false;
      for(const id of active){
        if(id===ia||id===ib||id===ic)continue;
        budget.charge();
        const p=ring[id];
        if(s10OccupancyCross(a,b,p)>=-S10_OCCUPANCY_EPS&&s10OccupancyCross(b,c,p)>=-S10_OCCUPANCY_EPS&&s10OccupancyCross(c,a,p)>=-S10_OCCUPANCY_EPS){
          blocked=true;break;
        }
      }
      if(blocked)continue;
      tris.push([a,b,c]);active.splice(j,1);cut=true;break;
    }
    if(!cut)throw Error('S10 deterministic triangulation cannot prove a valid partition.');
  }
  const tail=active.map(i=>ring[i]);
  if(polygonSignedArea(tail)<=S10_OCCUPANCY_EPS)throw Error('S10 triangulation has a degenerate final cell.');
  tris.push(tail);
  const total=tris.reduce((sum,t)=>sum+polygonSignedArea(t),0);
  if(Math.abs(total-polygonSignedArea(ring))>0.005)
    throw Error('S10 triangulation does not conserve s10OccupancyArea.');
  return tris;
}

function s10OccupancyClipConvex(subject,clip) {
  let poly=subject;
  for(let i=0;i<clip.length;i++) {
    const a=clip[i],b=clip[(i+1)%clip.length];
    if(!poly.length)break;
    const next=[];
    for(let j=0;j<poly.length;j++){
      const p=poly[j],q=poly[(j+1)%poly.length];
      const sp=s10OccupancyCross(a,b,p),sq=s10OccupancyCross(a,b,q);
      const pin=sp>=-S10_OCCUPANCY_EPS,qin=sq>=-S10_OCCUPANCY_EPS;
      if(pin)next.push(p);
      if(pin!==qin){
        const t=sp/(sp-sq);
        next.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
      }
    }
    poly=next;
  }
  return poly.length>=3?s10OccupancyArea(poly):0;
}

function s10OccupancyRingIntersection(a,b,budget) {
  if(s10OccupancySeparated(s10OccupancyBBox(a),s10OccupancyBBox(b)))return 0;
  const ta=s10OccupancyTriangulate(a,budget),tb=s10OccupancyTriangulate(b,budget);
  let sum=0;
  for(const x of ta)for(const y of tb){
    budget.charge();
    if(!s10OccupancySeparated(s10OccupancyBBox(x),s10OccupancyBBox(y)))sum+=s10OccupancyClipConvex(x,y);
  }
  const max=Math.min(s10OccupancyArea(a),s10OccupancyArea(b));
  if(sum>max+0.02)throw Error('S10 polygon intersection exceeded its source s10OccupancyArea.');
  return Math.min(max,Math.max(0,sum));
}

export function polygonIntersectionAreaS10(a,b,budget=createS10GeometryBudget()) {
  if(!shapeWellFormed(a)||!shapeWellFormed(b))
    throw Error('S10 polygon intersection requires valid CCW rings.');
  return s10OccupancyRingIntersection(a,b,budget);
}

function s10OccupancyCanonicalArea(valid) {
  const value=valid.regions.reduce((sum,r)=>sum+
    (r.kind==='solid'?1:-1)*polygonSignedArea(r.ring),0);
  if(value<=1)throw Error('S10 building net occupied s10OccupancyArea must exceed one unit.');
  return value;
}
export function occupiedAreaS10(geometry,budget=createS10GeometryBudget()) {
  return s10OccupancyCanonicalArea(canonicalizeBuildingRegionsS10(geometry,budget));
}

export function pointOccupancyS10(geometry,point,budget=createS10GeometryBudget()) {
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))
    throw Error('S10 occupancy requires finite coordinates.');
  const valid=canonicalizeBuildingRegionsS10(geometry,budget);
  let found=null;
  for(const region of valid.regions){
    if(pointOnS10Ring(point,region.ring))return 'boundary';
    budget.charge(region.ring.length);
    if(pointInPolygon(point,region.ring)) {
      const d=regionDepthS10(valid,region.id);
      if(!found||d>found.depth)found={depth:d,kind:region.kind};
    }
  }
  return found?.kind??'outside';
}

// The sum of signed ring intersections equals the intersection of actual
// occupied indicator functions, including islands in voids.
function s10OccupancySignedIntersection(a,b,budget) {
  let total=0;
  for(const ra of a.regions)for(const rb of b.regions) {
    if(s10OccupancySeparated(s10OccupancyBBox(ra.ring),s10OccupancyBBox(rb.ring)))continue;
    const sign=(ra.kind==='solid'?1:-1)*(rb.kind==='solid'?1:-1);
    total+=sign*s10OccupancyRingIntersection(ra.ring,rb.ring,budget);
  }
  if(total<-.02)throw Error('S10 intersection produced negative occupied s10OccupancyArea.');
  return Math.max(0,total);
}

export function occupiedIntersectionAreaS10(first,second,budget=createS10GeometryBudget()) {
  const a=canonicalizeBuildingRegionsS10(first,budget);
  const b=canonicalizeBuildingRegionsS10(second,budget);
  return s10OccupancySignedIntersection(a,b,budget);
}
export function occupiedRegionsOverlapS10(first,second,budget=createS10GeometryBudget()) {
  return occupiedIntersectionAreaS10(first,second,budget)>1e-5;
}
function s10OccupancyCanonicalPlotArea(valid,plotRing,budget) {
  let total=0;
  for(const region of valid.regions) {
    const sign=region.kind==='solid'?1:-1;
    total+=sign*s10OccupancyRingIntersection(region.ring,plotRing,budget);
  }
  if(total<-.02)throw Error('S10 occupied plot s10OccupancyArea is negative.');
  return Math.max(0,total);
}

export function occupiedPlotAreaS10(geometry,plotRing,budget=createS10GeometryBudget()) {
  if(!shapeWellFormed(plotRing))throw Error('S10 plot requires a valid CCW polygon.');
  return s10OccupancyCanonicalPlotArea(canonicalizeBuildingRegionsS10(geometry,budget),plotRing,budget);
}

// S2-B: one freshly verified canonical structure per building in a single
// full-project validation. No cached result, caller-supplied proof or public
// unchecked occupancy path. Each plot retains its own topology work charge
// and exact intersection checks, including shape validation.
export function measureBuildingOccupancyS10(geometry,components,plotRings) {
  const topologyBudget=createS10GeometryBudget();
  const structure=validateBuildingStructureS10(geometry,components,topologyBudget);
  const valid=structure.geometry;
  const plotAreas=plotRings.map(ring=>{
    if(!shapeWellFormed(ring))throw Error('S10 plot requires a valid CCW polygon.');
    const budget=createS10GeometryBudget();
    budget.charge(topologyBudget.spent);
    return s10OccupancyCanonicalPlotArea(valid,ring,budget);
  });
  return {geometry:valid,area:s10OccupancyCanonicalArea(valid),plotAreas};
}
