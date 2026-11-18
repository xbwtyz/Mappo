import { polygonSignedArea } from './geometry.js';
import { copyJson } from '../data/project-format.js';

const giFinite = value => typeof value === 'number' && Number.isFinite(value);
const giLerp = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const giProject = (p,a,b) => ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))
  / ((b.x-a.x)**2+(b.y-a.y)**2 || 1);

// Stored base plots are convex strips running from the frontage (corners 0→1)
// to the rear (corners 3→2). Preserve their order and IDs when editing.
export function propertyDividerFractions3I(city, property) {
  if (!property || property.boundary?.length !== 4) throw new Error('Only four-corner properties support this milestone.');
  const plots=property.plotIds.map(id=>city.plots.find(plot=>plot.id===id&&plot.propertyId===property.id));
  if (plots.some(p=>!p || p.boundary?.length!==4)) throw new Error('Property plot subdivision cannot be edited safely.');
  const [front0,front1]=property.boundary;
  const ratios=plots.slice(0,-1).map(plot=>giProject(plot.boundary[1],front0,front1));
  if(ratios.some((v,i)=>!giFinite(v)||v<=0.0001||v>=.9999||(i>0&&v<=ratios[i-1]+.0001)))
    throw new Error('Existing plot divisions are not ordered along this frontage.');
  return ratios;
}

export function propertyGeometryPreview3I(city,propertyId,boundary,dividers) {
  const property=city?.properties?.find(p=>p.id===propertyId);
  if(!property || !Array.isArray(boundary)||boundary.length!==4
      || !boundary.every(p=>p&&giFinite(p.x)&&giFinite(p.y)&&Math.abs(p.x)<10000&&Math.abs(p.y)<10000))
    throw new Error('Property preview needs four finite boundary corners.');
  const ids=property.plotIds;
  if(!Array.isArray(dividers)||dividers.length!==ids.length-1)throw new Error('Plot subdivision count must remain unchanged.');
  const ratios=[0,...dividers,1];
  if(ratios.some((v,i)=>!giFinite(v)||v<0||v>1||(i>0&&v-ratios[i-1]<.0001)))
    throw new Error('Plot dividers must stay ordered without touching.');
  const front=s=>giLerp(boundary[0],boundary[1],s);
  const back=s=>giLerp(boundary[3],boundary[2],s);
  const plots=ids.map((id,i)=>({
    id,
    boundary:[front(ratios[i]),front(ratios[i+1]),back(ratios[i+1]),back(ratios[i])]
  }));
  const total=plots.reduce((sum,p)=>sum+polygonSignedArea(p.boundary),0);
  const area=polygonSignedArea(boundary);
  // Correctly sided and shared edges cover the quadrilateral without gaps.
  return {propertyId,boundary:copyJson(boundary),dividers:[...dividers],area,total,plots};
}

export function propertyLocalBounds3I(property,boundary) {
  const frame=property.frame;
  if(!frame || !Array.isArray(boundary)||!boundary.length)throw new Error('Missing property frontage frame.');
  const projected=boundary.map(p=>{
    const dx=p.x-frame.origin.x,dy=p.y-frame.origin.y;
    return {u:dx*frame.tangent.x+dy*frame.tangent.y,v:dx*frame.inward.x+dy*frame.inward.y};
  });
  const xs=projected.map(p=>p.u),ys=projected.map(p=>p.v);
  const minU=Math.min(...xs),minV=Math.min(...ys);
  return {x:minU,y:minV,width:Math.max(...xs)-minU,depth:Math.max(...ys)-minV};
}
