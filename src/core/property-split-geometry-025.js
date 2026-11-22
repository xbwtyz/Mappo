import { polygonSignedArea } from './geometry.js';
import { segmentCuts } from './boundary.js';
import { shapeContained, shapeWellFormed, shapesOverlapInterior } from './building-validation.js';
import { PROPERTY_VERTEX_LIMIT_024 } from './property-polygons-024.js';

// B02: deterministic straight-cut geometry. This is an extension of E2, not
// another property editor or a competing polygon representation.
const EPS=1e-7;
const clone=p=>({x:p.x,y:p.y});
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const close=(a,b)=>distance(a,b)<EPS;

function cleanPolygon(points) {
  let next=[];
  for(const p of points)if(!next.length||!close(next.at(-1),p))next.push(clone(p));
  if(next.length>1&&close(next[0],next.at(-1)))next.pop();
  for(let pass=0;pass<points.length&&next.length>3;pass++){
    let removed=false;
    for(let i=0;i<next.length;i++){
      const a=next[(i+next.length-1)%next.length],b=next[i],c=next[(i+1)%next.length];
      if(Math.abs(cross(a,c,b))<EPS && (b.x-a.x)*(b.x-c.x)+(b.y-a.y)*(b.y-c.y)<=EPS){
        next.splice(i,1);removed=true;break;
      }
    }
    if(!removed)break;
  }
  return next;
}

function clipConvexHalfPlane(polygon,a,b,side) {
  let result=[];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length];
    const dp=side*cross(a,b,p),dq=side*cross(a,b,q);
    const insideP=dp>=-EPS,insideQ=dq>=-EPS;
    if(insideP!==insideQ) {
      const ratio=dp/(dp-dq);
      if(!Number.isFinite(ratio))throw Error('Cut intersects plot at an ambiguous position.');
      result.push(lerp(p,q,Math.max(0,Math.min(1,ratio))));
    }
    if(insideQ)result.push(clone(q));
  }
  return result.length>=3?cleanPolygon(result):[];
}

// Returns a read-only draft even when Apply should reject the cut. The
// source frontage remains boundary[0] -> boundary[1].
export function propertySplitDraft025(city,propertyId,frontT=.5,exitEdge=2,exitT=.5) {
  const source=city?.properties?.find(p=>p.id===propertyId);
  const boundary=source?.boundary;
  if(!source||!Array.isArray(boundary)||boundary.length<3||boundary.length>PROPERTY_VERTEX_LIMIT_024||
     !shapeWellFormed(boundary))throw Error('The selected property needs a valid simple 3–12 corner boundary.');
  if(!Number.isFinite(frontT)||frontT<=0||frontT>=1||
     !Number.isInteger(exitEdge)||exitEdge<1||exitEdge>=boundary.length||
     !Number.isFinite(exitT)||exitT<=0||exitT>=1)
    throw Error('Choose an interior frontage point and an interior point on a different boundary edge.');
  const front=lerp(boundary[0],boundary[1],frontT);
  const exit=lerp(boundary[exitEdge],boundary[(exitEdge+1)%boundary.length],exitT);
  const right=[front,...boundary.slice(1,exitEdge+1),exit].map(clone);
  const left=[boundary[0],front,exit,...boundary.slice(exitEdge+1)].map(clone);
  return {propertyId,source,boundary,left,right,cut:[front,exit],frontT,exitEdge,exitT,
    t:frontT,flexible:true};
}

export function propertySplitGeometry025(city,propertyId,frontT=.5,exitEdge=2,exitT=.5) {
  const draft=propertySplitDraft025(city,propertyId,frontT,exitEdge,exitT);
  const {source,boundary,left,right,cut}=draft;
  for(let i=0;i<boundary.length;i++){
    const cuts=segmentCuts(cut[0],cut[1],boundary[i],boundary[(i+1)%boundary.length]);
    if(i===0||i===exitEdge){
      if(cuts.length!==1||Math.abs(cuts[0]-(i===0?0:1))>1e-6)
        throw Error('The cut touches or follows the frontage or exit edge ambiguously.');
    }else if(cuts.length){
      throw Error('The divider crosses or touches another property edge. Choose a different exit edge.');
    }
  }
  if(!shapeWellFormed(left)||!shapeWellFormed(right)||
      left.length>PROPERTY_VERTEX_LIMIT_024||right.length>PROPERTY_VERTEX_LIMIT_024)
    throw Error('The divider would not create two valid connected 3–12 corner properties.');
  if(!shapeContained(left,boundary)||!shapeContained(right,boundary)||
      shapesOverlapInterior(left,right))
    throw Error('The divider would leave or overlap the source property.');
  const areaLeft=polygonSignedArea(left),areaRight=polygonSignedArea(right);
  if(areaLeft<60||areaRight<60||distance(left[0],left[1])<7||distance(right[0],right[1])<7)
    throw Error('Both new properties need at least 7 units of street frontage and 60 square units of area.');
  if(Math.abs(areaLeft+areaRight-polygonSignedArea(boundary))>.02)
    throw Error('The proposed division does not conserve the original property area.');
  const stored=new Map(city.plots.map(p=>[p.id,p]));
  const fragments=[];
  for(const id of source.plotIds){
    const plot=stored.get(id);
    if(!plot||plot.propertyId!==propertyId||!shapeWellFormed(plot.boundary))
      throw Error('A source plot is missing or invalid.');
    const area=polygonSignedArea(plot.boundary);
    const leftPoly=clipConvexHalfPlane(plot.boundary,...cut,1);
    const rightPoly=clipConvexHalfPlane(plot.boundary,...cut,-1);
    const leftArea=leftPoly.length>=3?polygonSignedArea(leftPoly):0;
    const rightArea=rightPoly.length>=3?polygonSignedArea(rightPoly):0;
    if(Math.abs(leftArea+rightArea-area)>.02)
      throw Error('The divider cannot conserve the original plot area.');
    if((leftArea>EPS&&leftArea<.02)||(rightArea>EPS&&rightArea<.02))
      throw Error('The divider creates an unusably narrow plot fragment.');
    if(leftArea>.02 && rightArea>.02){
      if(!shapeWellFormed(leftPoly)||!shapeWellFormed(rightPoly))
        throw Error('The cut creates an invalid plot fragment.');
      fragments.push({side:'left',originalId:id,boundary:leftPoly,crossesCut:true});
      fragments.push({side:'right',originalId:id,boundary:rightPoly,crossesCut:true});
    }else if(leftArea>.02){
      fragments.push({side:'left',originalId:id,boundary:plot.boundary.map(clone),crossesCut:false});
    }else if(rightArea>.02){
      fragments.push({side:'right',originalId:id,boundary:plot.boundary.map(clone),crossesCut:false});
    }else throw Error('The divider cannot preserve a source plot.');
  }
  const leftFragments=fragments.filter(f=>f.side==='left'),rightFragments=fragments.filter(f=>f.side==='right');
  const sum=rows=>rows.reduce((value,f)=>value+polygonSignedArea(f.boundary),0);
  if(!leftFragments.length||!rightFragments.length||
      Math.abs(sum(leftFragments)-areaLeft)>.02||Math.abs(sum(rightFragments)-areaRight)>.02||
      fragments.some(f=>!shapeWellFormed(f.boundary)))
    throw Error('The divider cannot safely cover both successor properties with convex plots.');
  return {...draft,areaLeft,areaRight,
    frontageLengthLeft:distance(left[0],left[1]),frontageLengthRight:distance(right[0],right[1]),
    fragments};
}
