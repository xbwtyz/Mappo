// F1: pure footprint-authoring primitives. Coordinates belong to the existing
// schema-9 exterior polygon + courtyard holes. No accepted city is mutated.
import {polygonSignedArea} from './geometry.js';
import {shapeWellFormed,shapeContained,shapesOverlapInterior} from './building-validation.js';
import {clearance, lerpPoint} from './boundary.js';

const copyFootprintRings=shape=>({
  footprint:shape.footprint.map(p=>({...p})),
  holes:(shape.holes??[]).map(h=>h.map(p=>({...p})))
});
const finiteFootprintValue=(v)=>typeof v==='number'&&Number.isFinite(v);
const FOOTPRINT_EPS=1e-6;
const footprintEdge=(ring,i)=>{
  if(!Array.isArray(ring)||!Number.isInteger(i)||i<0||i>=ring.length)
    throw Error('Select an existing edge.');
  const a=ring[i],b=ring[(i+1)%ring.length];
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<FOOTPRINT_EPS)throw Error('The selected edge is degenerate.');
  return {a,b,dx,dy,len,inside:{x:-dy/len,y:dx/len},outside:{x:dy/len,y:-dx/len}};
};
const offsetFootprintPoint=(p,n,depth)=>({x:p.x+n.x*depth,y:p.y+n.y*depth});
function checkedFootprint(shape){
  const g=copyFootprintRings(shape);
  if(!shapeWellFormed(g.footprint))throw Error('Exterior polygon must be a simple positive-area ring.');
  for(const h of g.holes){
    if(!shapeWellFormed(h)||!shapeContained(h,g.footprint)||
       h.some(p=>clearance(p,g.footprint)<=FOOTPRINT_EPS))
      throw Error('A courtyard must be simple and strictly inside the building.');
  }
  for(let i=0;i<g.holes.length;i++)for(let j=i+1;j<g.holes.length;j++)
    if(shapesOverlapInterior(g.holes[i],g.holes[j]))
      throw Error('Courtyards may not intersect each other.');
  const area=polygonSignedArea(g.footprint)-
    g.holes.reduce((v,h)=>v+polygonSignedArea(h),0);
  if(area<=1)throw Error('Net occupied building area must exceed one unit.');
  return {...g,area};
}
export function validateFootprintF1(shape){return checkedFootprint(shape);}

function footprintRing(shape,holeIndex){
 if(holeIndex==null)return {ring:shape.footprint,isHole:false};
 if(!Number.isInteger(holeIndex)||holeIndex<0||holeIndex>=shape.holes.length)
   throw Error('Unknown courtyard index.');
 return {ring:shape.holes[holeIndex],isHole:true};
}
export function insertFootprintVertexF1(shape,index,t=.5,{holeIndex=null}={}){
 const g=copyFootprintRings(shape),{ring}=footprintRing(g,holeIndex),{a,b}=footprintEdge(ring,index);
 if(!finiteFootprintValue(t)||t<=FOOTPRINT_EPS||t>=1-FOOTPRINT_EPS)throw Error('Insert a vertex inside the selected edge.');
 ring.splice(index+1,0,lerpPoint(a,b,t));
 return checkedFootprint(g);
}
export function moveFootprintVertexF1(shape,index,point,{holeIndex=null,validate=true}={}){
 const g=copyFootprintRings(shape),{ring}=footprintRing(g,holeIndex);
 if(!Number.isInteger(index)||index<0||index>=ring.length||!finiteFootprintValue(point?.x)||!finiteFootprintValue(point?.y))
   throw Error('Choose a vertex and finite target coordinates.');
 ring[index]={x:point.x,y:point.y};
 return validate?checkedFootprint(g):g;
}
export function deleteFootprintVertexF1(shape,index,{holeIndex=null}={}){
 const g=copyFootprintRings(shape),{ring}=footprintRing(g,holeIndex);
 if(!Number.isInteger(index)||index<0||index>=ring.length||ring.length<=3)
   throw Error('At least three vertices must remain.');
 ring.splice(index,1);return checkedFootprint(g);
}
function edgeFeature(shape,index,{start=.25,end=.75,depth=2},inward=false){
 const g=copyFootprintRings(shape),{ring}=footprintRing(g,null),e=footprintEdge(ring,index);
 if(![start,end,depth].every(finiteFootprintValue)||start<=FOOTPRINT_EPS||end>=1-FOOTPRINT_EPS||
    end-start<=FOOTPRINT_EPS||depth<=FOOTPRINT_EPS||(end-start)*e.len<=FOOTPRINT_EPS)
   throw Error('Use a positive depth and nonzero portion inside the selected edge.');
 const p=lerpPoint(e.a,e.b,start),q=lerpPoint(e.a,e.b,end),n=inward?e.inside:e.outside;
 // Traversal follows CCW perimeter. Protrusions outward and notches inward
 // are deliberately ordered differently to preserve positive polygon winding.
 const p2=offsetFootprintPoint(p,n,depth),q2=offsetFootprintPoint(q,n,depth);
 ring.splice(index+1,0,p,p2,q2,q);
 return checkedFootprint(g);
}
// One attached rectangular wing: a continuous exterior ring, not a new building.
export function attachBuildingWingF1(shape,index,options={}) {
 return edgeFeature(shape,index,options,false);
}
// A U-shaped outline is a rectangular inward notch on a legal exterior edge.
export function notchBuildingOutlineF1(shape,index,options={}) {
 return edgeFeature(shape,index,options,true);
}
export function rectangularCourtyardFrame(ring) {
  if (ring?.length !== 4) return null;
  const [a,b,c,d] = ring;
  const x = { x:b.x-a.x, y:b.y-a.y }, y = { x:d.x-a.x, y:d.y-a.y };
  const width = Math.hypot(x.x,x.y), depth = Math.hypot(y.x,y.y);
  if (width < FOOTPRINT_EPS || depth < FOOTPRINT_EPS ||
      Math.abs(x.x*y.x+x.y*y.y) > FOOTPRINT_EPS*width*depth ||
      Math.hypot(a.x+x.x+y.x-c.x,a.y+x.y+y.y-c.y) > FOOTPRINT_EPS) return null;
  return { center:lerpPoint(a,c,.5), width, depth, angle:Math.atan2(x.y,x.x) };
}

export function addRectangularCourtyardF1(shape,{center,width,depth,angle=0}={},holeIndex=null){
 const g=copyFootprintRings(shape);
 if(!finiteFootprintValue(center?.x)||!finiteFootprintValue(center?.y)||!finiteFootprintValue(width)||!finiteFootprintValue(depth)||!finiteFootprintValue(angle)||width<=FOOTPRINT_EPS||depth<=FOOTPRINT_EPS)
   throw Error('Provide a courtyard center and positive width/depth.');
 const hw=width/2,hd=depth/2;
 const c=Math.cos(angle),s=Math.sin(angle);
 const courtyard=[[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([x,y])=>({
   x:center.x+x*c-y*s,y:center.y+x*s+y*c
 }));
 if(holeIndex===null)g.holes.push(courtyard);
 else{
   footprintRing(g,holeIndex);
   g.holes[holeIndex]=courtyard;
 }
 return checkedFootprint(g);
}
export function removeBuildingCourtyardF1(shape,index){
 const g=copyFootprintRings(shape);
 if(!Number.isInteger(index)||index<0||index>=g.holes.length)
   throw Error('Select an existing courtyard.');
 g.holes.splice(index,1);return checkedFootprint(g);
}
