import {G_MANIFEST} from './ares-p4-g-corpus.mjs';
import {holdoutLockedRow,HOLDOUT_OPTIONS,HOLDOUT_ARMS} from './ares-p5-holdout-lock.mjs';
import {probeFreshRtreHoldout} from './ares-rtre-single-junction.mjs';
import {verifyFreshRtreWitness} from './ares-rtre-verify.mjs';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
export async function runHoldoutGeometry(caseId,arm){
  const frozen=holdoutLockedRow(caseId);
  if(!HOLDOUT_ARMS.includes(arm))throw Error('Unknown fixed holdout arm.');
  const budget=createSpatialPreservationBudget(G_MANIFEST.search.root),t=performance.now();
  const base={caseId,arm,source:frozen.source,options:frozen.options,group:frozen.group,offset:frozen.offset,selectedRoadIds:frozen.selectedRoadIds,authority:'none'};
  let search;
  try{search=await probeFreshRtreHoldout(caseId,arm,budget);}
  catch(e){if(e instanceof LareBudgetExceeded)return {...base,category:'work-limit',termination:'preflight-work-limit',baselineValid:null,searchStats:budget.snapshot(),searchMs:performance.now()-t};throw e;}
  if(search.snapshotFingerprint!==frozen.source||JSON.stringify(search.context.operation.geometry.offset)!==JSON.stringify(frozen.offset)||
    JSON.stringify(search.context.operation.editedRefs.map(x=>x.id))!==JSON.stringify(frozen.selectedRoadIds))
    throw Error('Holdout search source or exact intent changed.');
  const row={...base,category:search.status,eligibilityStatus:search.eligibilityStatus,
    baselineValid:search.baseline?.valid??null,baselineGeometryValid:search.baseline?.geometryValid??null,
    baselineIssues:search.baseline?.issues??[],baselineBlockers:search.baseline?.blockingRoadIds??[],
    termination:search.termination,attempts:search.attempts,searchStats:search.stats,searchMs:performance.now()-t};
  if(search.status!=='baseline-valid'&&search.status!=='geometry-recovered')return row;
  const u=performance.now();
  row.audit=await verifyFreshRtreWitness(caseId,HOLDOUT_OPTIONS,search,createSpatialPreservationBudget(G_MANIFEST.audit.root));
  row.auditMs=performance.now()-u;
  const w=search.adjustedWitness;
  row.witness=w?{neighbors:w.neighbors,updates:w.updates,changedRoadIds:w.changedRoadIds,displacement:w.displacement}:null;
  if(row.audit.status!=='geometry-verified')row.category='unverified';
  return row;
}
