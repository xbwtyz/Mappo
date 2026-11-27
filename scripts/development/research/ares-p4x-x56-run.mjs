import { X56_IDS } from './ares-p4x-hybrid.mjs';
import { X_MANIFEST } from './ares-p4x-constraints.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
import { R5_OPTIONS } from './ares-p4-g-run.mjs';
import { probeFreshRtreHybrid } from './ares-rtre-single-junction.mjs';
import { verifyFreshRtreWitness } from './ares-rtre-verify.mjs';
import { createSpatialPreservationBudget } from '../../../src/core/spatial-recovery-contract.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
export async function runP4XHybrid(id){
  if(!X56_IDS.includes(id))throw Error('Unapproved P4X hybrid ID.');
  const prior=X_MANIFEST.cases.find(r=>r.id===id),caseId='g:'+id,budget=createSpatialPreservationBudget(G_MANIFEST.search.root);
  let search;
  try{search=await probeFreshRtreHybrid(caseId,R5_OPTIONS,budget);}
  catch(e){if(e instanceof LareBudgetExceeded)return {id,category:'work-limit',termination:'preflight-work-limit',attempts:0,stats:budget.snapshot()};throw e;}
  if(search.snapshotFingerprint!==prior.source||JSON.stringify(search.baseline?.issues)!==JSON.stringify(prior.issues))throw Error('X56 frozen refusal baseline changed.');
  const row={id,source:search.snapshotFingerprint,category:search.status,termination:search.termination,attempts:search.attempts,stats:search.stats,baselineIssues:search.baseline?.issues,hybrid:search.hybrid,ranking:search.ranking};
  if(search.status==='geometry-recovered'){
    const w=search.adjustedWitness,offset=search.context.operation.geometry.offset,cap=Math.hypot(offset.x,offset.y);
    if(w.neighbors.length<2||w.neighbors.length>4||w.neighbors.some(n=>Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)>cap))throw Error('Hybrid displacement limit exceeded.');
    row.audit=await verifyFreshRtreWitness(caseId,R5_OPTIONS,search,createSpatialPreservationBudget(G_MANIFEST.audit.root));
    row.witness={neighbors:w.neighbors,updates:w.updates,changedRoadIds:w.changedRoadIds,displacement:w.displacement,stencil:w.stencil};
    if(row.audit.status!=='geometry-verified')row.category='unverified';
  }
  return row;
}
