import { polygonSignedArea } from './geometry.js';
import { shapeWellFormed } from './building-validation.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from './property-geometry.js';

// Shares the canonical 3I frontage ordering; no second plot-division editor.
// Source order: frontage-left, frontage-right, rear-right, rear-left.
export const splitLerpE2 = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export const splitStripE2 = (boundary,a,b) => [
  splitLerpE2(boundary[0],boundary[1],a),
  splitLerpE2(boundary[0],boundary[1],b),
  splitLerpE2(boundary[3],boundary[2],b),
  splitLerpE2(boundary[3],boundary[2],a)
];

export function propertySplitGeometryE2(city,propertyId,t) {
  if(!Number.isFinite(t)||t<=0||t>=1)throw Error('Place the split strictly between the two frontage corners.');
  const source=city?.properties?.find(p=>p.id===propertyId);
  if(!source||source.boundary?.length!==4||!shapeWellFormed(source.boundary))
    throw Error('Only well-formed four-corner properties can be divided in E2.');
  const b=source.boundary;
  // This rule excludes concave or inverted source quadrilaterals without making
  // assumptions about polygons from older portable saves.
  for(let i=0;i<4;i++){
    const a=b[i],c=b[(i+1)%4],d=b[(i+2)%4];
    if((c.x-a.x)*(d.y-c.y)-(c.y-a.y)*(d.x-c.x)<=1e-7)
      throw Error('The selected property needs a convex frontage-to-rear boundary.');
  }
  const fractions=propertyDividerFractions3I(city,source);
  const accepted=propertyGeometryPreview3I(city,propertyId,b,fractions);
  const stored=new Map(city.plots.map(p=>[p.id,p]));
  for(const segment of accepted.plots){
    const existing=stored.get(segment.id);
    if(!existing||existing.boundary.length!==4||
      existing.boundary.some((p,i)=>Math.hypot(p.x-segment.boundary[i].x,p.y-segment.boundary[i].y)>1e-4))
      throw Error('Existing plot geometry is not an unambiguous frontage-to-rear subdivision.');
  }
  const left=splitStripE2(b,0,t),right=splitStripE2(b,t,1);
  if(!shapeWellFormed(left)||!shapeWellFormed(right))
    throw Error('The split would produce a reversed or degenerate parcel.');
  const frontageLength=points=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
  const areaLeft=polygonSignedArea(left),areaRight=polygonSignedArea(right);
  if(frontageLength(left)<7||frontageLength(right)<7||
      areaLeft<60||areaRight<60)
    throw Error('Both new properties need at least 7 units of street frontage and 60 square units of area.');
  if(Math.abs(areaLeft+areaRight-polygonSignedArea(b))>.02)
    throw Error('The divided property does not conserve its original area.');
  const ratios=[0,...fractions,1];
  const fragments=[];
  for(let i=0;i<source.plotIds.length;i++){
    const a=ratios[i],c=ratios[i+1],original=stored.get(source.plotIds[i]);
    for(const [side,start,end] of [['left',Math.max(0,a),Math.min(t,c)],
      ['right',Math.max(t,a),Math.min(1,c)]]){
      if(end-start<=1e-8)continue;
      fragments.push({side,originalId:original.id,boundary:splitStripE2(b,start,end),
        crossesCut:a<t-1e-8&&c>t+1e-8,fragmentStart:start,fragmentEnd:end});
    }
  }
  const fleft=fragments.filter(f=>f.side==='left'),fright=fragments.filter(f=>f.side==='right');
  const fragmentsArea=items=>items.reduce((sum,item)=>sum+polygonSignedArea(item.boundary),0);
  if(!fleft.length||!fright.length||Math.abs(fragmentsArea(fleft)-areaLeft)>.02||
      Math.abs(fragmentsArea(fright)-areaRight)>.02)
    throw Error('The split cannot tile both new properties with valid plots.');
  return {propertyId,t,boundary:b,left,right,areaLeft,areaRight,
    frontageLengthLeft:frontageLength(left),frontageLengthRight:frontageLength(right),
    cut:[splitLerpE2(b[0],b[1],t),splitLerpE2(b[3],b[2],t)],
    fragments,source};
}
