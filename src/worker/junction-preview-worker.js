import { proposeJunctionMove } from '../core/road-graph.js';
import { analyzeRoadImpact } from '../core/road-impact.js';
import { prepareJunctionReflowC7 } from '../core/neighborhood-reflow.js';
import { prepareRoadReconciliationB1 } from '../core/road-reconciliation.js';

// Pure computation: no Apply, persistence or accepted-state mutations.
export function calculateJunctionPreviewP1({ project, junctionId, point, decisions = [] }) {
  const start = performance.now();
  const proposal = proposeJunctionMove(project.city, junctionId, point);
  const report = analyzeRoadImpact(project, proposal);
  const analyzeMs = performance.now() - start;
  let reconciliation = null, topology = null, reconciliationError = '';
  const reflowStart = performance.now();
  try {
    reconciliation = prepareJunctionReflowC7(project, junctionId, point, new Map(decisions));
    if (!reconciliation.candidateProject && proposal.graphValid)
      topology = prepareRoadReconciliationB1(project, junctionId, point);
  } catch (error) {
    reconciliationError = 'Adaptation preview unavailable: ' + error.message;
  }
  // proposal.graph contains functions in its read-only index facades, so
  // only send clone-safe fields back across the worker message boundary.
  return { proposal: { issues: proposal.issues, graphValid: proposal.graphValid },
    report, reconciliation, topology, reconciliationError,
    timings: { analyzeMs, reconcileMs: performance.now() - reflowStart,
      totalMs: performance.now() - start } };
}
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' &&
    typeof self.postMessage === 'function') {
  self.addEventListener('message', event => {
    const { requestId, project, junctionId, point, decisions } = event.data ?? {};
    try {
      self.postMessage({ requestId, result: calculateJunctionPreviewP1({
        project, junctionId, point, decisions,
      }) });
    } catch (error) {
      self.postMessage({ requestId, error: 'Report unavailable: ' + error.message });
    }
  });
}
