import { polygonSignedArea } from './geometry.js';
import { shapeWellFormed } from './building-validation.js';
import { propertyDividerFractions3I, propertyGeometryPreview3I } from './property-geometry.js';
import { propertyLocalBounds3I } from './property-geometry.js';

const E3_MERGE_EPS = 1e-4;
const e3MergeClose = (a,b) => Math.hypot(a.x-b.x,a.y-b.y) <= E3_MERGE_EPS;
const e3MergeConvex = boundary => shapeWellFormed(boundary) &&
  boundary.every((p,i) => {
    const q=boundary[(i+1)%4],r=boundary[(i+2)%4];
    return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x)>1e-7;
  });
const e3MergeApprox = (a,b) => Math.abs(a-b)<.02;
const e3MergeEqualFrame = (a,b) => ['origin','tangent','inward'].every(key =>
  a?.[key]&&b?.[key]&&e3MergeClose(a[key],b[key]));
const e3MergeEdgeLength = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

export function propertyMergeGeometryE3(city,primaryId,secondaryId){
  if(!city||!primaryId||!secondaryId||primaryId===secondaryId)
    throw Error('Select two different accepted properties.');
  const primary=city.properties.find(p=>p.id===primaryId);
  const secondary=city.properties.find(p=>p.id===secondaryId);
  if(!primary||!secondary)throw Error('One of the chosen properties is no longer available.');
  if(primary.blockId!==secondary.blockId||primary.frontageRoadId!==secondary.frontageRoadId ||
    (primary.districtId??null)!==(secondary.districtId??null))
    throw Error('Properties need the same verified block, district and frontage road.');
  if(primary.boundary?.length!==4||secondary.boundary?.length!==4||
    !e3MergeConvex(primary.boundary)||!e3MergeConvex(secondary.boundary))
    throw Error('E3 initially supports well-formed e3MergeConvex four-corner properties only.');
  if(!e3MergeEqualFrame(primary.frame,secondary.frame))
    throw Error('Frontage frames differ; merging would require an unsafe geometry adjustment.');
  if(!primary.local||!secondary.local||!Array.isArray(primary.plotIds)||!Array.isArray(secondary.plotIds))
    throw Error('Property frontage or owned plot records cannot be verified.');
  const a=primary.boundary,b=secondary.boundary;
  let left,right;
  if(e3MergeClose(a[1],b[0])&&e3MergeClose(a[2],b[3]))[left,right]=[primary,secondary];
  else if(e3MergeClose(b[1],a[0])&&e3MergeClose(b[2],a[3]))[left,right]=[secondary,primary];
  else throw Error('Properties must share one complete frontage-to-rear edge.');
  const l=left.boundary,r=right.boundary;
  const union=[l[0],r[1],r[2],l[3]].map(p=>({...p}));
  if(!e3MergeConvex(union))throw Error('The combined property would not be one legal e3MergeConvex four-corner parcel.');
  const area=polygonSignedArea(union);
  if(!e3MergeApprox(area,primary.area+secondary.area)||area<60||
    e3MergeEdgeLength(union[0],union[1])<7||
    !e3MergeApprox(e3MergeEdgeLength(union[0],union[1]),
      e3MergeEdgeLength(l[0],l[1])+e3MergeEdgeLength(r[0],r[1])))
    throw Error('The combined frontage or parcel area is not conserved.');
  const orderedPlots=[],plotIds=new Set();
  for(const source of [left,right]){
    const ratios=propertyDividerFractions3I(city,source);
    const projected=propertyGeometryPreview3I(city,source.id,source.boundary,ratios);
    for(const row of projected.plots){
      const existing=city.plots.find(p=>p.id===row.id && p.propertyId===source.id);
      if(!existing||plotIds.has(row.id)||existing.boundary?.length!==4||
        existing.boundary.some((p,i)=>!e3MergeClose(p,row.boundary[i])))
        throw Error('Source plot tiling is ambiguous or has duplicate ownership.');
      plotIds.add(row.id);orderedPlots.push(existing);
    }
  }
  const mergedLocal=propertyLocalBounds3I(primary,union);
  const scale=e3MergeEdgeLength(union[0],union[1]);
  const ratios=orderedPlots.slice(0,-1).map(plot =>
    ((plot.boundary[1].x-union[0].x)*(union[1].x-union[0].x)+
     (plot.boundary[1].y-union[0].y)*(union[1].y-union[0].y))/(scale*scale));
  const limit=[0,...ratios,1];
  if(limit.some((v,i)=>!Number.isFinite(v)||v<0||v>1||
    (i>0&&v-limit[i-1]<.0001)))
    throw Error('The combined plot dividers are not unambiguous.');
  for(let i=0;i<orderedPlots.length;i++){
    const f=t=>({x:union[0].x+(union[1].x-union[0].x)*t,
                 y:union[0].y+(union[1].y-union[0].y)*t});
    const rear=t=>({x:union[3].x+(union[2].x-union[3].x)*t,
                    y:union[3].y+(union[2].y-union[3].y)*t});
    const expected=[f(limit[i]),f(limit[i+1]),rear(limit[i+1]),rear(limit[i])];
    if(expected.some((p,j)=>!e3MergeClose(p,orderedPlots[i].boundary[j])))
      throw Error('The combined plots cannot tile one frontage-to-rear property without reshaping.');
  }
  const total=orderedPlots.reduce((sum,p)=>sum+polygonSignedArea(p.boundary),0);
  if(!e3MergeApprox(area,total))throw Error('The combined plots do not conserve the merged property area.');
  return {primary,secondary,left,right,union,area,local:mergedLocal,
    plotIds:orderedPlots.map(p=>p.id),
    buildingIds:[...primary.buildingIds,...secondary.buildingIds],
    frontageLength:scale};
}

export function propertyMergeNeighborsE3(city,primaryId){
  if(!city?.properties?.some(p=>p.id===primaryId))return [];
  return city.properties.filter(p=>p.id!==primaryId)
    .filter(p=>{try{propertyMergeGeometryE3(city,primaryId,p.id);return true;}catch{return false;}})
    .map(p=>({id:p.id,name:p.customName||p.id}));
}
