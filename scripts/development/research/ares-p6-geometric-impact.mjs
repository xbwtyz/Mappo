import {STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../../../src/core/placement.js';
import {WALL_EDGE_WIDTH} from '../../../src/core/fortification-geometry.js';
import {riCompare,riFreeze} from '../../../src/core/road-impact-model.js';

// Detached A2b conservative broad phase. The envelope of both old and new
// endpoints contains every linearly interpolated segment, including splits
// of the parent. Inflate by the existing placement margin. AABB contact is
// only a possible dependency, never collision, ownership or edit authority.
const key=(c,id)=>JSON.stringify([c,id]);
const eps=1e-7;
function box(points,b){
 if(!Array.isArray(points)||!points.length)return null;
 const q={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const p of points){
  b.spend();if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
  q.minX=Math.min(q.minX,p.x);q.maxX=Math.max(q.maxX,p.x);
  q.minY=Math.min(q.minY,p.y);q.maxY=Math.max(q.maxY,p.y);
 }
 return q;
}
function merge(a,c){return {minX:Math.min(a.minX,c.minX),minY:Math.min(a.minY,c.minY),maxX:Math.max(a.maxX,c.maxX),maxY:Math.max(a.maxY,c.maxY)};}
function inflate(a,m){return {minX:a.minX-m,minY:a.minY-m,maxX:a.maxX+m,maxY:a.maxY+m};}
function touches(a,c){return a.minX<=c.maxX+eps&&c.minX<=a.maxX+eps&&a.minY<=c.maxY+eps&&c.minY<=a.maxY+eps;}
export function observeP6GeometricImpact(city,w,observation,b){
 if(!b?.spend)throw Error('Shared P6 budget required.');
 const old=new Map(),proposed=new Map(),split=new Set(),roads=[];
 for(const n of city.nodes){b.spend();old.set(n.id,n);}
 for(const n of w.requested){b.spend();proposed.set(n.ref.id,n.point);}
 for(const n of w.neighbors){b.spend();proposed.set(n.id,n.point);}
 for(const l of w.lineage){b.spend();split.add(l.parent);}
 for(const r of city.roads){
  b.spend();if(!split.has(r.id)&&!proposed.has(r.a)&&!proposed.has(r.b))continue;
  const a=old.get(r.a),c=old.get(r.b),p=proposed.get(r.a)??a,q=proposed.get(r.b)??c;
  const before=box([a,c],b),after=box([p,q],b),margin=(STREET_WIDTHS[r.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
  if(!before||!after||!Number.isFinite(margin))throw Error('Unsupported P6 road geometry.');
  roads.push({id:r.id,before:inflate(before,margin),final:inflate(after,margin),swept:inflate(merge(before,after),margin)});
 }
 b.spend(Math.max(1,roads.length*Math.ceil(Math.log2(roads.length+1))));
 roads.sort((a,c)=>riCompare(a.id,c.id));
 const seen=new Set(),external=new Set(),union=new Set(),blockBoxes=new Map(),rows=[],unsupported=[],counts={};
 for(const o of observation.objects){b.spend();const k=key(o.ref.collection,o.ref.id);seen.add(k);union.add(k);}
 for(const o of observation.external??[]){b.spend();external.add(key(o.ref.collection,o.ref.id));}
 let comparisons=0,scanned=0,limit=false;
 const vertexBox=r=>{
  if(!Array.isArray(r.vertices)||r.vertices.length<3)return null;
  b.spend(r.vertices.length);return box(r.vertices.map(id=>old.get(id)),b);
 };
 const ringBox=r=>Array.isArray(r)&&r.length>=3?box(r,b):null;
 function report(collection,id,bounds,protectedContext=false){
  b.spend();scanned++;
  const ref={collection,id},k=key(collection,id);
  if(!bounds){unsupported.push(ref);return;}
  const hits=[];
  for(const road of roads){
   b.spend();comparisons++;
   if(touches(bounds,road.swept))hits.push({roadId:road.id,before:touches(bounds,road.before),final:touches(bounds,road.final)});
  }
  if(!hits.length)return;
  const membership=seen.has(k)?'explicit':external.has(k)?'external':'outside-explicit';
  if(!union.has(k)&&union.size>=10000){limit=true;return;}
  union.add(k);rows.push({ref,membership,protectedContext,hits});
  const c=counts[collection]??={candidates:0,outsideExplicit:0,sweptOnly:0};
  c.candidates++;if(membership==='outside-explicit')c.outsideExplicit++;
  if(hits.every(h=>!h.before&&!h.final))c.sweptOnly++;
 }
 for(const r of city.blocks??[]){b.spend();const q=vertexBox(r);blockBoxes.set(r.id,q);report('blocks',r.id,q);}
 for(const r of city.properties??[]){
  b.spend();let q=ringBox(r.boundary);
  if(r.frontage!==undefined){const f=box(r.frontage,b);q=q&&f?merge(q,f):null;}
  report('properties',r.id,q);
 }
 for(const r of city.plots??[]){b.spend();report('plots',r.id,ringBox(r.boundary));}
 for(const r of city.buildings??[]){
  b.spend();let q=null,ok=Array.isArray(r.geometry?.regions)&&r.geometry.regions.length>0;
  for(const region of r.geometry?.regions??[]){
   b.spend();const v=ringBox(region.ring);if(!v){ok=false;continue;}q=q?merge(q,v):v;
  }
  const access=box([r.entrance,...(r.accessPath??[])],b);
  if(!access)ok=false;
  if(q&&access)q=merge(q,access);
  report('buildings',r.id,ok?q:null);
 }
 for(const r of city.openSpaces??[]){b.spend();report('openSpaces',r.id,blockBoxes.get(r.blockId)??null);}
 // Node-backed protected faces and square. Other protected context uses
 // conservative source bounds, never a grant of land or crossing authority.
 for(const c of ['waterFaces','terrainFaces'])for(const r of city[c]??[]){b.spend();report(c,r.id,vertexBox(r),true);}
 if(city.plaza)report('plaza',city.plaza.id,vertexBox(city.plaza),true);
 const featureBoxes=new Map(),wallBoxes=new Map(),crossingBoxes=new Map();
 const expanded=(q,m)=>q&&Number.isFinite(m)&&m>=0?inflate(q,m):null;
 for(const collection of ['waterFeatures','terrainFeatures'])for(const r of city[collection]??[]){
  b.spend();const q=ringBox(r.corridor);featureBoxes.set(key(collection,r.id),q);report(collection,r.id,q,true);
 }
 for(const r of city.roads){
  b.spend();
  for(const [collection,id] of [['bridges',r.bridgeId],['terrainPasses',r.passId]]){
   if(id==null)continue;
   b.spend();const k=key(collection,id),q=expanded(box([old.get(r.a),old.get(r.b)],b),(STREET_WIDTHS[r.kind]+STREET_EDGE_WIDTH)/2);
   if(!q){crossingBoxes.set(k,null);continue;}
   if(crossingBoxes.has(k)){const prior=crossingBoxes.get(k);crossingBoxes.set(k,prior?merge(prior,q):null);}else crossingBoxes.set(k,q);
  }
 }
 for(const [collection,ownerCollection,ownerField] of [['bridges','waterFeatures','waterId'],['terrainPasses','terrainFeatures','terrainId']])for(const r of city[collection]??[]){
  b.spend();const owner=featureBoxes.get(key(ownerCollection,r[ownerField])),crossing=crossingBoxes.get(key(collection,r.id));
  // Include the whole owner envelope as context; missing actual crossing
  // geometry is unsupported rather than silently guessed from owner alone.
  const q=owner&&crossing&&Number.isFinite(r.width)&&r.width>=0?expanded(merge(owner,crossing),r.width):null;
  report(collection,r.id,q,true);
 }
 for(const r of city.walls??[]){
  b.spend();const q=expanded(box(r.path,b),(r.width+(r.edgeWidth??WALL_EDGE_WIDTH))/2+.5);
  wallBoxes.set(r.id,q);report('walls',r.id,q,true);
 }
 for(const r of city.towers??[]){b.spend();report('towers',r.id,expanded(box([r.center],b),r.radius+.5),true);}
 for(const r of city.gates??[]){
  b.spend();const owner=wallBoxes.get(r.wallId),approach=box(r.connection?.points,b);
  const q=owner&&approach&&Number.isFinite(r.postRadius)&&r.postRadius>=0&&Number.isFinite(r.opening)&&r.opening>=0&&Number.isFinite(r.connection?.width)&&r.connection.width>=0?
   expanded(merge(owner,approach),Math.max(r.postRadius,r.connection.width/2)):null;
  report('gates',r.id,q,true);
 }
 // District membership is context, not permission to change every parcel.
 for(const r of city.districts??[]){
  b.spend();let q=null,ok=Array.isArray(r.blockIds)&&r.blockIds.length>0;
  for(const id of r.blockIds??[]){b.spend();const v=blockBoxes.get(id);if(!v){ok=false;continue;}q=q?merge(q,v):v;}
  report('districts',r.id,ok?q:null,true);
 }
 const order=(a,c)=>riCompare(key(a.ref?.collection??a.collection,a.ref?.id??a.id),key(c.ref?.collection??c.collection,c.ref?.id??c.id));
 for(const a of [rows,unsupported]){b.spend(Math.max(1,a.length*Math.ceil(Math.log2(a.length+1))));a.sort(order);}
 return riFreeze({authority:'none',status:limit?'scope-limit':unsupported.length?'unsupported-geometry':'broad-phase-observed',
  coverage:'known-source-geometry-bounds-only',landVerified:false,roadCount:roads.length,scanned,comparisons,unionSize:union.size,counts,unsupported,rows});
}
