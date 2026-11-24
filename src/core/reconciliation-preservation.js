import { verifyRoadGroupPreservationB1 } from './road-group-preservation-b1.js';
import { riEqual,riIndex } from './road-impact-model.js';
import { createLareContext } from './reconciliation-context.js';
import { classifyRoadProvenance } from './road-provenance.js';
import { verifyLareRigidGeometry } from './reconciliation-buildings.js';
import { verifyLarePlotDeformation } from './reconciliation-plots.js';
import { LareBudgetExceeded } from './reconciliation-budget.js';

const lareGateFail=(kind,id,code,message)=>({kind,id,code,message,severity:'needs-review'});
const lareGateChanged=(a,b,keys)=>keys.some(k=>!riEqual(a[k],b[k]));
const lareGateParcelFields=['boundary','frontage','frame','local','area','roadProvenance'];

// Recompute all permission and preservation checks independently of search
// scores, ledger, or claimed dispositions. Both the incumbent and every new
// arrangement must pass this gate before full project validation.
export function verifyLareGroupPreservation(before,after,draft,choices,budget){
  const violation=verifyRoadGroupPreservationB1(before,after,draft);
  if(violation)return violation;
  const group=draft.selectedRoadIds?.[0]??'group';
  try{
    const context=createLareContext(before,draft,choices,budget);
    const old=before.city,next=after.city;
    const aProps=riIndex(old.properties),bProps=riIndex(next.properties);
    const aPlots=riIndex(old.plots),bPlots=riIndex(next.plots);
    const aBuildings=riIndex(old.buildings),bBuildings=riIndex(next.buildings);
    const prior=old.roadParcelDecisionHistory028??[],archive=next.roadParcelDecisionHistory028??[];
    const appended=new Map();
    for(const row of archive.slice(prior.length)){
      budget.spend();
      const p=aProps.get(row.sourceId),choice=choices.get(row.sourceId);
      if(!p||!choice||choice.kind!==row.kind||!['keep','reshape'].includes(row.kind)||
        row.targetId!==null||appended.has(p.id)||classifyRoadProvenance(p,p.plotIds.map(id=>aPlots.get(id)))==='generated'||
        !riEqual(row.source,{property:p,plots:p.plotIds.map(id=>aPlots.get(id)),buildings:p.buildingIds.map(id=>aBuildings.get(id))}))
        return lareGateFail('property',row.sourceId??group,'lare-archive','Authored parcel archive lacks a matching explicit decision and original snapshot.');
      appended.set(p.id,row.kind);
    }
    if(archive.length>24)return lareGateFail('road',group,'lare-archive','Authored parcel decision archive capacity exceeded.');
    const contextIds=new Set(context.properties.map(p=>p.id));
    for(const id of appended.keys())if(!contextIds.has(id))
      return lareGateFail('property',id,'lare-archive','Archive entry is outside the affected neighborhood.');
    for(const entry of context.properties){
      const a=aProps.get(entry.id),b=bProps.get(entry.id);
      const ap=entry.plotIds.map(id=>aPlots.get(id)),bp=entry.plotIds.map(id=>bPlots.get(id));
      budget.spend(Math.max(1,ap.length+entry.buildings.length));
      const changed=lareGateChanged(a,b,lareGateParcelFields)||ap.some((p,i)=>!riEqual(p,bp[i]));
      if(entry.policy.mode==='invalid-choice')
        return lareGateFail('property',a.id,'lare-decision-invalid','The parcel decision does not authorize this edit.');
      if(changed&&!['adaptive','authorized-reshape'].includes(entry.policy.mode))
        return lareGateFail('property',a.id,'lare-fixed-parcel','Protected parcel or plot geometry would change without authorization.');
      if(changed&&entry.policy.mode==='authorized-reshape'&&appended.get(a.id)!=='reshape')
        return lareGateFail('property',a.id,'lare-archive','A reshape must preserve the original authored parcel snapshot.');
      if(changed&&entry.policy.provenance==='generated'&&classifyRoadProvenance(b,bp)!=='generated')
        return lareGateFail('property',a.id,'lare-provenance','Generated parcel provenance would become inconsistent.');
      if(!riEqual(a.boundary,b.boundary)||ap.some((p,i)=>!riEqual(p.boundary,bp[i].boundary))){
        try{verifyLarePlotDeformation(b.boundary,ap,bp,budget);}
        catch(error){if(error instanceof LareBudgetExceeded)throw error;
          return lareGateFail('property',a.id,'lare-plot-topology',error.message);}
      }
      // The previously approved authored courtyard repair is intentionally
      // narrower than permission to relocate a building or change its portals.
      const courtyardMembers=new Set();
      if(entry.policy.mode==='authorized-reshape'&&appended.get(a.id)==='reshape')
        for(const id of a.buildingIds){
          const host=aBuildings.get(id),occupants=host.geometry?.courtyardAccess?.occupants??[];
          if(occupants.length){courtyardMembers.add(id);for(const o of occupants)courtyardMembers.add(o.buildingId);}
        }
      for(const policy of entry.buildings){
        const original=aBuildings.get(policy.id),candidate=bBuildings.get(policy.id);
        budget.spend();
        const moved=lareGateChanged(original,candidate,['geometry','orientation','area']);
        if(moved&&(policy.mode!=='rigid'||!verifyLareRigidGeometry(original,candidate,budget)))
          return lareGateFail('building',policy.id,'lare-rigid-preservation','The building is fixed or its complete geometry is not one rigid transformation.');
        const routeChanged=lareGateChanged(original,candidate,['entrance','accessPath']);
        const approvedCourtyard=courtyardMembers.has(policy.id)&&original.frontageRoadId===a.frontageRoadId;
        if(routeChanged&&policy.mode!=='rigid'&&!approvedCourtyard)
          return lareGateFail('building',policy.id,'lare-protected-access','A protected entrance or access route would change without authorization.');
        if(!riEqual(original.roadProvenance,candidate.roadProvenance)&&
          (policy.provenance!=='generated'||classifyRoadProvenance(candidate)!=='generated'||
            (policy.mode!=='rigid'&&!approvedCourtyard)))
          return lareGateFail('building',policy.id,'lare-provenance','Protected or inconsistent building provenance would change.');
      }
    }
    return null;
  }catch(error){
    if(error instanceof LareBudgetExceeded)throw error;
    return lareGateFail('road',group,'lare-preservation-unproven',error.message);
  }
}
