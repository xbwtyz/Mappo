import { polygonSignedArea } from './geometry.js';
import { shapeWellFormed } from './building-validation.js';

// Canonical bounded geometry used by authoring and generation. Polygon
// storage retains CCW winding, one frontage edge and schema-9 coordinates.
export const PROPERTY_VERTEX_LIMIT_024 = 12;
const EPS = 1e-7;
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const clone = poly => poly.map(p => ({x:p.x,y:p.y}));
export function convexPropertyPolygon024(poly) {
  if (!shapeWellFormed(poly)) return false;
  return poly.every((p,i) => cross(p,poly[(i+1)%poly.length],poly[(i+2)%poly.length]) >= -EPS);
}
const inTriangle = (p,a,b,c) => cross(a,b,p)>=-EPS && cross(b,c,p)>=-EPS && cross(c,a,p)>=-EPS;

export function partitionPropertyPolygon024(boundary) {
  if (!shapeWellFormed(boundary) || boundary.length>PROPERTY_VERTEX_LIMIT_024)
    throw Error('Property needs a valid, hole-free polygon of 3–12 corners.');
  // Convex polygons need no internal subdivision and retain a single cell.
  if (convexPropertyPolygon024(boundary)) return [clone(boundary)];
  // Deterministic ear clipping, with collinear boundary points omitted only
  // from the partition (not from the saved property polygon).
  const indices=boundary.map((_,i)=>i);
  let trimmed=true;
  while(trimmed && indices.length>3){
    trimmed=false;
    for(let i=0;i<indices.length;i++){
      const a=boundary[indices[(i+indices.length-1)%indices.length]];
      const b=boundary[indices[i]];
      const c=boundary[indices[(i+1)%indices.length]];
      if(Math.abs(cross(a,b,c))>EPS)continue;
      indices.splice(i,1);trimmed=true;break;
    }
  }
  const cells=[];
  while(indices.length>3){
    let selected=-1;
    for(let i=0;i<indices.length;i++){
      const pa=indices[(i+indices.length-1)%indices.length],pb=indices[i],pc=indices[(i+1)%indices.length];
      const a=boundary[pa],b=boundary[pb],c=boundary[pc];
      if(cross(a,b,c)<=EPS)continue;
      if(indices.some(id=>id!==pa&&id!==pb&&id!==pc&&inTriangle(boundary[id],a,b,c)))continue;
      selected=i;
      cells.push([a,b,c].map(p=>({x:p.x,y:p.y})));
      break;
    }
    if(selected<0)throw Error('A safe convex plot partition cannot be proven.');
    indices.splice(selected,1);
  }
  cells.push(indices.map(i=>({x:boundary[i].x,y:boundary[i].y})));
  const total=cells.reduce((sum,c)=>sum+polygonSignedArea(c),0);
  if(cells.some(c=>polygonSignedArea(c)<.02) ||
     Math.abs(total-polygonSignedArea(boundary))>.005)
    throw Error('The polygon would require degenerate or incomplete plots.');
  return cells;
}

// Stable within one candidate. The old IDs are offered first; new IDs are
// reserved from the existing city index. Consumers must explicitly approve
// retirement or retiling of authored records before accepting the candidate.
export function propertyPolygonPreview024(city,propertyId,boundary) {
  const property=city?.properties?.find(p=>p.id===propertyId);
  if(!property)throw Error('The selected property was not found.');
  if(JSON.stringify(boundary)===JSON.stringify(property.boundary)){
    const original=property.plotIds.map(id=>city.plots.find(plot=>plot.id===id&&plot.propertyId===propertyId));
    if(original.some(plot=>!plot))throw Error('Original plot records are incomplete.');
    return {propertyId,boundary:clone(boundary),
      plots:original.map(plot=>({id:plot.id,boundary:clone(plot.boundary)})),
      plotIds:[...property.plotIds],retiredPlotIds:[],area:polygonSignedArea(boundary),
      total:original.reduce((s,plot)=>s+polygonSignedArea(plot.boundary),0)};
  }
  const cells=partitionPropertyPolygon024(boundary);
  const used=new Set(city.plots.map(p=>p.id));
  let serial=1;
  const plots=cells.map((cell,i)=>{
    let id=property.plotIds[i];
    if(!id){
      do{id='PLOT-'+String(serial++).padStart(5,'0');}while(used.has(id)&&serial<50000);
      if(used.has(id))throw Error('Plot identifier capacity has been reached.');
      used.add(id);
    }
    return {id,boundary:cell};
  });
  return {
    propertyId,boundary:clone(boundary),plots,
    plotIds:plots.map(p=>p.id),
    retiredPlotIds:property.plotIds.filter(id=>!plots.some(p=>p.id===id)),
    area:polygonSignedArea(boundary),
    total:plots.reduce((s,p)=>s+polygonSignedArea(p.boundary),0)
  };
}
