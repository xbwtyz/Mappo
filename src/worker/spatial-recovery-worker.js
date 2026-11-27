import { createSpatialPreservationBudget, createSpatialDestructionBudget } from '../core/spatial-recovery-contract.js';
import { createSpatialHighQualityBudget } from '../core/spatial-recovery-quality.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../core/spatial-recovery-coordinator.js';
import { hydrateProjectS10 } from '../core/building-project-s10.js';

import { SRE_ROAD_WORKER_VERSION, normalizeSpatialRoadWorkerRequest, sreWorkerId, sreWorkerSession } from '../core/spatial-recovery-worker-protocol.js';

export async function calculateSpatialRoadWorkerResult(input) {
  const request = normalizeSpatialRoadWorkerRequest(input);
  const {operation,quality} = request;
  const raw = JSON.parse(request.projectJson);
  if (raw?.schemaVersion !== 11 || (raw.id ?? raw.city?.id) !== operation.projectId)
    throw Error('Road worker project identity or schema mismatch.');
  const project = hydrateProjectS10(raw);
  const ordinaryBudget = () => operation.permissions.destruction ?
    createSpatialDestructionBudget() : createSpatialPreservationBudget();
  const searchBudget = quality === 'high' ? createSpatialHighQualityBudget() : ordinaryBudget();
  const result = await searchSpatialUnifiedRoadGroup(project,operation,searchBudget,{quality});
  if (result.status === 'verified-witness') {
    // Independent replay, never an additional search allowance. Transport
    // contains the compact witnesses only; do not send the reconstructed city.
    const verified = await verifySpatialUnifiedRoadWitness(project,operation,result,ordinaryBudget());
    if (!verified || result.provisionalAuthorization || result.delta.added.length)
      throw Error('Road worker returned unsupported allocation.');
  } else if (result.status !== 'refused' || result.delta || result.basisDelta || result.provisionalAuthorization) {
    throw Error('Invalid road worker result.');
  }
  return {version:SRE_ROAD_WORKER_VERSION,requestId:request.requestId,sessionId:request.sessionId,
    operation,quality,result};
}

// One CPU-bound task per worker. Host-side termination/supersession is
// implemented in the next pass; this entry point does not queue searches.
export function installSpatialRoadRecoveryWorker(scope) {
  let busy = false;
  const receive = async ({data}) => {
    const identity = {version:SRE_ROAD_WORKER_VERSION,
      requestId:sreWorkerId(data?.requestId)?data.requestId:null,
      sessionId:sreWorkerSession(data?.sessionId)?data.sessionId:null};
    if (busy) { scope.postMessage({...identity,error:'Road recovery worker is busy.'}); return; }
    busy = true;
    try { scope.postMessage(await calculateSpatialRoadWorkerResult(data)); }
    catch (error) { scope.postMessage({...identity,error:String(error?.message ?? error)}); }
    finally { busy = false; }
  };
  scope.addEventListener('message',receive);
}
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope) installSpatialRoadRecoveryWorker(self);
