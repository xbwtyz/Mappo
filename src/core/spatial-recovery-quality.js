import { recordSpatialRestorationBasis } from './spatial-recovery-restoration-trail.js';
import { spatialRefKey } from './spatial-recovery-contract.js';
import { createLareBudget, LareBudgetExceeded, LARE_DEMOLITION_LIMITS } from './reconciliation-budget.js';
import { searchSpatialRetirementSubsetRoadGroup } from './spatial-recovery-road-adapter.js';
import { riCompare } from './road-impact-model.js';
import { measureSpatialRetirementCost, improvesSpatialRetirementCost } from './spatial-recovery-score.js';

// Explicit detached quality allowance. Existing standard LARE ceilings
// remain unchanged; quality is not a saved setting or permission.
export const SRE_HIGH_QUALITY_LIMITS=Object.freeze({work:256000000,stateExpansions:131072});
export function createSpatialHighQualityBudget(){
  return createLareBudget(SRE_HIGH_QUALITY_LIMITS,{ceiling:SRE_HIGH_QUALITY_LIMITS});
}

// Bounded child trials retain the ordinary per-trial limits and charge the
// same operation-owned parent. A quality mode never changes eligibility.
function sreQualityChildBudget(parent){
  const remaining=parent.snapshot();
  const cap={work:Math.min(5000000,remaining.remainingWork-20000),
    stateExpansions:Math.min(16384,remaining.remainingExpansions)};
  if(cap.work<1||cap.stateExpansions<1)return null;
  return createLareBudget(cap,{parent,ceiling:LARE_DEMOLITION_LIMITS});
}
// Restore eligible retired children of surviving properties, smaller
// footprints first. Exact remaining-set deduplication spans coordinator
// passes. No new retirements or additions; independently verified cost only.
export async function restoreSpatialPriorityChildren(project,operation,seed,budget,seen,{captureRestorationAudit=false}={}){
  let incumbent={delta:seed.basisDelta,ledger:seed.ledger},exhausted=null;
  const attempts=[],restorationTrail=captureRestorationAudit?[]:null;
  const finish=()=>({status:'verified-witness',...incumbent,attempts,exhausted,
    ...(restorationTrail===null?{}:{restorationTrail})});
  try{
    const buildings=new Map(project.city.buildings.map(b=>[b.id,b]));
    budget.spend(Math.max(1,buildings.size));
    const p=operation.permissions;
    const scale=p.alternativeFrontage?(p.uniformScaling?1-p.maxLinearReduction:1):null;
    const children=()=>{
      const keys=new Set(incumbent.delta.retired.map(spatialRefKey));
      budget.spend(Math.max(1,keys.size));
      return incumbent.delta.retired.filter(r=>{
        budget.spend();
        return r.collection==='buildings'&&!keys.has(spatialRefKey({collection:'properties',id:buildings.get(r.id).propertyId}));
      }).sort((a,b)=>{budget.spend();return buildings.get(a.id).area-buildings.get(b.id).area||riCompare(a.id,b.id);});
    };
    for(const size of [4,2,1]){
      const rows=children();
      for(let i=0;i<rows.length;i+=size){
        if(attempts.length>=12)return finish();
        const keys=new Set(rows.slice(i,i+size).map(spatialRefKey));
        const remaining=incumbent.delta.retired.filter(r=>{budget.spend();return !keys.has(spatialRefKey(r));});
        if(!remaining.length||remaining.length===incumbent.delta.retired.length)continue;
        const key=JSON.stringify([remaining.map(spatialRefKey).sort(riCompare),scale]);
        if(seen.has(key))continue;
        const trialBudget=sreQualityChildBudget(budget);
        if(!trialBudget)return finish();
        seen.add(key);
        const row={size,restoring:incumbent.delta.retired.length-remaining.length,status:'refused',selected:false};
        attempts.push(row);
        try{
          const result=await searchSpatialRetirementSubsetRoadGroup(project,operation,remaining,trialBudget,{diagnosticScale:scale});
          row.status=result.status;row.exhausted=result.exhausted??null;
          if(result.status!=='verified-witness')continue;
          const expected=new Set(remaining.map(spatialRefKey));
          if(result.delta.added.length||result.delta.retired.length!==expected.size||
            result.delta.retired.some(r=>!expected.has(spatialRefKey(r))))throw Error('Unexpected priority child retirement membership.');
          if(improvesSpatialRetirementCost(measureSpatialRetirementCost(result.ledger,trialBudget),measureSpatialRetirementCost(incumbent.ledger,trialBudget))){
            incumbent={delta:result.delta,ledger:result.ledger};row.selected=true;
            recordSpatialRestorationBasis(restorationTrail,result.delta);
          }
        }catch(error){
          if(!(error instanceof LareBudgetExceeded))throw error;
          row.exhausted=error.resource;
        }finally{row.work=trialBudget.snapshot().work;}
      }
    }
    return finish();
  }catch(error){
    if(!(error instanceof LareBudgetExceeded))throw error;
    exhausted=error.resource;return finish();
  }
}
