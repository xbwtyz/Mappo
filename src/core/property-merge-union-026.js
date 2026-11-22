import { polygonSignedArea } from './geometry.js';
import { shapeContained, shapeWellFormed, shapesOverlapInterior } from './building-validation.js';
import { PROPERTY_VERTEX_LIMIT_024 } from './property-polygons-024.js';

// 0.2.6 B03: a nonmutating, bounded two-polygon union. The directed
// exterior edge graph preserves exact source coordinates; only proven
// internal shared segments and redundant collinear corners are removed.
const B03_UNION_EPS = 1e-6;
const b03UnionClone = p => ({ x: p.x, y: p.y });
const b03UnionDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const b03UnionCross = (a, b, p) => (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const b03UnionDot = (a, b, p) => (p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y);
const b03UnionPointOn = (p, a, b) => b03UnionDistance(a,b)>B03_UNION_EPS &&
  Math.abs(b03UnionCross(a,b,p))<=B03_UNION_EPS*b03UnionDistance(a,b) &&
  b03UnionDot(a,b,p)>=-B03_UNION_EPS && b03UnionDot(a,b,p)<=b03UnionDistance(a,b)**2+B03_UNION_EPS;
const b03UnionKey = p => Math.round(p.x/B03_UNION_EPS)+':'+Math.round(p.y/B03_UNION_EPS);
const b03UnionEdgeKey = (a,b) => [b03UnionKey(a),b03UnionKey(b)].sort().join('|');
const b03UnionLex = (a,b) => b03UnionKey(a).localeCompare(b03UnionKey(b));
const b03UnionSigned = polygonSignedArea;

function b03UnionPieces(poly, other, source) {
  const result=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],length=b03UnionDistance(a,b);
    const marks=[{p:a,t:0},{p:b,t:1}];
    for(const p of other)if(b03UnionPointOn(p,a,b)){
      const t=b03UnionDot(a,b,p)/(length*length);
      if(t>B03_UNION_EPS/length&&t<1-B03_UNION_EPS/length)marks.push({p,t});
    }
    marks.sort((x,y)=>x.t-y.t);
    for(let j=0;j<marks.length-1;j++){
      const u=marks[j].p,v=marks[j+1].p;
      if(b03UnionDistance(u,v)>B03_UNION_EPS)result.push({a:b03UnionClone(u),b:b03UnionClone(v),source});
    }
  }
  return result;
}

function b03UnionSimplify(poly) {
  const result=poly.map(b03UnionClone);
  let changed=true;
  while(changed&&result.length>3){
    changed=false;
    for(let i=0;i<result.length;i++){
      const a=result[(i+result.length-1)%result.length],
        b=result[i],c=result[(i+1)%result.length];
      if(Math.abs(b03UnionCross(a,c,b)) <= B03_UNION_EPS*b03UnionDistance(a,c) && b03UnionPointOn(b,a,c)){
        result.splice(i,1);changed=true;break;
      }
    }
  }
  return result;
}

