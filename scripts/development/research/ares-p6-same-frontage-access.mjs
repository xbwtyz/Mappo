// C2a: bounded same-road, fixed-door route observations for cooperative
// parcel proposals. No building, property, route or identity is mutated.
import {pointInPolygon} from '../../../src/core/geometry.js';
import {clearance,distanceToSegment,segmentCuts} from '../../../src/core/boundary.js';
import {shapeWellFormed} from '../../../src/core/building-validation.js';
import {classifyLareBuilding,classifyLareProperty} from '../../../src/core/reconciliation-policy.js';
import {transformLareBuilding,verifyLareRigidGeometry} from '../../../src/core/reconciliation-buildings.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {riEqual} from '../../../src/core/road-impact-model.js';
import {projectLareFrontageEndpoint} from '../../../src/core/reconciliation-access.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
const eps=1e-6;
const charge=(b,n)=>b.spend(Math.max(1,n));
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const near=(a,c)=>Math.hypot(a.x-c.x,a.y-c.y)<=eps;
const lerp=(a,c,t)=>({x:a.x+(c.x-a.x)*t,y:a.y+(c.y-a.y)*t});
function obstacle(id,kind,ring,b){
 const n=Array.isArray(ring)?ring.length:0;charge(b,8*n*n+n);
 if(!shapeWellFormed(ring))return null;
 const box=[Infinity,Infinity,-Infinity,-Infinity];
 for(const p of ring){b.spend();box[0]=Math.min(box[0],p.x);box[1]=Math.min(box[1],p.y);box[2]=Math.max(box[2],p.x);box[3]=Math.max(box[3],p.y);}
 return {id,kind,ring,box};
}
function crossesInterior(a,c,o,b){
 b.spend();
 const q=o.box;
 if(Math.max(a.x,c.x)<q[0]-eps||Math.min(a.x,c.x)>q[2]+eps||Math.max(a.y,c.y)<q[1]-eps||Math.min(a.y,c.y)>q[3]+eps)return false;
 const ring=o.ring,n=ring.length,cuts=[0,1];
 for(let i=0;i<n;i++){b.spend();cuts.push(...segmentCuts(a,c,ring[i],ring[(i+1)%n]));}
 charge(b,cuts.length*Math.max(1,Math.ceil(Math.log2(cuts.length+1))));cuts.sort((x,y)=>x-y);
 for(let i=1;i<cuts.length;i++){
  if(cuts[i]-cuts[i-1]<=1e-10)continue;
  charge(b,2*n);const p=lerp(a,c,(cuts[i]+cuts[i-1])/2);
  if(pointInPolygon(p,ring)&&clearance(p,ring)>eps)return true;
 }
 return false;
}
export function observeP6SameFrontageAccess(source,extraction,reshapes,cooperative,b){
 return observeAccess(source,extraction,reshapes,cooperative,b,new Map());
}
function observeAccess(source,extraction,reshapes,cooperative,b,placements){
 if(!b?.spend||!b?.expand||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(!extraction?.valid||reshapes?.status!=='parcel-reshape-observed'||cooperative?.status!=='cooperative-parcels-observed'||reshapes.authority!=='none'||cooperative.authority!=='none')return refuse('unqualified-input');
 const index=records=>{const m=new Map();for(const r of records){b.spend();if(m.has(r.id))return null;m.set(r.id,r);}return m;};
 const props=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),options=index(reshapes.rows),selected=index(cooperative.selected);
 if(!props||!plots||!buildings||!options||!selected)return refuse('duplicate-inventory');
 const faces=new Map(),obstacles=[],unknown=[],dependent=new Set(),proposed=new Map();
 for(const f of extraction.faces){b.spend();if(f.kind==='block')faces.set(f.key,f);}
 for(const s of selected.values()){
  b.spend();const p=props.get(s.id),option=options.get(s.id)?.options[s.index],face=faces.get(s.key);
  if(!p||!option||option.key!==s.key||option.authority!=='none'||option.frontageRoadId!==p.frontageRoadId||!face)return refuse('invalid-selected-parcel');
  charge(b,face.roadIds.length);
  if(!face.roadIds.includes(p.frontageRoadId))return refuse('missing-selected-frontage');
  proposed.set(s.id,option);
 }
 for(const p of props.values()){
  b.spend();const o=obstacle(p.id,'property',proposed.get(p.id)?.boundary??p.boundary,b);
  if(o)obstacles.push(o);else unknown.push({kind:'property',id:p.id});
 }
 for(const original of buildings.values()){
  b.spend();const building=placements.get(original.id)??original,g=building.geometry,regions=g?.regions;
  if(g?.courtyardAccess){
   dependent.add(building.id);
   for(const occupant of g.courtyardAccess.occupants??[]){b.spend();dependent.add(occupant.buildingId);}
  }
  if(!Array.isArray(regions)){unknown.push({kind:'building',id:building.id});continue;}
  let roots=0;
  for(const region of regions){
   b.spend();if(region.parentId!==null)continue;
   roots++;const o=obstacle(building.id,'building',region.ring,b);
   if(o)obstacles.push(o);else unknown.push({kind:'building',id:building.id});
  }
  if(!roots)unknown.push({kind:'building',id:building.id});
 }
 const rows=[],counts={retained:0,repaired:0,blocked:0,protected:0,unsupported:0};
 for(const s of selected.values()){
  b.spend();const p=props.get(s.id),option=proposed.get(p.id),ownPlots=[];
  for(const id of p.plotIds){b.spend();const plot=plots.get(id);if(!plot||plot.propertyId!==p.id)return refuse('invalid-plot-owner');ownPlots.push(plot);}
  aresReplayJson([p,ownPlots],b);const policy=classifyLareProperty(p,ownPlots);
  const road=extraction.graph.roadsById.get(p.frontageRoadId),a=extraction.graph.nodesById.get(road?.a),c=extraction.graph.nodesById.get(road?.b);
  const front=option.boundary.slice(0,2);
  for(const id of p.buildingIds){
   b.spend();const original=buildings.get(id),building=placements.get(id)??original;
   if(!building||building.propertyId!==p.id)return refuse('invalid-building-owner');
   const row={id,propertyId:p.id,frontageRoadId:building.frontageRoadId,classification:'unsupported',reason:null,route:null,attempts:0};
   const finish=(kind,reason=null,route=null)=>{row.classification=kind;row.reason=reason;row.route=route;counts[kind]++;rows.push(row);};
   const regions=building.geometry?.regions,door=building.entrance;
   if(unknown.length||dependent.has(id)||p.buildingCompounds?.length||!Array.isArray(regions)||regions.length!==1||regions[0].parentId!==null||!finite(door)||
      building.frontageRoadId!==p.frontageRoadId||!finite(a)||!finite(c)||near(a,c)){finish('unsupported','unsupported-route-context');continue;}
   const ring=regions[0].ring;
   charge(b,ring.length);
   if(!ring.some((v,i)=>distanceToSegment(door,v,ring[(i+1)%ring.length])<=eps)){finish('unsupported','door-not-on-wall');continue;}
   const pathClear=path=>{
    b.spend();if(!Array.isArray(path)||path.length<2)return false;
    for(const v of path){b.spend();if(!finite(v))return false;}
    if(!near(path[0],door)||distanceToSegment(path.at(-1),a,c)>eps)return false;
    let throughFront=false;
    for(let i=1;i<path.length;i++){
     b.spend();const x=path[i-1],y=path[i];if(near(x,y))return false;
     if(segmentCuts(x,y,front[0],front[1]).length)throughFront=true;
     for(const o of obstacles){
      b.spend();if(o.kind==='property'&&o.id===p.id)continue;
      if(crossesInterior(x,y,o,b))return false;
     }
    }
    return throughFront;
   };
   row.attempts++;b.expand();
   if(pathClear(building.accessPath)){finish('retained',null,{entrance:door,accessPath:building.accessPath,frontageRoadId:road.id});continue;}
   aresReplayJson(original,b);
   const permission=classifyLareBuilding(original,policy,false);
   if(permission.mode!=='rigid'||permission.provenance!=='generated'){finish('protected','access-decision-required');continue;}
   const destinations=[projectLareFrontageEndpoint(door,a,c),...[.125,.25,.375,.5,.625,.75,.875].map(t=>lerp(a,c,t))].filter(Boolean);
   let proposedRoute=null;
   for(const end of destinations){
    row.attempts++;b.expand();const path=[door,end];
    if(pathClear(path)){proposedRoute={entrance:door,accessPath:path,frontageRoadId:road.id};break;}
   }
   if(proposedRoute)finish('repaired',null,proposedRoute);else finish('blocked','same-door-route-not-found');
  }
 }
 const result={status:'same-frontage-access-observed',authority:'none',valid:false,landVerified:false,rows,counts,unknown,
  coverage:'selected-properties-fixed-door-roof-and-property-interior-only',unresolvedProperties:cooperative.unresolved,
  limitations:['no-alternative-frontage','no-door-movement','no-courtyard-repair','no-complete-road-defense-or-landscape-clearance','no-apply']};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}

