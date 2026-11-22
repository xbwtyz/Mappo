import { polygonSignedArea } from './geometry.js';
import { shapeContained, shapeWellFormed, shapesOverlapInterior } from './building-validation.js';
import { PROPERTY_VERTEX_LIMIT_024 } from './property-polygons-024.js';

// 0.2.6 B03: a nonmutating, bounded two-polygon union. The directed
// exterior edge graph preserves exact source coordinates; only proven
// internal shared segments and redundant collinear corners are removed.
const EPS = 1e-6;
const clone = p => ({ x: p.x, y: p.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a, b, p) => (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const dot = (a, b, p) => (p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y);
const pointOn = (p, a, b) => distance(a,b)>EPS &&
  Math.abs(cross(a,b,p))<=EPS*distance(a,b) &&
  dot(a,b,p)>=-EPS && dot(a,b,p)<=distance(a,b)**2+EPS;
const key = p => Math.round(p.x/EPS)+':'+Math.round(p.y/EPS);
const edgeKey = (a,b) => [key(a),key(b)].sort().join('|');
const lex = (a,b) => key(a).localeCompare(key(b));
const signed = polygonSignedArea;

function pieces(poly, other, source) {
  const result=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],length=distance(a,b);
    const marks=[{p:a,t:0},{p:b,t:1}];
    for(const p of other)if(pointOn(p,a,b)){
      const t=dot(a,b,p)/(length*length);
      if(t>EPS/length&&t<1-EPS/length)marks.push({p,t});
    }
    marks.sort((x,y)=>x.t-y.t);
    for(let j=0;j<marks.length-1;j++){
      const u=marks[j].p,v=marks[j+1].p;
      if(distance(u,v)>EPS)result.push({a:clone(u),b:clone(v),source});
    }
  }
  return result;
}

function simplify(poly) {
  const result=poly.map(clone);
  let changed=true;
  while(changed&&result.length>3){
    changed=false;
    for(let i=0;i<result.length;i++){
      const a=result[(i+result.length-1)%result.length],
        b=result[i],c=result[(i+1)%result.length];
      if(Math.abs(cross(a,c,b)) <= EPS*distance(a,c) && pointOn(b,a,c)){
        result.splice(i,1);changed=true;break;
      }
    }
  }
  return result;
}

function exteriorFrontage(union, source) {
  const a=source.boundary[0],b=source.boundary[1];
  const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return union.findIndex((p,i)=>pointOn(midpoint,p,union[(i+1)%union.length]) &&
    Math.abs(cross(a,b,p))<=EPS*distance(a,b));
}

export function propertyMergeUnion026(primary, secondary) {
  if(!primary||!secondary||
      primary.blockId!==secondary.blockId||
      (primary.districtId??null)!==(secondary.districtId??null))
    throw Error('Merge requires two properties in the same accepted block and district.');
  for(const p of [primary,secondary]){
    if(!Array.isArray(p.boundary)||p.boundary.length<3||
      p.boundary.length>PROPERTY_VERTEX_LIMIT_024||!shapeWellFormed(p.boundary))
      throw Error('Both properties need valid, simple 3–12 corner polygons.');
    if(!p.frontageRoadId||!p.frame||!p.local)
      throw Error('Both properties require verified accepted frontage records.');
  }
  const a=primary.boundary,b=secondary.boundary;
  if(shapesOverlapInterior(a,b))
    throw Error('The source property interiors overlap.');
  const segments=[...pieces(a,b,0),...pieces(b,a,1)];
  const grouped=new Map();
  for(const seg of segments){
    const k=edgeKey(seg.a,seg.b),bucket=grouped.get(k)??[];
    bucket.push(seg);grouped.set(k,bucket);
  }
  const shared=[],outer=[];
  for(const rows of grouped.values()){
    if(rows.length===1)outer.push(rows[0]);
    else if(rows.length===2&&rows[0].source!==rows[1].source &&
      key(rows[0].a)===key(rows[1].b) && key(rows[0].b)===key(rows[1].a))
      shared.push(rows[0]);
    else throw Error('The shared boundary is ambiguous or non-manifold.');
  }
  if(!shared.length)throw Error('Properties must share a positive-length edge, not only a corner.');
  // D-026-1=A: one straight, continuous shared boundary (possibly split
  // into several atomic collinear pieces), not a bent or branched seam.
  const s0=shared[0],endpoints=new Map();
  for(const seg of shared){
    if(Math.abs(cross(s0.a,s0.b,seg.a))>EPS*distance(s0.a,s0.b) ||
       Math.abs(cross(s0.a,s0.b,seg.b))>EPS*distance(s0.a,s0.b))
      throw Error('The shared seam bends; only one straight continuous seam is supported.');
    for(const p of [seg.a,seg.b])endpoints.set(key(p),p);
  }
  const adj=new Map();
  for(const seg of shared)for(const p of [seg.a,seg.b]){
    const k=key(p);if(!adj.has(k))adj.set(k,new Set());
    adj.get(k).add(key(key(p)===key(seg.a)?seg.b:seg.a));
  }
  const terminals=[...adj.values()].filter(x=>x.size===1).length;
  if(terminals!==2||[...adj.values()].some(x=>x.size>2))
    throw Error('The shared edge must form one continuous non-branching segment.');
  const outgoing=new Map(),incoming=new Map();
  for(const seg of outer){
    const from=key(seg.a),to=key(seg.b);
    if(outgoing.has(from)||incoming.has(to))
      throw Error('The merged exterior would have branching or disconnected edges.');
    outgoing.set(from,seg);incoming.set(to,seg);
  }
  if(outgoing.size!==outer.length||incoming.size!==outer.length ||
    [...outgoing.keys()].some(k=>!incoming.has(k)))
    throw Error('The merged exterior does not form one closed perimeter.');
  const start=[...outer].sort((x,y)=>lex(x.a,y.a))[0];
  const visited=new Set(),walk=[];
  let current=start;
  while(current&&!visited.has(key(current.a))&&walk.length<=outer.length){
    visited.add(key(current.a));walk.push(current.a);current=outgoing.get(key(current.b));
  }
  if(!current||key(current.a)!==key(start.a)||walk.length!==outer.length)
    throw Error('Merged perimeter is not one connected polygon.');
  const union=simplify(walk);
  if(union.length<3||union.length>PROPERTY_VERTEX_LIMIT_024||!shapeWellFormed(union))
    throw Error('Merged boundary must be a simple, hole-free polygon with 3–12 corners.');
  const area=signed(union);
  if(area<60||Math.abs(area-signed(a)-signed(b))>.02||
     !shapeContained(a,union)||!shapeContained(b,union))
    throw Error('Merged polygon does not conserve or contain both source properties.');
  const frontIndex=exteriorFrontage(union,primary);
  if(frontIndex<0)throw Error('Primary road frontage is not part of the merged exterior.');
  const boundary=[...union.slice(frontIndex),...union.slice(0,frontIndex)];
  const frontageLength=distance(boundary[0],boundary[1]);
  if(frontageLength<7)throw Error('Merged property needs at least 7 units of primary frontage.');
  if(exteriorFrontage(union,secondary)<0)
    throw Error('Secondary road frontage is no longer exposed on the merged exterior.');
  const roads=[...new Set([primary.frontageRoadId,secondary.frontageRoadId])];
  return {union:boundary,area,frontageLength,frontageRoadIds:roads,
    sharedLength:shared.reduce((sum,seg)=>sum+distance(seg.a,seg.b),0),
    sourceCount:2};
}
