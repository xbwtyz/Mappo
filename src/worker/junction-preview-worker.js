import { proposeJunctionMove } from '../core/road-graph.js';
import { analyzeRoadImpact } from '../core/road-impact.js';
import { prepareJunctionReflowC7 } from '../core/neighborhood-reflow.js';
import { prepareRoadReconciliationB1 } from '../core/road-reconciliation.js';
import { roadReconciliationPreviewB3 } from '../core/road-inspection.js';
import { validateRoadApplyC2 } from '../editor/road-application.js';

import { hydrateProjectS10 } from '../core/building-project-s10.js';
// Worker computations operate on detached snapshots.
export function calculateJunctionPreviewP1({ project, junctionId, point, decisions = [], ownershipChoices = [], parcelChoices = [], targetJunctionId = null }) {
  const start = performance.now();
  const proposal = proposeJunctionMove(project.city, junctionId, point);
  const report = analyzeRoadImpact(project, proposal);
  const analyzeMs = performance.now() - start;
  let reconciliation = null, topology = null, reconciliationError = '';
  const reflowStart = performance.now();
  try {
    reconciliation = prepareJunctionReflowC7(project, junctionId, point, new Map(decisions),
      {targetJunctionId,ownershipChoices:new Map(ownershipChoices),parcelChoices:new Map(parcelChoices)});
    if (!reconciliation.candidateProject && proposal.graphValid)
      topology = prepareRoadReconciliationB1(project, junctionId, point);
  } catch (error) {
    reconciliationError = 'Adaptation preview unavailable: ' + error.message;
  }
  const reconcileMs = performance.now() - reflowStart;
  const previewGeometry = reconciliation ? roadReconciliationPreviewB3(project, reconciliation, topology) : null;
  // proposal.graph contains functions in its read-only index facades, so
  // only send clone-safe fields back across the worker message boundary.
  return { proposal: { issues: proposal.issues, graphValid: proposal.graphValid },
    report, reconciliation, topology, previewGeometry, reconciliationError,
    timings: { analyzeMs, reconcileMs,
      totalMs: performance.now() - start } };
}
// Keep the reviewed candidate as exact JSON for Apply's equality check.
// Preview consumes display geometry and diagnostics, so it need not clone a city.
export function junctionPreviewMessage(result) {
  const { reconciliation, proposal, report, previewGeometry, reconciliationError, timings } = result;
  const display = { proposal, report, previewGeometry, reconciliationError, timings };
  if (!reconciliation) return { ...display, reconciliation: null };
  const { candidateProject, phase, status, validation, unresolved, ledger, ownershipReview, lineage, parcelReview } = reconciliation;
  return {
    ...display,
    reconciliation: { phase, status, validation, unresolved, ledger, ownershipReview, lineage, parcelReview,
      candidateJson: candidateProject ? JSON.stringify(candidateProject) : null },
  };
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' &&
    typeof self.postMessage === 'function') {
  self.addEventListener('message', event => {
    const { requestId, operation, projectJson, junctionId, point, decisions, ownershipChoices, parcelChoices, workspace, inspected, targetJunctionId } = event.data ?? {};
    try {
      const project = hydrateProjectS10(JSON.parse(projectJson));
      const result = operation === 'apply'
        ? validateRoadApplyC2(project, workspace, {
          selection: { kind: 'junction', id: junctionId }, point, buildingDecisions: new Map(decisions),
          targetJunctionId, ownershipChoices: new Map(ownershipChoices ?? []), parcelChoices:new Map(parcelChoices ?? []),
        }, inspected)
        : junctionPreviewMessage(calculateJunctionPreviewP1({ project, junctionId, point, decisions,
            ownershipChoices, parcelChoices, targetJunctionId }));
      if (result.timings) result.timings.sentAt = performance.timeOrigin + performance.now();
      self.postMessage({ requestId, result });
    } catch (error) {
      const message = operation === 'apply' ? 'Road Apply blocked: ' : 'Report unavailable: ';
      self.postMessage({ requestId, error: message + error.message });
    }
  });
}
