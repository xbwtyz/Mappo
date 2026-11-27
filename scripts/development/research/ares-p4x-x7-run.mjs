import { x7Recipe } from './ares-p4x-x7-scope.mjs';
import { X_MANIFEST } from './ares-p4x-constraints.mjs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
import { probeFreshRtreX7 } from './ares-rtre-single-junction.mjs';
import { verifyFreshRtreX7Witness } from './ares-rtre-verify.mjs';
import { createSpatialPreservationBudget } from '../../../src/core/spatial-recovery-contract.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
export async function runP4XX7(id){
  const caseId='g:'+id,recipe=x7Recipe(caseId),prior=X_MANIFEST.cases.find(r=>r.id===id);
  const budget=createSpatialPreservationBudget(G_MANIFEST.search.root);
  let search;
  try{search=await probeFreshRtreX7(caseId,budget);}
  catch(e){if(e instanceof LareBudgetExceeded)return {id,minimum:recipe.minimum,category:'work-limit',termination:'preflight-work-limit',attempts:0,stats:budget.snapshot()};throw e;}
  if(search.snapshotFingerprint!==recipe.source||search.snapshotFingerprint!==prior.source||JSON.stringify(search.baseline?.issues)!==JSON.stringify(prior.issues)||search.maxNeighbors!==recipe.minimum)throw Error('X7 frozen baseline changed.');
  const row={id,source:search.snapshotFingerprint,minimum:recipe.minimum,category:search.status,termination:search.termination,attempts:search.attempts,stats:search.stats,baselineIssues:search.baseline?.issues,hybrid:search.hybrid,ranking:search.ranking};
  if(search.status==='geometry-recovered'){
    const w=search.adjustedWitness,offset=search.context.operation.geometry.offset,cap=Math.hypot(offset.x,offset.y);
    if(w.neighbors.length!==recipe.minimum||w.neighbors.some(n=>Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)>cap))throw Error('X7 displacement limit exceeded.');
    row.audit=await verifyFreshRtreX7Witness(caseId,search,createSpatialPreservationBudget(G_MANIFEST.audit.root));
    row.witness={neighbors:w.neighbors,updates:w.updates,changedRoadIds:w.changedRoadIds,displacement:w.displacement,stencil:w.stencil};
    if(row.audit.status!=='geometry-verified')row.category='unverified';
  }
  return row;
}