function b03UnionExteriorFrontage(union, source) {
  const a=source.boundary[0],b=source.boundary[1];
  const midpoint={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return union.findIndex((p,i)=>b03UnionPointOn(midpoint,p,union[(i+1)%union.length]) &&
    Math.abs(b03UnionCross(a,b,p))<=B03_UNION_EPS*b03UnionDistance(a,b));
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
  const segments=[...b03UnionPieces(a,b,0),...b03UnionPieces(b,a,1)];
  const grouped=new Map();
  for(const seg of segments){
    const k=b03UnionEdgeKey(seg.a,seg.b),bucket=grouped.get(k)??[];
    bucket.push(seg);grouped.set(k,bucket);
  }
  const shared=[],outer=[];
  for(const rows of grouped.values()){
    if(rows.length===1)outer.push(rows[0]);
    else if(rows.length===2&&rows[0].source!==rows[1].source &&
      b03UnionKey(rows[0].a)===b03UnionKey(rows[1].b) && b03UnionKey(rows[0].b)===b03UnionKey(rows[1].a))
      shared.push(rows[0]);
    else throw Error('The shared boundary is ambiguous or non-manifold.');
  }
  if(!shared.length)throw Error('Properties must share a positive-length edge, not only a corner.');
  // D-026-1=A: one straight, continuous shared boundary (possibly split
  // into several atomic collinear b03UnionPieces), not a bent or branched seam.
  const s0=shared[0],endpoints=new Map();
  for(const seg of shared){
    if(Math.abs(b03UnionCross(s0.a,s0.b,seg.a))>B03_UNION_EPS*b03UnionDistance(s0.a,s0.b) ||
       Math.abs(b03UnionCross(s0.a,s0.b,seg.b))>B03_UNION_EPS*b03UnionDistance(s0.a,s0.b))
      throw Error('The shared seam bends; only one straight continuous seam is supported.');
    for(const p of [seg.a,seg.b])endpoints.set(b03UnionKey(p),p);
  }
  const adj=new Map();
  for(const seg of shared)for(const p of [seg.a,seg.b]){
    const k=b03UnionKey(p);if(!adj.has(k))adj.set(k,new Set());
    adj.get(k).add(b03UnionKey(b03UnionKey(p)===b03UnionKey(seg.a)?seg.b:seg.a));
  }
  const terminals=[...adj.values()].filter(x=>x.size===1).length;
  if(terminals!==2||[...adj.values()].some(x=>x.size>2))
    throw Error('The shared edge must form one continuous non-branching segment.');
  const outgoing=new Map(),incoming=new Map();
  for(const seg of outer){
    const from=b03UnionKey(seg.a),to=b03UnionKey(seg.b);
    if(outgoing.has(from)||incoming.has(to))
      throw Error('The merged exterior would have branching or disconnected edges.');
    outgoing.set(from,seg);incoming.set(to,seg);
  }
  if(outgoing.size!==outer.length||incoming.size!==outer.length ||
    [...outgoing.keys()].some(k=>!incoming.has(k)))
    throw Error('The merged exterior does not form one closed perimeter.');
  const start=[...outer].sort((x,y)=>b03UnionLex(x.a,y.a))[0];
  const visited=new Set(),walk=[];
  let current=start;
  while(current&&!visited.has(b03UnionKey(current.a))&&walk.length<=outer.length){
    visited.add(b03UnionKey(current.a));walk.push(current.a);current=outgoing.get(b03UnionKey(current.b));
  }
  if(!current||b03UnionKey(current.a)!==b03UnionKey(start.a)||walk.length!==outer.length)
    throw Error('Merged perimeter is not one connected polygon.');
  const union=b03UnionSimplify(walk);
  if(union.length<3||union.length>PROPERTY_VERTEX_LIMIT_024||!shapeWellFormed(union))
    throw Error('Merged boundary must be a simple, hole-free polygon with 3–12 corners.');
  const area=b03UnionSigned(union);
  if(area<60||Math.abs(area-b03UnionSigned(a)-b03UnionSigned(b))>.02||
     !shapeContained(a,union)||!shapeContained(b,union))
    throw Error('Merged polygon does not conserve or contain both source properties.');
  const frontIndex=b03UnionExteriorFrontage(union,primary);
  if(frontIndex<0)throw Error('Primary road frontage is not part of the merged exterior.');
  const boundary=[...union.slice(frontIndex),...union.slice(0,frontIndex)];
  const frontageLength=b03UnionDistance(boundary[0],boundary[1]);
  if(frontageLength<7)throw Error('Merged property needs at least 7 units of primary frontage.');
  if(b03UnionExteriorFrontage(union,secondary)<0)
    throw Error('Secondary road frontage is no longer exposed on the merged exterior.');
  const roads=[...new Set([primary.frontageRoadId,secondary.frontageRoadId])];
  return {union:boundary,area,frontageLength,frontageRoadIds:roads,
    sharedLength:shared.reduce((sum,seg)=>sum+b03UnionDistance(seg.a,seg.b),0),
    sourceCount:2};
}
