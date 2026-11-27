import { X34_IDS } from './ares-p4x-analytical.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
import { R5_OPTIONS } from './ares-p4-g-run.mjs';
import { probeFreshRtreAnalytical } from './ares-rtre-single-junction.mjs';
import { verifyFreshRtreWitness } from './ares-rtre-verify.mjs';
import { createSpatialPreservationBudget } from '../../../src/core/spatial-recovery-contract.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
export async function runP4XAnalytical(id){
  if(!X34_IDS.includes(id))throw Error('Unapproved P4X analytical ID.');
  const caseId='g:'+id,budget=createSpatialPreservationBudget(G_MANIFEST.search.root);
  let search;
  try{search=await probeFreshRtreAnalytical(caseId,R5_OPTIONS,budget);}
  catch(e){if(e instanceof LareBudgetExceeded)return {id,category:'work-limit',termination:'preflight-work-limit',attempts:0,stats:budget.snapshot()};throw e;}
  const row={id,source:search.snapshotFingerprint,category:search.status,termination:search.termination,attempts:search.attempts,
    stats:search.stats,baselineIssues:search.baseline?.issues??[],analytical:search.analytical,ranking:search.ranking};
  if(search.status==='geometry-recovered'){
    const w=search.adjustedWitness,offset=search.context.operation.geometry.offset,cap=Math.hypot(offset.x,offset.y);
    if(w.neighbors.length>4||w.neighbors.some(n=>Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)>cap))throw Error('Analytical displacement limit exceeded.');
    row.audit=await verifyFreshRtreWitness(caseId,R5_OPTIONS,search,createSpatialPreservationBudget(G_MANIFEST.audit.root));
    row.witness={neighbors:w.neighbors,updates:w.updates,changedRoadIds:w.changedRoadIds,displacement:w.displacement};
    if(row.audit.status!=='geometry-verified')row.category='unverified';
  }
  return row;
}
