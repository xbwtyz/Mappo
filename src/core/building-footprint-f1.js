// F1: pure footprint-authoring primitives. Coordinates belong to the existing
// schema-9 exterior polygon + courtyard holes. No accepted city is mutated.
import {polygonSignedArea} from './geometry.js';
import {shapeWellFormed,shapeContained,shapesOverlapInterior} from './building-validation.js';
import {clearance} from './boundary.js';

const clone=shape=>({
  footprint:shape.footprint.map(p=>({...p})),
  holes:(shape.holes??[]).map(h=>h.map(p=>({...p})))
});
const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
const EPS=1e-6;
const edge=(ring,i)=>{
  if(!Array.isArray(ring)||!Number.isInteger(i)||i<0||i>=ring.length)
    throw Error('Select an existing edge.');
  const a=ring[i],b=ring[(i+1)%ring.length];
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len<EPS)throw Error('The selected edge is degenerate.');
  return {a,b,dx,dy,len,inside:{x:-dy/len,y:dx/len},outside:{x:dy/len,y:-dx/len}};
};
const at=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const shifted=(p,n,depth)=>({x:p.x+n.x*depth,y:p.y+n.y*depth});
function valid(shape){
  const g=clone(shape);
  if(!shapeWellFormed(g.footprint))throw Error('Exterior polygon must be a simple positive-area ring.');
  for(const h of g.holes){
    if(!shapeWellFormed(h)||!shapeContained(h,g.footprint)||
       h.some(p=>clearance(p,g.footprint)<=EPS))
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
export function validateFootprintF1(shape){return valid(shape);}

function ringFor(shape,holeIndex){
 if(holeIndex==null)return {ring:shape.footprint,isHole:false};
 if(!Number.isInteger(holeIndex)||holeIndex<0||holeIndex>=shape.holes.length)
   throw Error('Unknown courtyard index.');
 return {ring:shape.holes[holeIndex],isHole:true};
}
export function insertFootprintVertexF1(shape,index,t=.5,{holeIndex=null}={}){
 const g=clone(shape),{ring}=ringFor(g,holeIndex),{a,b}=edge(ring,index);
 if(!finite(t)||t<=EPS||t>=1-EPS)throw Error('Insert a vertex inside the selected edge.');
 ring.splice(index+1,0,at(a,b,t));
 return valid(g);
}
export function moveFootprintVertexF1(shape,index,point,{holeIndex=null}={}){
 const g=clone(shape),{ring}=ringFor(g,holeIndex);
 if(!Number.isInteger(index)||index<0||index>=ring.length||!finite(point?.x)||!finite(point?.y))
   throw Error('Choose a vertex and finite target coordinates.');
 ring[index]={x:point.x,y:point.y};
 return valid(g);
}
export function deleteFootprintVertexF1(shape,index,{holeIndex=null}={}){
 const g=clone(shape),{ring}=ringFor(g,holeIndex);
 if(!Number.isInteger(index)||index<0||index>=ring.length||ring.length<=3)
   throw Error('At least three vertices must remain.');
 ring.splice(index,1);return valid(g);
}
function edgeFeature(shape,index,{start=.25,end=.75,depth=2},inward=false){
 const g=clone(shape),{ring}=ringFor(g,null),e=edge(ring,index);
 if(![start,end,depth].every(finite)||start<=EPS||end>=1-EPS||
    end-start<=EPS||depth<=EPS||(end-start)*e.len<=EPS)
   throw Error('Use a positive depth and nonzero portion inside the selected edge.');
 const p=at(e.a,e.b,start),q=at(e.a,e.b,end),n=inward?e.inside:e.outside;
 // Traversal follows CCW perimeter. Protrusions outward and notches inward
 // are deliberately ordered differently to preserve positive polygon winding.
 const p2=shifted(p,n,depth),q2=shifted(q,n,depth);
 ring.splice(index+1,0,p,p2,q2,q);
 return valid(g);
}
// One attached rectangular wing: a continuous exterior ring, not a new building.
export function attachBuildingWingF1(shape,index,options={}) {
 return edgeFeature(shape,index,options,false);
}
// A U-shaped outline is a rectangular inward notch on a legal exterior edge.
export function notchBuildingOutlineF1(shape,index,options={}) {
 return edgeFeature(shape,index,options,true);
}
export function addRectangularCourtyardF1(shape,{center,width,depth}={}){
 const g=clone(shape);
 if(!finite(center?.x)||!finite(center?.y)||!finite(width)||!finite(depth)||width<=EPS||depth<=EPS)
   throw Error('Provide a courtyard center and positive width/depth.');
 const hw=width/2,hd=depth/2;
 g.holes.push([{x:center.x-hw,y:center.y-hd},{x:center.x+hw,y:center.y-hd},
   {x:center.x+hw,y:center.y+hd},{x:center.x-hw,y:center.y+hd}]);
 return valid(g);
}
export function removeBuildingCourtyardF1(shape,index){
 const g=clone(shape);
 if(!Number.isInteger(index)||index<0||index>=g.holes.length)
   throw Error('Select an existing courtyard.');
 g.holes.splice(index,1);return valid(g);
}
