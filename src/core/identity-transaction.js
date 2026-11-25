import { validateAllocationCounter } from './identity-allocation.js';
import { verifyIdentityAdditions } from './identity-verification.js';
import { validateJsonTree, validateStoredProject } from '../data/project-validation.js';
import { copyJson } from '../data/project-format.js';

// P3a1: detached, synchronous acceptance preparation. Only a trusted host
// supplies the accepted project/context, request intent, independent domain
// validator and history. A worker receipt is never Apply authority.
// No accepted project, revision, history or allocation is written here.
const idaTxnSame=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function idaTxnMetadata(transaction){
  if(!transaction||typeof transaction!=='object'||Array.isArray(transaction)||
    ![transaction.family,transaction.operation,transaction.label].every(
      value=>typeof value==='string'&&value.trim())||
    !Array.isArray(transaction.targetIds)||
    !transaction.targetIds.every(id=>typeof id==='string'&&id))
    throw Error('Invalid identity transaction history metadata');
  validateJsonTree(transaction);
  return copyJson(transaction);
}

export function prepareAcceptedIdentityTransaction({
  project,context,requests,receipt,candidateCity,transaction,history,validateDomain
}={}){
  if(project?.schemaVersion!==11||!project.city)
    throw Error('Identity transaction requires an accepted Schema 11 project');
  if(typeof validateDomain!=='function'||typeof history?.canRecord!=='function')
    throw Error('Independent domain validation and accepted history preflight required');
  validateAllocationCounter(context?.revision);
  if(context.revision===Number.MAX_SAFE_INTEGER)
    throw Error('Accepted identity transaction revision exhausted');
  const metadata=idaTxnMetadata(transaction);
  // Validate raw candidate before JSON detachment; do not silently normalize
  // invalid values or accept a worker-supplied project root/allocator.
  validateJsonTree(candidateCity);
  const before=copyJson(project),city=copyJson(candidateCity);
  const nextState=verifyIdentityAdditions(before.identityAllocation,before.city,
    context,requests,receipt,city);
  if(idaTxnSame(before.city,city))
    throw Error('Identity transaction has no city change');
  const candidate={...before,city,identityAllocation:nextState};
  validateJsonTree(candidate);
  validateStoredProject(candidate);
  // The domain validator is a trusted, independent permission/topology/
  // preservation check. Give it detached copies, reject mutation of either.
  const domainBefore=copyJson(before),domainAfter=copyJson(candidate);
  if(validateDomain(domainBefore,domainAfter)!==true||
    !idaTxnSame(domainBefore,before)||!idaTxnSame(domainAfter,candidate))
    throw Error('Independent domain validation refused identity transaction');
  if(!history.canRecord(before,candidate,metadata.editorHistory))
    throw Error('Accepted identity transaction history preflight refused');
  // Defensive recheck: the host baseline must not have changed during checks.
  if(!idaTxnSame(project,before))
    throw Error('Accepted identity transaction baseline changed');
  // The host must publish project + revision + history together in a later
  // integration checkpoint. Discarding this result consumes nothing.
  return {project:candidate,context:Object.freeze({
    projectId:context.projectId,revision:context.revision+1,namespace:context.namespace
  }),transaction:metadata};
}
