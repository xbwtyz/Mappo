import { pointInPolygon } from '../core/geometry.js';
import { distanceToSegment, clearance, segmentCuts } from '../core/boundary.js';
import { shapeContained, shapeWellFormed, shapesOverlapInterior } from '../core/building-validation.js';
import { previewBuildingGeometry } from '../core/building-transform.js';
import { classifyRoadProvenance } from '../core/road-provenance.js';
import { deriveOccupiedPlots, reattachFrontage } from './building-application.js';

const EPS=1e-6;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

function segmentEntersPolygon(a,b,poly){
  const cuts=[0,1];
  for(let i=0;i<poly.length;i++)
    cuts.push(...segmentCuts(a,b,poly[i],poly[(i+1)%poly.length]));
  cuts.sort((x,y)=>x-y);
  for(let i=1;i<cuts.length;i++){
    const m=lerp(a,b,(cuts[i-1]+cuts[i])/2);
    if(pointInPolygon(m,poly)&&clearance(m,poly)>EPS)return true;
  }
  return false;
}

function routeVerified(city,building){
  const {entrance,accessPath:path,frontageRoadId}=building;
  if(!entrance||!Array.isArray(path)||path.length<2||
     path.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))||
     dist(entrance,path[0])>EPS)return false;
  if(!building.footprint.some((p,i)=>
    distanceToSegment(entrance,p,building.footprint[(i+1)%building.footprint.length])<=EPS))
    return false;
  const road=city.roads.find(r=>r.id===frontageRoadId),
    a=city.nodes.find(n=>n.id===road?.a),b=city.nodes.find(n=>n.id===road?.b);
  if(!a||!b||distanceToSegment(path.at(-1),a,b)>EPS)return false;
  for(let k=1;k<path.length;k++){
    const p=path[k-1],q=path[k];
    if(dist(p,q)<EPS||segmentEntersPolygon(p,q,building.footprint))return false;
    if(city.buildings.some(other=>other.id!==building.id&&segmentEntersPolygon(p,q,other.footprint)))
      return false;
    if(city.properties.some(prop=>prop.id!==building.propertyId&&
      segmentEntersPolygon(p,q,prop.boundary)))return false;
  }
  return true;
}

function proposeRoute(city,building,roads){
  for(const road of [building.frontageRoadId,...roads].filter((id,i,arr)=>arr.indexOf(id)===i)){
    if(!city.roads.some(r=>r.id===road))continue;
    const trial={...building,frontageRoadId:road};
    const route=reattachFrontage(city,trial);
    if(route){
      const candidate={...trial,entrance:route.entrance,accessPath:route.accessPath};
      if(routeVerified(city,candidate))return candidate;
    }
  }
  return null;
}

function proposeRelocation(city,property,building,roads){
  // Stable bounded search; rigid transforms preserve holes, shape and building ID.
  const offsets=[[0,0],[0,4],[4,0],[0,-4],[-4,0],
    [6,6],[-6,6],[6,-6],[-6,-6],[0,10],[10,0],[0,-10],[-10,0]];
  for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    for(const [dx,dy] of offsets){
      const moved=previewBuildingGeometry(building,{dx,dy,angle});
      if(!shapeWellFormed(moved.footprint)||!shapeContained(moved.footprint,property.boundary)||
        city.buildings.some(other=>other.id!==building.id&&
          shapesOverlapInterior(moved.footprint,other.footprint)))continue;
      const plotIds=deriveOccupiedPlots(city,property,moved);
      if(!plotIds.length)continue;
      const candidate=proposeRoute(city,{...moved,plotIds},roads);
      if(candidate)return {...candidate,plotIds};
    }
  }
  return null;
}

// Mutates only a detached candidate city. It never relocates or deletes a
// building unless its proposed operation is proven and, when necessary,
// individually approved. All existing plots remain unchanged.
export function reconcileMergeBuildings026(city,property,roads,originals,approved=new Set()){
  const issues=[],changes=[];
  for(const id of property.buildingIds){
    const building=city.buildings.find(b=>b.id===id);
    const original=originals.get(id);
    if(!building||!original){
      issues.push({code:'building',targetId:id,message:'Source building identity is missing.'});
      continue;
    }
    if(!shapeContained(building.footprint,property.boundary)){
      issues.push({code:'building',targetId:id,message:'Building leaves the merged property.'});
      continue;
    }
    if(routeVerified(city,building))continue;
    let candidate=proposeRoute(city,building,roads),kind='entrance-or-route';
    if(!candidate){kind='relocation';candidate=proposeRelocation(city,property,building,roads);}
    if(!candidate){
      issues.push({code:'access',targetId:id,message:'No verified access repair or safe relocation for building '+id+'.'});
      continue;
    }
    if(!shapeContained(candidate.footprint,property.boundary)||
       !candidate.plotIds?.length||!routeVerified(city,candidate)){
      issues.push({code:'building',targetId:id,message:'Building adaptation failed geometry or access validation.'});
      continue;
    }
    const protectedRecord=classifyRoadProvenance(original)!=='generated';
    const change={buildingId:id,kind,protected:protectedRecord,approved:approved.has(id),
      originalRecord:original,
      before:{footprint:original.footprint,entrance:original.entrance,accessPath:original.accessPath,
        frontageRoadId:original.frontageRoadId},
      after:{footprint:candidate.footprint,entrance:candidate.entrance,accessPath:candidate.accessPath,
        frontageRoadId:candidate.frontageRoadId}};
    changes.push(change);
    if(protectedRecord&&!approved.has(id)){
      issues.push({code:'authorization',targetId:id,message:'Approve proposed '+kind+' for protected building '+id+'.'});
      continue;
    }
    Object.assign(building,candidate,{roadProvenance:{source:'user-merge-e3'}});
  }
  return {changes,issues};
}
