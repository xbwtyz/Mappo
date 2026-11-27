import { createSpatialOperation, createSpatialPreservationBudget, createSpatialDestructionBudget } from '../core/spatial-recovery-contract.js';
import { createSpatialHighQualityBudget } from '../core/spatial-recovery-quality.js';
import { searchSpatialUnifiedRoadGroup, verifySpatialUnifiedRoadWitness } from '../core/spatial-recovery-coordinator.js';
import { hydrateProjectS10 } from '../core/building-project-s10.js';

export const SRE_ROAD_WORKER_VERSION = 1;
const sreWorkerKeys = ['version','requestId','sessionId','projectJson','operation','quality'];
const sreWorkerId = id => Number.isSafeInteger(id) && id > 0;
const sreWorkerSession = id => typeof id === 'string' && id.length > 0 && id.length <= 200 && id.trim() === id;

// Detached transport only. Host owns the accepted city, session, request
// sequence and permissions. No worker reply is Apply authorization.
export function normalizeSpatialRoadWorkerRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(input)) ||
      Object.keys(input).some(k => !sreWorkerKeys.includes(k)) ||
      input.version !== SRE_ROAD_WORKER_VERSION ||
      !sreWorkerId(input.requestId) || !sreWorkerSession(input.sessionId) ||
      typeof input.projectJson !== 'string' || !input.projectJson.length)
    throw Error('Invalid spatial recovery worker request.');
  const operation = createSpatialOperation(input.operation);
  if (operation.family !== 'road' || operation.operation !== 'translate-road-group' ||
      !operation.geometry || operation.editedRefs.some(ref => ref.collection !== 'roads'))
    throw Error('Unsupported road worker operation.');
  const quality = input.quality ?? 'standard';
  if (!['standard','high'].includes(quality) || (quality === 'high' && !operation.permissions.destruction))
    throw Error('Invalid road worker quality policy.');
  // Regeneration must wait for independently bound host reservation context.
  if (operation.permissions.regeneration) throw Error('Road worker regeneration is not enabled.');
  return Object.freeze({version:SRE_ROAD_WORKER_VERSION,requestId:input.requestId,
    sessionId:input.sessionId,projectJson:input.projectJson,operation,quality});
}

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
