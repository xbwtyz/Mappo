import { createSpatialOperation } from './spatial-recovery-contract.js';

export const SRE_ROAD_WORKER_VERSION = 1;
const sreWorkerKeys = ['version','requestId','sessionId','projectJson','operation','quality'];
export const sreWorkerId = id => Number.isSafeInteger(id) && id > 0;
export const sreWorkerSession = id => typeof id === 'string' && id.length > 0 && id.length <= 200 && id.trim() === id;

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

