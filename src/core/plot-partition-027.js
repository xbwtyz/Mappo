import { polygonSignedArea } from './geometry.js';
import { shapeContained, shapesOverlapInterior, shapeWellFormed } from './building-validation.js';
import { convexPropertyPolygon024 } from './property-polygons-024.js';

// B04: Pure schema-9 plot geometry. The parent may be concave, but each stored
// plot must be convex for existing project validation and building occupancy.
const b04Eps027=1e-6;
export const MAX_PLOT_CORNERS_027=24;
const b04Same027=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<b04Eps027;
const b04Area027=ring=>polygonSignedArea(ring);
const b04Point027=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const b04Cross027=(a,b,c)=>(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
const b04Clean027=ring=>{
  let out=ring.map(p=>({x:p.x,y:p.y})).filter((p,i,all)=>i===0||!b04Same027(p,all[i-1]));
  if(out.length>1&&b04Same027(out[0],out.at(-1)))out.pop();
  let changed=true;
  while(changed&&out.length>3){
    changed=false;
    for(let i=0;i<out.length;i++){
      const a=out[(i+out.length-1)%out.length],b=out[i],c=out[(i+1)%out.length];
      if(Math.abs(b04Cross027(a,b,c))>b04Eps027)continue;
      if((b.x-a.x)*(b.x-c.x)+(b.y-a.y)*(b.y-c.y)>b04Eps027)continue;
      out.splice(i,1);changed=true;break;
    }
  }
  return out;
};
export function validConvexPlot027(ring) {
  return Array.isArray(ring)&&ring.length>=3&&ring.length<=MAX_PLOT_CORNERS_027
    &&shapeWellFormed(ring)&&convexPropertyPolygon024(ring)&&b04Area027(ring)>=.02
    &&ring.every((p,i)=>Math.hypot(p.x-ring[(i+1)%ring.length].x,p.y-ring[(i+1)%ring.length].y)>b04Eps027);
}
export function splitConvexPlot027(ring,edgeA,ratioA,edgeB,ratioB) {
  if(!validConvexPlot027(ring))throw Error('Select a valid convex plot.');
  const n=ring.length;
  if(!Number.isInteger(edgeA)||!Number.isInteger(edgeB)||edgeA===edgeB
     ||edgeA<0||edgeB<0||edgeA>=n||edgeB>=n
     ||![ratioA,ratioB].every(t=>Number.isFinite(t)&&t>1e-4&&t<1-1e-4))
    throw Error('Choose two distinct plot edges and interior cut positions.');
  const a=b04Point027(ring[edgeA],ring[(edgeA+1)%n],ratioA);
  const b=b04Point027(ring[edgeB],ring[(edgeB+1)%n],ratioB);
  const arc=(start,end,first,last)=>{
    const out=[first];let i=(start+1)%n,guard=0;
    while(i!==(end+1)%n&&guard++<n){out.push(ring[i]);i=(i+1)%n;}
    out.push(last);return b04Clean027(out);
  };
  const left=arc(edgeA,edgeB,a,b),right=arc(edgeB,edgeA,b,a);
  if(!validConvexPlot027(left)||!validConvexPlot027(right)
      ||Math.abs(b04Area027(left)+b04Area027(right)-b04Area027(ring))>.005)
    throw Error('The divider creates a degenerate or non-convex plot.');
  return {plots:[left,right],cut:[a,b]};
}
export function mergeConvexPlots027(a,b) {
  if(!validConvexPlot027(a)||!validConvexPlot027(b))throw Error('Both plots must be convex.');
  if(shapesOverlapInterior(a,b))throw Error('Plot interiors overlap.');
  let shared=null;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    if(b04Same027(a[i],b[(j+1)%b.length])&&b04Same027(a[(i+1)%a.length],b[j])){
      if(shared)throw Error('Multiple shared edges require a more specific plot merge.');
      shared={i,j};
    }
  }
  if(!shared)throw Error('Plots must share one complete opposing edge.');
  const walk=(ring,start,end)=>{
    const out=[ring[start]];let i=start,guard=0;
    while(i!==end&&guard++<=ring.length){i=(i+1)%ring.length;out.push(ring[i]);}
    return out;
  };
  const {i,j}=shared;
  const pa=walk(a,(i+1)%a.length,i),pb=walk(b,(j+1)%b.length,j);
  const merged=b04Clean027([...pa,...pb.slice(1,-1)]);
  if(!validConvexPlot027(merged)||Math.abs(b04Area027(merged)-b04Area027(a)-b04Area027(b))>.005)
    throw Error('The combined plot is not one valid convex polygon.');
  return merged;
}
export function validatePlotTiling027(parent,plots) {
  if(!shapeWellFormed(parent)||!Array.isArray(plots)||!plots.length||plots.length>1000)
    throw Error('The parent or proposed plot collection is invalid.');
  let total=0;
  for(const row of plots){
    if(!validConvexPlot027(row.boundary)||!shapeContained(row.boundary,parent))
      throw Error('A plot is non-convex, degenerate or outside its property.');
    total+=b04Area027(row.boundary);
  }
  if(Math.abs(total-b04Area027(parent))>.02)throw Error('Plot partition leaves a gap or changes the property area.');
  for(let i=0;i<plots.length;i++)for(let j=i+1;j<plots.length;j++)
    if(shapesOverlapInterior(plots[i].boundary,plots[j].boundary))
      throw Error('Plot partition overlaps.');
  return {area:b04Area027(parent),plotCount:plots.length};
}
