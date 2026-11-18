import { polygonSignedArea, pointInPolygon } from './geometry.js';
import { insideOrOn, segmentCuts, clearance } from './boundary.js';
import { previewBuildingGeometry } from './building-transform.js';

// Read-only, shape-accurate checks for a single edited building. No schema
// changes and no mutation of accepted city records.
const B3GC_SHAPE_EPS = 1e-7;
const b3gcShapeEdge = (polygon, i) => [polygon[i], polygon[(i + 1) % polygon.length]];
const b3gcShapeMid = (a, b) => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2 });
const b3gcShapeCross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

function b3gcProperCross(a,b,c,d) {
  const ab1=b3gcShapeCross(a,b,c),ab2=b3gcShapeCross(a,b,d),cd1=b3gcShapeCross(c,d,a),cd2=b3gcShapeCross(c,d,b);
  return ab1*ab2 < -B3GC_SHAPE_EPS*B3GC_SHAPE_EPS && cd1*cd2 < -B3GC_SHAPE_EPS*B3GC_SHAPE_EPS;
}

export function shapeWellFormed(points) {
  if (!Array.isArray(points) || points.length<3 || points.length>1024 ||
      !points.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
        Math.abs(p.x)<10000 && Math.abs(p.y)<10000)) return false;
  if (polygonSignedArea(points)<=B3GC_SHAPE_EPS) return false;
  for(let i=0;i<points.length;i++){
    const [a,b]=b3gcShapeEdge(points,i);
    if (Math.hypot(a.x-b.x,a.y-b.y)<B3GC_SHAPE_EPS) return false;
    for(let j=i+2;j<points.length;j++){
      if (i===0 && j===points.length-1) continue;
      const [c,d]=b3gcShapeEdge(points,j);
      if (segmentCuts(a,b,c,d).length) return false;
    }
  }
  return true;
}

export function shapeContained(inner, outer) {
  if (!inner.length || !outer?.length || !inner.every(p=>insideOrOn(p,outer))) return false;
  for(let i=0;i<inner.length;i++){
    const [a,b]=b3gcShapeEdge(inner,i);
    if(!insideOrOn(b3gcShapeMid(a,b),outer)) return false;
    for(let j=0;j<outer.length;j++){
      const [c,d]=b3gcShapeEdge(outer,j);
      if(b3gcProperCross(a,b,c,d)) return false;
    }
  }
  return true;
}

const b3gcStrictInterior=(p,poly)=>pointInPolygon(p,poly)&&clearance(p,poly)>B3GC_SHAPE_EPS;
export function shapesOverlapInterior(a,b) {
  // Touching boundaries are okay. Concavity, full containment and
  // intersecting edges are checked without approximating a bounding box.
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    if(b3gcProperCross(...b3gcShapeEdge(a,i),...b3gcShapeEdge(b,j))) return true;
  }
  for(const [own,other] of [[a,b],[b,a]]){
    for(let i=0;i<own.length;i++){
      const [p,q]=b3gcShapeEdge(own,i),m=b3gcShapeMid(p,q);
      if(b3gcStrictInterior(p,other)||b3gcStrictInterior(m,other)) return true;
      const len=Math.hypot(q.x-p.x,q.y-p.y);
      if(len<B3GC_SHAPE_EPS) return true;
      const inside={x:m.x-(q.y-p.y)/len*1e-4,y:m.y+(q.x-p.x)/len*1e-4};
      if(b3gcStrictInterior(inside,own)&&b3gcStrictInterior(inside,other)) return true;
    }
  }
  return false;
}

export function inspectBuildingGeometry(city, buildingId, transform) {
  const issues=[];
  const fail=(code,message,targetId=null)=>issues.push({code,message,targetId});
  const source=city?.buildings?.find(b=>b.id===buildingId);
  const property=city?.properties?.find(p=>p.id===source?.propertyId);
  if(!source||!property||!(property.buildingIds??[]).includes(buildingId)){
    fail('missing','The selected building or its parent property no longer exists.');
    return {ok:false,issues,preview:null,property:null};
  }
  let preview;
  try{preview=previewBuildingGeometry(source,transform);}
  catch(error){
    fail('transform',error.message);
    return {ok:false,issues,preview:null,property};
  }
  if(!shapeWellFormed(preview.footprint)||preview.area<=1)
    fail('shape','Building footprint is self-crossing, reversed, degenerate, or too small.');
  if(shapeWellFormed(preview.footprint)&&!shapeContained(preview.footprint,property.boundary))
    fail('property','Building extends outside its property boundary.',property.id);
  for(const hole of preview.holes??[]){
    if(!shapeWellFormed(hole) || !shapeContained(hole,preview.footprint)
      || hole.some(p=>clearance(p,preview.footprint)<=1e-6)){
      fail('courtyard','A courtyard is malformed or touches the outer footprint.');
      break;
    }
  }
  const holes=preview.holes??[];
  for(let i=0;i<holes.length;i++)for(let j=i+1;j<holes.length;j++)
    if(shapesOverlapInterior(holes[i],holes[j]))
      fail('courtyard','Courtyard holes cannot overlap.');
  if(shapeWellFormed(preview.footprint)){
    for(const neighbor of city.buildings){
      if(neighbor.id===buildingId||neighbor.propertyId!==property.id)continue;
      if(shapesOverlapInterior(preview.footprint,neighbor.footprint))
        fail('collision',`Building overlaps ${neighbor.id}.`,neighbor.id);
    }
  }
  return {ok:!issues.length,issues,preview,property};
}
