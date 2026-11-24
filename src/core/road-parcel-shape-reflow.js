import { polygonSignedArea } from './geometry.js';
import { shapeWellFormed, shapeContained } from './building-validation.js';
import { insideOrOn } from './boundary.js';
import { propertyFits } from './placement.js';
import { propertyLocalBounds3I } from './property-geometry.js';
import { validatePlotTiling027 } from './plot-partition-027.js';

// A single positive affine transform preserves the original polygon, convex
// plot cells, adjacency and plot IDs. Never re-tile or erase a concavity.
export function reshapeRoadParcelPolygon(property, plots, edge, edges, setback, fixed) {
  const original=property.boundary;
  if(!shapeWellFormed(original)||original.length<3)
    throw Error('The existing parcel polygon is not valid.');
  validatePlotTiling027(original,plots);
  const {a,b}=edge, length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<1e-7)throw Error('The assigned frontage street has collapsed.');
  const tangent={x:(b.x-a.x)/length,y:(b.y-a.y)/length};
  const inward={x:-tangent.y,y:tangent.x}, frame={origin:a,tangent,inward};
  const first=original[0],second=original[1],width=Math.hypot(second.x-first.x,second.y-first.y);
  if(width<1e-7)throw Error('The existing parcel has no usable frontage edge.');
  const oldT={x:(second.x-first.x)/width,y:(second.y-first.y)/width};
  const oldN={x:-oldT.y,y:oldT.x};
  if(oldT.x*tangent.x+oldT.y*tangent.y<=0)
    throw Error('The assigned street frontage would reverse the parcel orientation.');
  const coords=(point,origin,t,n)=>({u:(point.x-origin.x)*t.x+(point.y-origin.y)*t.y,
    v:(point.x-origin.x)*n.x+(point.y-origin.y)*n.y});
  const mid={x:(first.x+second.x)/2,y:(first.y+second.y)/2};
  const target=coords(mid,a,tangent,inward);
  const block=edges.map(e=>e.a);
  const test=(map)=>{
    const boundary=original.map(map);
    if(!shapeWellFormed(boundary)||!shapeContained(boundary,block)||!propertyFits(boundary,block,edges)||
       fixed.some(pt=>!insideOrOn(pt,boundary)))return null;
    const front=boundary.slice(0,2), f0=coords(front[0],a,tangent,inward),f1=coords(front[1],a,tangent,inward);
    if(f0.u < -1e-6 || f1.u > length+1e-6 || f1.u-f0.u<Math.min(7,width)-1e-6 ||
       Math.abs(f0.v-f1.v)>1e-5||f0.v<setback-.050001)return null;
    const nextPlots=plots.map(plot=>({id:plot.id,boundary:plot.boundary.map(map)}));
    try{validatePlotTiling027(boundary,nextPlots);}catch{return null;}
    const next={...property,boundary,frontage:front,frame,area:polygonSignedArea(boundary)};
    next.local=propertyLocalBounds3I(next,boundary);
    return {property:next,plots:nextPlots,flexible:true};
  };
  // Exact world-space preservation is preferable when it still fits.
  const kept=test(pt=>({...pt}));
  if(kept)return kept;
  // Bounded deterministic alternatives: prefer rigid shape, then conservative
  // positive scales. The shared full validator still checks collisions/access.
  for(const su of [1,.95,.9,.8,.7]){
    const span=width*su;
    if(span>length||span<Math.min(7,width)-1e-6)continue;
    const left=Math.max(0,Math.min(length-span,target.u-span/2));
    for(const sv of [1,1.05,1.1,.95,.9,.8]){
      for(const front of [...new Set([setback,Math.max(setback,target.v)])]){
        const result=test(pt=>{
          const q=coords(pt,first,oldT,oldN);
          return {...pt,x:a.x+tangent.x*(left+q.u*su)+inward.x*(front+q.v*sv),
            y:a.y+tangent.y*(left+q.u*su)+inward.y*(front+q.v*sv)};
        });
        if(result)return result;
      }
    }
  }
  throw Error('No safe polygon reshape fits the moved frontage, block setbacks, existing plot layout and fixed buildings.');
}
