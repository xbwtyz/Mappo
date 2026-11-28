import {radialRecipe} from './ares-p4x-radial-scope.mjs';
import {X_MANIFEST} from './ares-p4x-constraints.mjs';
import {G_MANIFEST} from './ares-p4-g-corpus.mjs';
import {probeFreshRtreResidual} from './ares-rtre-single-junction.mjs';
import {verifyFreshRtreRadialWitness} from './ares-rtre-verify.mjs';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
export async function runP4XResidual(id){
  const caseId='g:'+id,recipe=radialRecipe(caseId),prior=X_MANIFEST.cases.find(r=>r.id===id),budget=createSpatialPreservationBudget(G_MANIFEST.search.root);
  let search;
  try{search=await probeFreshRtreResidual(caseId,budget);}
  catch(e){if(e instanceof LareBudgetExceeded)return {id,cap:recipe.cap,category:'work-limit',termination:'preflight-work-limit',attempts:0,stats:budget.snapshot()};throw e;}
  if(search.snapshotFingerprint!==recipe.source||search.snapshotFingerprint!==prior.source||JSON.stringify(search.baseline?.issues)!==JSON.stringify(prior.issues)||search.maxNeighbors!==recipe.cap)throw Error('Residual frozen baseline changed.');
  const row={id,source:search.snapshotFingerprint,cap:recipe.cap,minimum:recipe.minimum,category:search.status,termination:search.termination,attempts:search.attempts,stats:search.stats,hybrid:search.hybrid,ranking:search.ranking};
  if(search.status==='geometry-recovered'){
    const w=search.adjustedWitness,offset=search.context.operation.geometry.offset;
    if(w.neighbors.length<2||w.neighbors.length>recipe.cap||(recipe.minimum&&w.neighbors.length!==recipe.minimum)||w.neighbors.some(n=>Math.hypot(n.point.x-n.old.x,n.point.y-n.old.y)>Math.hypot(offset.x,offset.y)))throw Error('Residual movement authority exceeded.');
    row.audit=await verifyFreshRtreRadialWitness(caseId,search,createSpatialPreservationBudget(G_MANIFEST.audit.root));
    row.witness={neighbors:w.neighbors,updates:w.updates,changedRoadIds:w.changedRoadIds,displacement:w.displacement,stencil:w.stencil};
    if(row.audit.status!=='geometry-verified')row.category='unverified';
  }
  return row;
}
