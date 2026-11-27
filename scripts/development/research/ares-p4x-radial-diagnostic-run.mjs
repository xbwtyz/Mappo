import {radialRecipe} from './ares-p4x-radial-scope.mjs';
import {G_MANIFEST} from './ares-p4-g-corpus.mjs';
import {X_MANIFEST} from './ares-p4x-constraints.mjs';
import {probeFreshRtreRadialDiagnostic} from './ares-rtre-single-junction.mjs';
import {analyzeRejected} from './ares-p4x-displacement-diagnostics.mjs';
import {createSpatialPreservationBudget} from '../../../src/core/spatial-recovery-contract.js';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
import {readFileSync} from 'node:fs';
// Independently audited X12 evidence, fixed historical sources only.
const files=[123,163,79].map(n=>new URL('../../../tests/fixtures/ares-p4-evidence/p4x-x12-46079959187-140776465'+String(n).padStart(3,'0')+'.json',import.meta.url));
const historical=files.flatMap(f=>JSON.parse(readFileSync(f,'utf8')).rows);
export async function runRadialDiagnostic(id,arm){
  const caseId='g:'+id,recipe=radialRecipe(caseId),prior=X_MANIFEST.cases.find(r=>r.id===id),observation=historical.find(r=>r.id===id);
  if(!observation||!['prior','radial'].includes(arm))throw Error('Unapproved diagnostic arm.');
  const budget=createSpatialPreservationBudget(G_MANIFEST.search.root);
  let search;
  try{search=await probeFreshRtreRadialDiagnostic(caseId,arm,budget);}
  catch(e){if(e instanceof LareBudgetExceeded)return {id,arm,cap:recipe.cap,category:'work-limit',termination:'preflight-work-limit',attempts:0,stats:budget.snapshot()};throw e;}
  if(search.snapshotFingerprint!==recipe.source||search.snapshotFingerprint!==prior.source||JSON.stringify(search.baseline?.issues)!==JSON.stringify(prior.issues)||search.maxNeighbors!==recipe.cap)throw Error('Diagnostic frozen baseline changed.');
  const diagnostics=search.diagnostics,phases=diagnostics.phases;
  const accounted=Object.values(phases).reduce((a,b)=>a+b,0);
  if(accounted>search.stats.work)throw Error('Overlapping primary phase accounting.');
  const audit=analyzeRejected(caseId,recipe,search,observation,createSpatialPreservationBudget(G_MANIFEST.audit.root));
  return {id,arm,source:search.snapshotFingerprint,cap:recipe.cap,category:search.status,termination:search.termination,attempts:search.attempts,stats:search.stats,hybrid:search.hybrid,diagnostics:{...diagnostics,phases:{...phases,other:search.stats.work-accounted}},audit};
}
