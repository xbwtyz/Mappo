import {polygonSignedArea,pointInPolygon} from '../../../src/core/geometry.js';
import {segmentCuts,lerpPoint,clearance} from '../../../src/core/boundary.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
// Called only on independently reconstructed P5 candidate, after full
// graph/lineage verification. No search feedback, no authority, same audit root.
export function auditAdaptiveHub(original,candidate,hub,b){
 if(!b?.spend)throw Error('Shared independent budget required.');
 const fail=reason=>riFreeze({status:'rejected',reason,authority:'none'});
 const index=rows=>{const m=new Map();for(const r of rows){b.spend();m.set(r.id,r);}return m;};
 const source=original.blocks.find(r=>{b.spend();return r.id===hub?.id;});
 if(!source||hub.id!=='BLK-TRIAL-HUB'||!Array.isArray(hub.vertices)||hub.vertices.length<4||new Set(hub.vertices).size!==hub.vertices.length||JSON.stringify(source.vertices)!==JSON.stringify(hub.vertices)||source.area!==hub.area)return fail('hub-source');
 const old=index(original.nodes),next=index(candidate.nodes),oldRoads=index(original.roads),newRoads=index(candidate.roads);
 const before=hub.vertices.map(id=>{b.spend();return old.get(id);}),ring=hub.vertices.map(id=>{b.spend();return next.get(id);});
 if([...before,...ring].some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return fail('hub-missing-vertex');
 const oldArea=polygonSignedArea(before),area=polygonSignedArea(ring);
 b.spend(2*ring.length);
 if(!(oldArea>1&&area>1))return fail('hub-collapse-or-winding');
 const perimeter=new Set(hub.roadIds);
 if(perimeter.size!==ring.length)return fail('hub-perimeter-count');
 for(let i=0;i<ring.length;i++){
  const u=hub.vertices[i],v=hub.vertices[(i+1)%ring.length];
  let count=0;
  for(const id of perimeter){
   b.spend();const p=oldRoads.get(id),q=newRoads.get(id);
   if(!p||!q||p.a!==q.a||p.b!==q.b||p.kind!==q.kind)return fail('hub-parent-changed');
   if(p.a===u&&p.b===v||p.b===u&&p.a===v)count++;
  }
  if(count!==1||Math.hypot(ring[i].x-ring[(i+1)%ring.length].x,ring[i].y-ring[(i+1)%ring.length].y)<=1e-7)return fail('hub-open-perimeter');
  for(let j=i+1;j<ring.length;j++){
   b.spend(16);if(j===i+1||i===0&&j===ring.length-1)continue;
   if(segmentCuts(ring[i],ring[(i+1)%ring.length],ring[j],ring[(j+1)%ring.length]).length)return fail('hub-self-intersection');
  }
 }
 const interior=p=>{b.spend(2*ring.length);return pointInPolygon(p,ring)&&clearance(p,ring)>1e-7;};
 for(const n of candidate.nodes){b.spend();if(interior(n))return fail('hub-interior-junction');}
 for(const r of candidate.roads){
  b.spend();if(perimeter.has(r.id))continue;
  const p=next.get(r.a),q=next.get(r.b);if(!p||!q)return fail('hub-road-endpoint');
  const cuts=[0,1];for(let i=0;i<ring.length;i++){b.spend(16);cuts.push(...segmentCuts(p,q,ring[i],ring[(i+1)%ring.length]));}
  b.spend(Math.max(1,cuts.length*Math.ceil(Math.log2(cuts.length+1))));cuts.sort((x,y)=>x-y);
  for(let i=1;i<cuts.length;i++){b.spend();if(cuts[i]-cuts[i-1]>1e-9&&interior(lerpPoint(p,q,(cuts[i]+cuts[i-1])/2)))return fail('hub-through-road');}
 }
 return riFreeze({status:'hub-verified',authority:'none',oldArea,area,vertices:ring.length,perimeterRoads:perimeter.size,landVerified:false});
}
