import { riEqual, riFreeze } from './road-impact-model.js';
import { inspectSpatialConcessionLedger } from './spatial-recovery-concessions.js';

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
  return sreMeasurePreservation(before,after,budget,false);
}
function sreMeasurePreservation(before,after,budget,allowConcessions){
  const cost=Object.fromEntries(sreMetricKeys.map(key=>[key,0]));
  for(const [a,b] of srePairs(before,after,'buildings',budget)){
    if(!allowConcessions&&(a.frontageRoadId!==b.frontageRoadId||Math.abs(a.area-b.area)>1e-6))
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
      if(!allowConcessions&&a.frontageRoadId!==b.frontageRoadId)throw Error('Unexpected preserving frontage.');
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


// A2 detached measurements. These do not certify an accepted edit: callers
// must separately reconstruct and fully verify each witness before ranking.
// Re-derive the permission/identity/geometry ledger from original records;
// never accept a claimed ledger or arbitrary area reduction from search.
export function scoreSpatialConcessions(before,input,after,budget){
  const ledger=inspectSpatialConcessionLedger(before,input,after,budget);
  let maxLinearReduction=0;
  for(const row of ledger.scaledBuildings){
    budget.spend();
    maxLinearReduction=Math.max(maxLinearReduction,1-row.factor);
  }
  const cost={frontageSwitches:ledger.frontageSwitches.length,
    scaledBuildings:ledger.scaledBuildings.length,footprintLoss:ledger.footprintLoss,
    maxLinearReduction,...sreMeasurePreservation(before,after,budget,true)};
  sreValidateConcessionCost(cost);
  return riFreeze(cost);
}
const sreConcessionMetricKeys=['frontageSwitches','scaledBuildings','footprintLoss','maxLinearReduction',...sreMetricKeys];
function sreValidateConcessionCost(cost){
  if(sreConcessionMetricKeys.some(key=>!Number.isFinite(cost?.[key])||cost[key]<0)||
    !['frontageSwitches','scaledBuildings','movedBuildings','accessChanges'].every(key=>Number.isSafeInteger(cost[key]))||
    cost.scaledBuildings>cost.movedBuildings||cost.maxLinearReduction>1||
    (!cost.scaledBuildings&&(cost.footprintLoss!==0||cost.maxLinearReduction!==0))||
    (cost.scaledBuildings&&(cost.footprintLoss<=0||cost.maxLinearReduction<=0)))
    throw Error('Invalid spatial concession cost.');
}
const sreConcessionTier=cost=>cost.scaledBuildings?2:cost.frontageSwitches?1:0;
// Candidate policy for detached qualification only: strict/packing before
// frontage-only before scaling; smaller maximum reduction before other
// costs within the scaling tier. Then fewer switches, less lost footprint,
// fewer scaled buildings, and the unchanged preservation priority.
// Exact ties retain the earlier verified incumbent at the selection site.
export function compareSpatialConcessionCost(a,b){
  sreValidateConcessionCost(a);sreValidateConcessionCost(b);
  const tier=sreConcessionTier(a)-sreConcessionTier(b);
  if(tier)return Math.sign(tier);
  // Quantize the independently measured reduction at the geometry
  // tolerance, so floating-point noise at one authorized scale cannot
  // outrank meaningful cost differences. Fixed bins preserve transitivity.
  const reduction=cost=>Math.round(cost.maxLinearReduction*1e6);
  if(reduction(a)!==reduction(b))return reduction(a)<reduction(b)?-1:1;
  for(const key of ['frontageSwitches','footprintLoss','scaledBuildings'])
    if(a[key]!==b[key])return a[key]<b[key]?-1:1;
  return compareSpatialPreservationCost(a,b);
}
