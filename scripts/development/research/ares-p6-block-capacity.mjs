// Read-only necessary capacity bounds. No packing, relocation or permission.
import {polygonSignedArea} from '../../../src/core/geometry.js';
import {STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../../../src/core/placement.js';
import {classifyRoadProvenance} from '../../../src/core/road-provenance.js';
const area=(ring,b)=>{b.spend(Math.max(1,ring.length));return Math.abs(polygonSignedArea(ring));};
const cross=(a,c,p)=>(c.x-a.x)*(p.y-a.y)-(c.y-a.y)*(p.x-a.x);
const eps=1e-7;
// Convex face: offset each boundary inward by its existing road clearance.
// Relax by epsilon to obtain an upper bound, not an exact usable parcel.
export function observeP6ConvexClearance(face,graph,b){
 const ring=face.polygon;
 for(let i=0;i<ring.length;i++)for(const p of ring){
  b.spend();if(cross(ring[i],ring[(i+1)%ring.length],p)<-eps)return {status:'unsupported-nonconvex'};
 }
 let clipped=ring.map(p=>({...p}));b.spend(ring.length);
 for(let i=0;i<ring.length;i++){
  const a=ring[i],c=ring[(i+1)%ring.length],r=graph.roadsById.get(face.roadIds[i]),length=Math.hypot(c.x-a.x,c.y-a.y);
  const margin=(STREET_WIDTHS[r?.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
  b.spend();if(!Number.isFinite(margin)||length<=eps)return {status:'unsupported-edge'};
  const side=p=>cross(a,c,p)/length-margin+eps;
  const next=[];
  for(let j=0;j<clipped.length;j++){
   b.spend();const p=clipped[j],q=clipped[(j+1)%clipped.length],sp=side(p),sq=side(q);
   if(sp>=0)next.push(p);
   if((sp>=0)!==(sq>=0)){const u=sp/(sp-sq);next.push({x:p.x+(q.x-p.x)*u,y:p.y+(q.y-p.y)*u});}
  }
  clipped=next;
 }
 return {status:'bounded-convex',areaUpperBound:clipped.length>=3?area(clipped,b):0,remainingVertices:clipped.length};
}
export function observeP6BlockCapacity(source,extraction,topology,b){
 const base={authority:'none',landVerified:false};
 if(topology.status!=='topology-correspondence-observed')return {...base,status:'no-topology-hypothesis'};
 let face=null;
 for(const f of extraction.faces){b.spend();if(f.key===topology.candidateKey)face=f;}
 if(!face)return {...base,status:'missing-face'};
 const clearance=observeP6ConvexClearance(face,extraction.graph,b),properties=[],buildings=[];
 for(const p of source.properties){b.spend();if(p.blockId!==topology.oldId)continue;
  properties.push({id:p.id,boundaryArea:area(p.boundary,b),provenance:classifyRoadProvenance(p)});
 }
 for(const r of source.buildings){b.spend();if(r.blockId!==topology.oldId)continue;
  let occupied=0;
  for(const region of r.geometry.regions){b.spend();occupied+=(region.kind==='solid'?1:-1)*area(region.ring,b);}
  buildings.push({id:r.id,occupiedArea:occupied,provenance:classifyRoadProvenance(r)});
 }
 b.spend(Math.max(1,properties.length+buildings.length));
 const buildingArea=buildings.reduce((n,r)=>n+r.occupiedArea,0),propertyArea=properties.reduce((n,r)=>n+r.boundaryArea,0);
 const upper=clearance.status==='bounded-convex'?Math.min(face.area,clearance.areaUpperBound):face.area;
 return {...base,status:'capacity-observed',blockId:topology.oldId,faceArea:face.area,clearance,
  properties,buildings,propertyArea,buildingArea,areaUpperBound:upper,
  rigidInBlockAreaImpossible:buildingArea>upper+.02,
  originalPropertyAreaImpossible:propertyArea>upper+.02,
  relocation:'not-evaluated',scaling:'not-authorized',demolition:'not-authorized'};
}
