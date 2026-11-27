import { G_MANIFEST,enumerateGSlots } from './ares-p4-g-corpus.mjs';
import { G_LOCKED_INVENTORY } from './ares-rtre-locked-recipes.mjs';
import { probeFreshRtreFirstValid } from './ares-rtre-single-junction.mjs';
import { verifyFreshRtreWitness } from './ares-rtre-verify.mjs';
import { createSpatialPreservationBudget } from '../../../src/core/spatial-recovery-contract.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';

export const G_OPTIONS=Object.freeze(Object.fromEntries(Object.entries(G_MANIFEST.search).filter(([k])=>k!=='root')));
export async function runGSlot(id){
  const slot=enumerateGSlots().find(s=>s.id===id);
  if(!slot)throw Error('Unknown G slot.');
  const city=G_LOCKED_INVENTORY.rows.find(c=>c.id===slot.city),group=city.groups.find(g=>g.id===slot.group);
  const base={...slot,source:city.source,selectedRoadIds:group.selectedRoadIds};
  if(group.status!=='selected')return {...base,category:group.status};
  const budget=createSpatialPreservationBudget(G_MANIFEST.search.root),caseId='g:'+id,t=performance.now();
  let search;
  try{search=await probeFreshRtreFirstValid(caseId,G_OPTIONS,budget);}
  catch(e){
    if(e instanceof LareBudgetExceeded)return {...base,category:'work-limit',termination:'preflight-work-limit',searchStats:budget.snapshot(),searchMs:performance.now()-t};
    throw e;
  }
  const row={...base,category:search.status,eligibilityStatus:search.eligibilityStatus,
    baselineValid:search.baseline?.valid??null,baselineGeometryValid:search.baseline?.geometryValid??null,
    baselineIssues:search.baseline?.issues??[],termination:search.termination,attempts:search.attempts,
    searchStats:search.stats,searchMs:performance.now()-t};
  if(search.status!=='baseline-valid'&&search.status!=='geometry-recovered')return row;
  const u=performance.now(),audit=await verifyFreshRtreWitness(caseId,G_OPTIONS,search,createSpatialPreservationBudget(G_MANIFEST.audit.root));
  row.audit=audit;row.auditMs=performance.now()-u;
  row.witness=search.adjustedWitness?{neighbors:search.adjustedWitness.neighbors,updates:search.adjustedWitness.updates,changedRoadIds:search.adjustedWitness.changedRoadIds,displacement:search.adjustedWitness.displacement}:null;
  if(audit.status!=='geometry-verified')row.category='unverified';
  return row;
}