// D1b3c: rederive permitted rigid witnesses, then run the same route
// observation against the entire extended arrangement. Original provenance
// controls repair; never stamp or persist the moved building records.
export function observeP6RelocatedAccess(source,extraction,reshapes,rigid,extension,b){
 if(!b?.spend||!b?.expand||!b?.snapshot)throw Error('Shared P6 budget required.');
 b.spend();
 const refuse=reason=>({status:'refused',reason,authority:'none',valid:false,landVerified:false});
 if(reshapes?.status!=='parcel-reshape-observed'||rigid?.status!=='rigid-translations-observed'||extension?.status!=='relocation-extension-observed'||[reshapes,rigid,extension].some(x=>x.authority!=='none'))return refuse('unqualified-input');
 const index=records=>{const m=new Map();for(const r of records){b.spend();if(typeof r.id!=='string'||m.has(r.id))return null;m.set(r.id,r);}return m;};
 const properties=index(source.properties),plots=index(source.plots),buildings=index(source.buildings),base=index(reshapes.rows),witnesses=index(rigid.rows),selected=index(extension.selected);
 if(!properties||!plots||!buildings||!base||!witnesses||!selected)return refuse('duplicate-inventory');
 const dependent=new Set(),placements=new Map(),relocatedOwners=new Set(),rows=[],choices=[];
 for(const p of properties.values())for(const c of p.buildingCompounds??[]){
  b.spend();for(const id of c.memberBuildingIds??[]){b.spend();dependent.add(id);}
 }
 for(const building of buildings.values()){
  b.spend();const g=building.geometry?.courtyardAccess;if(g){dependent.add(building.id);for(const o of g.occupants??[]){b.spend();dependent.add(o.buildingId);}}
 }
 for(const s of selected.values()){
  b.spend();const p=properties.get(s.id),r=base.get(s.id);
  if(!p||!r)return refuse('missing-selected-owner');
  if(s.kind==='ordinary'){
   const o=r.options[s.index];if(!o||o.key!==s.key||o.authority!=='none')return refuse('invalid-ordinary-option');
   rows.push({id:s.id,options:[o]});choices.push({id:s.id,key:s.key,index:0});continue;
  }
  const w=witnesses.get(s.id)?.witness,o=r.conditionalOptions?.[s.index];
  if(s.kind!=='relocated'||!w||!o||w.optionIndex!==s.index||w.key!==s.key||o.key!==s.key||w.authority!=='none'||o.authority!=='none'||o.requiresRigidPlacement!==true||o.frontageRoadId!==p.frontageRoadId||!Array.isArray(w.buildings)||w.buildings.length!==p.buildingIds.length)return refuse('invalid-relocation-option');
  const own=[];for(const id of p.plotIds){b.spend();const q=plots.get(id);if(!q||q.propertyId!==p.id)return refuse('invalid-plot-owner');own.push(q);}
  aresReplayJson([p,own],b);const policy=classifyLareProperty(p,own);
  for(let i=0;i<w.buildings.length;i++){
   b.spend();const candidate=w.buildings[i],original=buildings.get(candidate.id);
   if(!original||candidate.id!==p.buildingIds[i]||original.propertyId!==p.id||candidate.authority!=='none'||placements.has(candidate.id))return refuse('invalid-building-witness');
   aresReplayJson(original,b);aresReplayJson(candidate,b);
   const permission=classifyLareBuilding(original,policy,dependent.has(original.id)),regions=original.geometry?.regions;
   if(permission.mode!=='rigid'||permission.provenance!=='generated'||regions?.length!==1||original.components?.length!==1||p.buildingCompounds?.length)return refuse('protected-relocation-witness');
   const n=regions[0].ring.length;charge(b,64*n*n+n+original.accessPath.length);
   let next;
   try{next=transformLareBuilding(original,permission,candidate.transform,b);}
   catch(error){if(error instanceof LareBudgetExceeded)throw error;return refuse('invalid-rigid-transform');}
   if(!verifyLareRigidGeometry(original,next,b)||!riEqual(next.geometry,candidate.geometry)||!riEqual(next.entrance,candidate.entrance)||next.orientation!==candidate.orientation||next.area!==candidate.area)return refuse('rigid-witness-mismatch');
   placements.set(original.id,next);
  }
  relocatedOwners.add(s.id);rows.push({id:s.id,options:[o]});choices.push({id:s.id,key:s.key,index:0});
 }
 const access=observeAccess(source,extraction,{status:'parcel-reshape-observed',authority:'none',rows},
  {status:'cooperative-parcels-observed',authority:'none',selected:choices,unresolved:extension.unresolved},b,placements);
 if(access.status!=='same-frontage-access-observed')return refuse('extended-access-'+access.reason);
 const counts={retained:0,repaired:0,blocked:0,protected:0,unsupported:0},relocatedCounts={...counts},propertiesWithAllRoutes=[],failedProperties=new Set(),seenProperties=new Set();
 for(const row of access.rows){
  b.spend();counts[row.classification]++;
  if(relocatedOwners.has(row.propertyId))relocatedCounts[row.classification]++;
  seenProperties.add(row.propertyId);if(!row.route)failedProperties.add(row.propertyId);
 }
 for(const s of selected.values()){
  b.spend();const p=properties.get(s.id);
  if(!p.buildingIds.length||seenProperties.has(s.id)&&!failedProperties.has(s.id))propertiesWithAllRoutes.push(s.id);
 }
 const result={status:'relocated-access-observed',authority:'none',valid:false,landVerified:false,counts,relocatedCounts,rows:access.rows,
  propertiesWithAllRoutes,unresolvedProperties:extension.unresolved,coverage:'extended-arrangement-same-frontage-fixed-door-relative-to-building-only',
  limitations:access.limitations};
 const json=aresReplayJson(result,b);charge(b,Math.ceil(Buffer.byteLength(json)/64));return JSON.parse(json);
}
