// C2a: bounded same-road, fixed-door route observations for cooperative
// parcel proposals. No building, property, route or identity is mutated.
import {pointInPolygon} from '../../../src/core/geometry.js';
import {clearance,distanceToSegment,segmentCuts} from '../../../src/core/boundary.js';
import {shapeWellFormed} from '../../../src/core/building-validation.js';
import {classifyLareBuilding,classifyLareProperty} from '../../../src/core/reconciliation-policy.js';
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
 for(const building of buildings.values()){
  b.spend();const g=building.geometry,regions=g?.regions;
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
   b.spend();const building=buildings.get(id);
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
   aresReplayJson(building,b);
   const permission=classifyLareBuilding(building,policy,false);
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
