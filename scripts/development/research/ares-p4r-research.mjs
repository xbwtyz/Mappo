import { readFileSync } from 'node:fs';
import { G_MANIFEST } from './ares-p4-g-corpus.mjs';
import { G_OPTIONS } from './ares-p4-g-run.mjs';
import { inspectFreshRtreNeighborhood } from './ares-rtre-fresh-neighborhood.mjs';
import { probeFreshRtreFirstValid,probeFreshRtreBreadth,probeFreshRtreDirectional,probeFreshRtreBreadthDirectional,probeFreshRtreDirectionalFallback } from './ares-rtre-single-junction.mjs';
import { verifyFreshRtreWitness } from './ares-rtre-verify.mjs';
import { createSpatialPreservationBudget } from '../../../src/core/spatial-recovery-contract.js';
import { LareBudgetExceeded } from '../../../src/core/reconciliation-budget.js';
import { riFreeze } from '../../../src/core/road-impact-model.js';

const read=name=>JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p4-evidence/'+name,import.meta.url),'utf8'));
export const P4R_BASELINE=riFreeze([...read('large-corpus-45983786171-a.json').rows,...read('large-corpus-45983786171-b.json').rows]);
export const P4R_CAPS=Object.freeze([32,64,128,256]);
const fatalReasons=new Set(['invalid-input','unknown-data','unclassified','verification-failure','unsupported-capability','work-limit','protected-content']);
const prior=id=>{
  if(typeof id!=='string')throw Error('Frozen P4R slot ID required.');
  const r=P4R_BASELINE.find(x=>x.id===id);
  if(!r)throw Error('Unknown P4R slot.');
  return r;
};
export async function inspectP4RRefusal(id){
  const r=prior(id);
  if(r.category!=='preflight-refused')throw Error('Not a recorded preflight refusal.');
  const budget=createSpatialPreservationBudget(G_MANIFEST.search.root),t=performance.now();
  const report=await inspectFreshRtreNeighborhood('g:'+id,{mode:G_OPTIONS.mode,maxObjects:G_OPTIONS.maxObjects,maxHops:G_OPTIONS.maxHops},budget);
  if(report.snapshotFingerprint!==r.source||report.status!==r.eligibilityStatus)throw Error('P4R refusal identity/status changed.');
  const observations=report.geometryDiagnostics.map(d=>({code:d.code,reason:d.reason,refs:d.refs,fatal:fatalReasons.has(d.reason)||d.code==='boundary-escape'}));
  return riFreeze({id,source:r.source,selectedRoadIds:r.selectedRoadIds,offset:r.offset,status:report.status,observationStatus:report.observationStatus,observations,
    fatalCodes:[...new Set(observations.filter(d=>d.fatal).map(d=>d.code))].sort(),requested:report.requested,admitted:report.entries.length,omitted:report.omittedRefs.length,stats:budget.snapshot(),elapsedMs:performance.now()-t});
}
export async function probeP4RCap(id,cap){
  return probeP4RArm(id,cap,probeFreshRtreFirstValid);
}
export async function probeP4RBreadth(id,cap){
  return probeP4RArm(id,cap,probeFreshRtreBreadth);
}
export async function probeP4RDirectional(id,cap){
  return probeP4RArm(id,cap,probeFreshRtreDirectional,true);
}
export const P4R_COMBINATIONS=Object.freeze(['breadth-directional','original-directional-fallback']);
export async function probeP4RCombination(id,cap,kind){
  if(!P4R_COMBINATIONS.includes(kind))throw Error('Unapproved P4R combination.');
  return probeP4RArm(id,cap,kind==='breadth-directional'?probeFreshRtreBreadthDirectional:probeFreshRtreDirectionalFallback,true);
}
// R4C-B: finite, detached spatial combination matrix only. No external
// geometry, arbitrary scope settings, changed candidate/root budget or
// live authority. The reference and all older entrypoints stay unchanged.
export async function probeP4RSpatial(id,hops,kind){
  if(prior(id).category!=='search-refused'||![6,8,10].includes(hops)||!['original','breadth'].includes(kind))
    throw Error('Unapproved P4R spatial arm.');
  return probeP4RArm(id,256,kind==='original'?probeFreshRtreFirstValid:probeFreshRtreBreadth,true,hops);
}
async function probeP4RArm(id,cap,probe,includeStencil=false,maxHops=G_OPTIONS.maxHops){
  const r=prior(id);
  if(!P4R_CAPS.includes(cap))throw Error('Unapproved P4R candidate cap.');
  const o={...G_OPTIONS,maxCandidates:cap,maxHops},budget=createSpatialPreservationBudget(G_MANIFEST.search.root),t=performance.now();
  let search;
  try{search=await probe('g:'+id,o,budget);}
  catch(e){if(e instanceof LareBudgetExceeded)return {id,cap,category:'work-limit',termination:'preflight-work-limit',stats:budget.snapshot(),elapsedMs:performance.now()-t};throw e;}
  if(search.snapshotFingerprint!==r.source)throw Error('P4R cap source identity changed.');
  const row={id,cap,source:r.source,category:search.status,eligibilityStatus:search.eligibilityStatus,baselineValid:search.baseline?.valid??null,
    baselineIssues:search.baseline?.issues??[],termination:search.termination,attempts:search.attempts,stats:search.stats,elapsedMs:performance.now()-t};
  if(['geometry-recovered','baseline-valid'].includes(search.status)){
    const u=performance.now();
    row.audit=await verifyFreshRtreWitness('g:'+id,o,search,createSpatialPreservationBudget(G_MANIFEST.audit.root));
    row.auditMs=performance.now()-u;
    row.witness=search.adjustedWitness?{neighbors:search.adjustedWitness.neighbors,updates:search.adjustedWitness.updates,changedRoadIds:search.adjustedWitness.changedRoadIds,displacement:search.adjustedWitness.displacement}:null;
    if(includeStencil&&search.adjustedWitness)row.stencil=search.adjustedWitness.stencil;
    if(row.audit.status!=='geometry-verified')row.category='unverified';
  }
  return riFreeze(row);
}
