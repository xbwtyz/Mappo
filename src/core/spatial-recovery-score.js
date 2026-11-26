import { riEqual, riFreeze } from './road-impact-model.js';

// Detached scoring only. The caller must independently verify the witness
// before ranking it. This preservation tier cannot compare destructive or
// scaling candidates; later strategies require their own verified metrics.
const sreMetricKeys=['movedBuildings','displacement','rotation','propertyDeformation','plotDeformation','accessChanges'];
const sreCenter=b=>{
  const points=b.geometry.regions.flatMap(r=>r.ring);
  if(!points.length)throw Error('Missing spatial footprint.');
  return {x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
};
const sreDist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function sreRingCost(a,b,budget){
  if(a.length!==b.length)throw Error('Unexpected preserving ring topology.');
  let sum=0;
  for(let i=0;i<a.length;i++){budget.spend();sum+=sreDist(a[i],b[i]);}
  return sum;
}
function srePairs(before,after,key,budget){
  const a=before.city[key],b=after.city[key];
  if(a.length!==b.length)throw Error('Unexpected preserving membership.');
  const index=new Map();
  for(const r of b){budget.spend();if(index.has(r.id))throw Error('Duplicate preserving identity.');index.set(r.id,r);}
  return a.map(r=>{
    budget.spend();
    if(!index.has(r.id))throw Error('Unexpected preserving membership.');
    const next=index.get(r.id);index.delete(r.id);return [r,next];
  });
}
export function scoreSpatialPreservation(before,after,budget){
  const cost=Object.fromEntries(sreMetricKeys.map(key=>[key,0]));
  for(const [a,b] of srePairs(before,after,'buildings',budget)){
    if(a.frontageRoadId!==b.frontageRoadId||Math.abs(a.area-b.area)>1e-6)
      throw Error('Unexpected preserving concession.');
    if(!riEqual(a.geometry,b.geometry)||a.orientation!==b.orientation){
      budget.spend(Math.max(1,a.geometry.regions.reduce((n,r)=>n+r.ring.length,0)+b.geometry.regions.reduce((n,r)=>n+r.ring.length,0)));
      cost.movedBuildings++;
      cost.displacement+=sreDist(sreCenter(a),sreCenter(b));
      cost.rotation+=Math.abs(Math.atan2(Math.sin(b.orientation-a.orientation),Math.cos(b.orientation-a.orientation)));
    }
    if(!riEqual(a.entrance,b.entrance)||!riEqual(a.accessPath,b.accessPath))cost.accessChanges++;
  }
  for(const [collection,metric] of [['properties','propertyDeformation'],['plots','plotDeformation']]){
    for(const [a,b] of srePairs(before,after,collection,budget)){
      if(a.frontageRoadId!==b.frontageRoadId)throw Error('Unexpected preserving frontage.');
      cost[metric]+=sreRingCost(a.boundary,b.boundary,budget);
    }
  }
  if(sreMetricKeys.some(key=>!Number.isFinite(cost[key])||cost[key]<0))throw Error('Invalid spatial score.');
  return riFreeze(cost);
}
export function compareSpatialPreservationCost(a,b){
  for(const key of sreMetricKeys){
    if(!Number.isFinite(a?.[key])||a[key]<0||!Number.isFinite(b?.[key])||b[key]<0)
      throw Error('Invalid spatial score.');
  }
  for(const key of sreMetricKeys)if(a[key]!==b[key])return a[key]<b[key]?-1:1;
  return 0;
}
// A tie or absent challenger retains the independently verified incumbent.
// No strategy can turn a refusal into acceptance via its claimed score.
export function preferVerifiedSpatialPreservation(incumbent,challenger){
  if(!challenger)return incumbent;
  if(!incumbent)return challenger;
  return compareSpatialPreservationCost(challenger.cost,incumbent.cost)<0?challenger:incumbent;
}
