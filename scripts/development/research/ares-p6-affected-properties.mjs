// Detached C1a property discovery, not geometric ownership or edit authority.
// Uses the accepted and proposed dry graphs already built under the same root.
import {STREET_WIDTHS,STREET_EDGE_WIDTH,PROPERTY_SETBACK} from '../../../src/core/placement.js';
import {classifyLareProperty} from '../../../src/core/reconciliation-policy.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const order=(a,c)=>a<c?-1:a>c?1:0;
const charge=(b,n)=>b.spend(Math.max(1,n));
const eps=1e-7;
function bounds(points,b){
 if(!Array.isArray(points)||!points.length)return null;
 const q={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const p of points){b.spend();if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return null;
  q.minX=Math.min(q.minX,p.x);q.minY=Math.min(q.minY,p.y);q.maxX=Math.max(q.maxX,p.x);q.maxY=Math.max(q.maxY,p.y);}
 return q;
}
const union=(a,c)=>({minX:Math.min(a.minX,c.minX),minY:Math.min(a.minY,c.minY),maxX:Math.max(a.maxX,c.maxX),maxY:Math.max(a.maxY,c.maxY)});
const inflate=(q,m)=>({minX:q.minX-m,minY:q.minY-m,maxX:q.maxX+m,maxY:q.maxY+m});
const touch=(a,c)=>a.minX<=c.maxX+eps&&c.minX<=a.maxX+eps&&a.minY<=c.maxY+eps&&c.minY<=a.maxY+eps;
const sorted=(xs,b)=>{charge(b,xs.length*Math.max(1,Math.ceil(Math.log2(xs.length+1))));return xs.sort(order);};
export function observeP6AffectedProperties(source,accepted,candidate,plan,ownership,b){
 if(!b?.spend||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,valid:false,authority:'none',landVerified:false});
 if(!accepted?.valid||!candidate?.valid||plan?.status!=='block-plan-observed'||plan.authority!=='none'||ownership?.status!=='block-ownership-observed'||ownership.authority!=='none')return refuse('unqualified-input');
 const affectedBlocks=new Set(),faceRows=new Map();
 for(const row of plan.rows){b.spend();faceRows.set(row.key,row);}
 const owners=new Map();
 for(const row of ownership.ledger){
  b.spend();owners.set(row.oldId,row.candidateKeys);
  for(const k of row.candidateKeys){b.spend();const face=faceRows.get(k);if(!face)return refuse('missing-face');
   if(face.relation!=='preserved')affectedBlocks.add(row.oldId);}
 }
 const roads=[],roadIds=new Set();
 for(const graph of [accepted,candidate])for(const id of graph.roadsById.keys()){b.spend();roadIds.add(id);}
 const endpoints=(graph,r)=>r?[graph.nodesById.get(r.a),graph.nodesById.get(r.b)]:null;
 const margin=r=>(STREET_WIDTHS[r.kind]+STREET_EDGE_WIDTH)/2+PROPERTY_SETBACK;
 for(const id of sorted([...roadIds],b)){
  b.spend();const old=accepted.roadsById.get(id),next=candidate.roadsById.get(id),a=endpoints(accepted,old),c=endpoints(candidate,next);
  if(old&&next&&old.a===next.a&&old.b===next.b&&old.kind===next.kind&&a.every((p,i)=>p&&c[i]&&Object.is(p.x,c[i].x)&&Object.is(p.y,c[i].y)))continue;
  const before=a?bounds(a,b):null,final=c?bounds(c,b):null;
  if((a&&(!before||!Number.isFinite(margin(old))))||(c&&(!final||!Number.isFinite(margin(next)))))return refuse('unsupported-road-geometry');
  const oldBox=before?inflate(before,margin(old)):null,newBox=final?inflate(final,margin(next)):null;
  roads.push({id,bounds:oldBox&&newBox?union(oldBox,newBox):oldBox??newBox});
 }
 const changedRoads=new Set(roads.map(r=>r.id)),properties=new Map(),plots=new Map(),buildings=new Map(),dependencyHits=new Map();
 for(const record of source.properties){b.spend();if(properties.has(record.id))return refuse('duplicate-property');properties.set(record.id,record);}
 for(const [records,index,collection] of [[source.plots,plots,'plots'],[source.buildings,buildings,'buildings']]){
  for(const record of records){
   b.spend();if(index.has(record.id)||!properties.has(record.propertyId))return refuse('invalid-dependent-owner');
   index.set(record.id,record);
   if(changedRoads.has(record.frontageRoadId)||affectedBlocks.has(record.blockId)){
    if(!dependencyHits.has(record.propertyId))dependencyHits.set(record.propertyId,[]);
    dependencyHits.get(record.propertyId).push({collection,id:record.id});
   }
  }
 }
 const rows=[],unsupported=[],counts={block:0,frontage:0,dependent:0,roadBounds:0,protectedOrUnsupported:0};
 for(const property of properties.values()){
  b.spend();
  const candidateKeys=owners.get(property.blockId);
  if(!candidateKeys)return refuse('missing-property-block');
  let q=Array.isArray(property.boundary)&&property.boundary.length>=3?bounds(property.boundary,b):null;
  if(property.frontage!==undefined){const f=bounds(property.frontage,b);q=q&&f?union(q,f):null;}
  const hits=[];
  if(q)for(const road of roads){b.spend();if(touch(q,road.bounds))hits.push(road.id);}
  else unsupported.push(property.id);
  const reasons=[];
  if(affectedBlocks.has(property.blockId)){reasons.push('changed-block');counts.block++;}
  if(changedRoads.has(property.frontageRoadId)){reasons.push('changed-frontage');counts.frontage++;}
  const deps=dependencyHits.get(property.id)??[];
  if(deps.length){reasons.push('dependent-reference');counts.dependent++;}
  if(hits.length){reasons.push('road-bounds-contact');counts.roadBounds++;}
  if(!q)reasons.push('unsupported-property-geometry');
  if(!reasons.length)continue;
  if(rows.length>=10000)return refuse('scope-limit');
  const ownPlots=[],ownBuildings=[];
  if(!Array.isArray(property.plotIds)||!Array.isArray(property.buildingIds))return refuse('missing-property-dependents');
  for(const [ids,index,out] of [[property.plotIds,plots,ownPlots],[property.buildingIds,buildings,ownBuildings]]){
   const seen=new Set();
   for(const id of ids){b.spend();const item=index.get(id);if(!item||item.propertyId!==property.id||seen.has(id))return refuse('invalid-property-dependent');seen.add(id);out.push(item);}
  }
  aresReplayJson([property,ownPlots],b);
  const policy=classifyLareProperty(property,ownPlots);
  if(policy.mode!=='adaptive'||!q)counts.protectedOrUnsupported++;
  charge(b,candidateKeys.length+deps.length*Math.max(1,Math.ceil(Math.log2(deps.length+1))));
  deps.sort((a,c)=>order(a.collection,c.collection)||order(a.id,c.id));
  rows.push({id:property.id,oldBlockId:property.blockId,candidateKeys:[...candidateKeys],reasons,roadBoundsHits:hits,dependentHits:deps,
   plotIds:sorted(ownPlots.map(r=>r.id),b),buildingIds:sorted(ownBuildings.map(r=>r.id),b),policy,classification:'observe-only'});
 }
 charge(b,rows.length*Math.max(1,Math.ceil(Math.log2(rows.length+1))));rows.sort((a,c)=>order(a.id,c.id));
 const result={status:unsupported.length?'property-geometry-unresolved':'affected-properties-observed',valid:false,authority:'none',landVerified:false,
  coverage:'known-block-frontage-dependent-and-road-envelope-observation',rows,unsupported:sorted(unsupported,b),counts,scanned:properties.size,
  affectedBlockIds:sorted([...affectedBlocks],b),changedRoadIds:sorted([...changedRoads],b),ownership:'not-assigned',fit:'not-evaluated'};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
