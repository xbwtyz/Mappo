import { createSpatialOperation } from './spatial-recovery-contract.js';
import { validateAllocationNamespace } from './identity-allocation.js';

export const SRE_ROAD_WORKER_VERSION = 1;
const sreWorkerKeys = ['version','requestId','sessionId','projectJson','operation','quality','controlled','reservationContext','captureRestorationAudit'];
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
  if (!['standard','high'].includes(quality) || (quality === 'high' && (!operation.permissions.destruction||operation.permissions.regeneration)))
    throw Error('Invalid road worker quality policy.');
  const controlled=input.controlled??false;
  if(typeof controlled!=='boolean')throw Error('Invalid road worker control policy.');
  const captureRestorationAudit=input.captureRestorationAudit??false;
  if(typeof captureRestorationAudit!=='boolean'||(captureRestorationAudit&&!operation.permissions.destruction))
    throw Error('Invalid road worker restoration audit policy.');
  const reservationContext=normalizeSpatialRoadReservationContext(operation,input.reservationContext??null);
  return Object.freeze({version:SRE_ROAD_WORKER_VERSION,requestId:input.requestId,
    sessionId:input.sessionId,projectJson:input.projectJson,operation,quality,controlled,reservationContext,captureRestorationAudit});
}


export function normalizeSpatialRoadReservationContext(operation,context){
  if(!operation.permissions.regeneration){
    if(context!==null)throw Error('Unexpected road regeneration context.');
    return null;
  }
  if(!operation.permissions.destruction||!context||typeof context!=='object'||
     Array.isArray(context)||Object.keys(context).length!==3||
     !['projectId','revision','namespace'].every(k=>Object.hasOwn(context,k))||
     context.projectId!==operation.projectId||context.revision!==operation.revision)
    throw Error('Missing or stale road regeneration context.');
  validateAllocationNamespace(context.namespace);
  return Object.freeze({projectId:context.projectId,revision:context.revision,namespace:context.namespace});
}

export function spatialRoadControlMessage(request,command){
  if(!['stop','continue'].includes(command))throw Error('Unsupported road recovery control.');
  return {version:SRE_ROAD_WORKER_VERSION,requestId:request.requestId,sessionId:request.sessionId,command};
}
