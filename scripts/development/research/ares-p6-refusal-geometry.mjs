// Detached refusal geometry observation only. Never changes a record or tolerance.
import {polygonSignedArea,boundsOf} from '../../../src/core/geometry.js';
import {roadFaceOverlapArea} from '../../../src/core/road-face-geometry.js';
const charge=(b,n)=>b.spend(Math.max(1,n));
const mean=(ps,b)=>{charge(b,ps.length);return {x:ps.reduce((s,p)=>s+p.x,0)/ps.length,y:ps.reduce((s,p)=>s+p.y,0)/ps.length};};
const pair=(a,b)=>JSON.stringify([a,b].sort());
const shared=(a,c,b)=>{charge(b,a.length+c.length);const set=new Set(c);return a.filter(x=>set.has(x));};
export function observeP6UnmatchedGeometry(source,extraction,identity,b){
 const accepted=new Map(),nodes=new Map(),roads=new Map(),fresh=new Map();
 for(const n of source.nodes){b.spend();nodes.set(n.id,n);}
 for(const r of source.roads){b.spend();roads.set(pair(r.a,r.b),r.id);}
 for(const r of source.blocks){b.spend();accepted.set(r.id,r);}
 for(const f of extraction.faces){b.spend();fresh.set(f.key,f);}
 const rows=[];
 for(const removed of identity.removed.filter(r=>r.kind==='block')){
  const old=accepted.get(removed.id);
  if(!old)throw Error('Missing unmatched source block.');
  charge(b,3*old.vertices.length);
  const polygon=old.vertices.map(id=>nodes.get(id)),oldArea=Math.abs(polygonSignedArea(polygon));
  const oldRoads=old.vertices.map((id,i)=>roads.get(pair(id,old.vertices[(i+1)%old.vertices.length])));
  if(oldRoads.some(id=>!id))throw Error('Missing unmatched source edge.');
  for(const added of identity.added.filter(r=>r.kind==='block')){
   const f=fresh.get(added.candidateKey);
   if(!f)throw Error('Missing unmatched candidate face.');
   charge(b,old.vertices.length+f.vertices.length);
   const commonVertices=shared(old.vertices,f.vertices,b),commonRoads=shared(oldRoads,f.roadIds,b);
   const a=boundsOf(polygon),c=boundsOf(f.polygon);
   const disjointBounds=a.maxX<=c.minX||c.maxX<=a.minX||a.maxY<=c.minY||c.maxY<=a.minY;
   const overlap=disjointBounds?0:roadFaceOverlapArea(polygon,f.polygon,n=>b.spend(n??1));
   const before=mean(polygon,b),after=mean(f.polygon,b);
   rows.push({oldId:old.id,candidateKey:f.key,oldArea,newArea:f.area,overlap,disjointBounds,
    oldVertices:old.vertices.length,newVertices:f.vertices.length,sharedVertices:commonVertices,sharedRoads:commonRoads,
    sameVertexSet:commonVertices.length===old.vertices.length&&commonVertices.length===f.vertices.length,
    sameRoadSet:commonRoads.length===oldRoads.length&&commonRoads.length===f.roadIds.length,
    meanDisplacement:Math.hypot(before.x-after.x,before.y-after.y)});
  }
 }
 return {authority:'none',rows};
}
export function observeP6SmallFaceGeometry(extraction,b){
 const byRoad=new Map(),rows=[];
 for(const f of extraction.faces){
  for(const id of f.roadIds){b.spend();if(!byRoad.has(id))byRoad.set(id,[]);byRoad.get(id).push(f);}
 }
 for(const f of extraction.faces){
  b.spend();
  if(f.kind!=='block'||f.area>1)continue;
  const neighbors=new Map(),lengths=[];
  for(let i=0;i<f.roadIds.length;i++){
   b.spend();
   const id=f.roadIds[i],road=extraction.graph.roadsById.get(id);
   const a=extraction.graph.nodesById.get(road.a),c=extraction.graph.nodesById.get(road.b);
   lengths.push({roadId:id,length:Math.hypot(a.x-c.x,a.y-c.y),protected:extraction.graph.roadClasses.get(id).protected});
   for(const other of byRoad.get(id)){b.spend();if(other.key!==f.key)neighbors.set(other.key,{key:other.key,kind:other.kind,area:other.area});}
  }
  charge(b,lengths.length+neighbors.size);
  rows.push({key:f.key,area:f.area,vertices:f.vertices.length,edges:lengths,neighbors:[...neighbors.values()]});
 }
 return {authority:'none',rows};
}
