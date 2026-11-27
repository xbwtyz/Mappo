import { normalizeSpatialRoadReservationContext } from './spatial-recovery-worker-protocol.js';
import { normalizeIdentityRequests } from './identity-reservations.js';
import { issueIdentityReservation, verifyIdentityReservation } from './identity-verification.js';
import { riEqual } from './road-impact-model.js';

// Preview only. Expected requests must be independently supplied by a
// trusted host policy, not obtained from a worker delta or receipt.
export function verifySpatialRoadWorkerReservation(project,operation,context,expectedRequests,proposal){
  const binding=normalizeSpatialRoadReservationContext(operation,context);
  if(!binding||project?.schemaVersion!==11||(project.id??project.city?.id)!==operation.projectId)
    throw Error('Road reservation host snapshot mismatch.');
  const requests=normalizeIdentityRequests(expectedRequests);
  if(!requests.length||!proposal||!riEqual(proposal.context,binding)||
     !riEqual(proposal.requests,requests))
    throw Error('Road regeneration proposal differs from host requests.');
  const receipt=issueIdentityReservation(project.identityAllocation,project.city,binding,requests);
  verifyIdentityReservation(project.identityAllocation,project.city,binding,requests,proposal.receipt);
  if(!riEqual(receipt,proposal.receipt))throw Error('Road regeneration receipt differs from host reservation.');
  return Object.freeze({context:binding,requests,receipt});
}
