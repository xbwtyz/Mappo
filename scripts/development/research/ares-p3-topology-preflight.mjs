import { createSpatialInventory } from '../../../src/core/spatial-recovery-contract.js';
import { iterateRoadGroupIntentB1, readRoadGroupTopologyB1 } from '../../../src/core/road-intent-c1.js';
import { adaptAresGroupIssue, adaptAresIntentIssue, adaptAresFaceIssue } from '../../../src/core/ares-diagnostic-adapters.js';
import { aresReplayJson } from '../../../src/core/ares-diagnostic-replay.js';
import { riFreeze } from '../../../src/core/road-impact-model.js';

// Detached study admission only, shared by every arm. Mirror the existing
// strict SRE topology gate before attempting its preserving/retirement paths.
// This is not an Apply gate or a new topology solver. Unknown errors remain
// errors; never classify an exception by its message.
export function inspectAresP3Topology(project,context,budget){
  const op=context.operation;
  createSpatialInventory(project,op,budget);
  const iterator=iterateRoadGroupIntentB1(project,op.editedRefs.map(r=>r.id),op.geometry.offset);
  let draft;
  try{
    for(;;){
      budget.spend();
      const step=iterator.next();
      if(step.done){draft=step.value;break;}
      // Existing graph iterator batches intersection checks in groups of 64.
      if(step.value?.stage==='road-graph-intersections')budget.spend(63);
    }
  }finally{iterator.return();}
  const topology=readRoadGroupTopologyB1(project,draft),identity=topology?.identity;
  const issues=draft.issues??[];
  const diagnostics=issues.map(i=>draft.group?.eligible===false?
    adaptAresGroupIssue(context,i):adaptAresIntentIssue(context,i)).filter(Boolean);
  if(identity)for(const i of identity.issues??[]){
    budget.spend();diagnostics.push(adaptAresFaceIssue(context,i));
  }
  // A caught internal topology exception is not a known domain refusal.
  // Missing/unknown/verification-failure evidence remains a hard error.
  if(diagnostics.some(d=>['verification-failure','unknown-data','unclassified','invalid-input'].includes(d.reason)))
    throw Error('P3 topology preflight contains unresolved or invalid evidence: '+diagnostics.map(d=>d.code).join(', '));
  const eligible=!!(draft.group?.eligible&&draft.draftable&&draft.topologyResolved&&draft.facesResolved&&
    draft.status!=='unchanged'&&!issues.some(i=>i.code==='boundary-escape')&&identity?.valid&&
    !identity.requiresReview&&!identity.issues.length&&!identity.added.length&&!identity.removed.length&&
    !identity.split.length&&!identity.merged.length&&!identity.ambiguous.length);
  if(!eligible&&!diagnostics.length)throw Error('P3 topology preflight missing typed refusal evidence.');
  aresReplayJson(diagnostics,budget);
  return riFreeze({status:eligible?'eligible':'preflight-refused',diagnostics});
}
