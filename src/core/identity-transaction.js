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

// Strict reversible history remains the default for all IDA callers.
// The legacy ordinary-edit capacity barrier is opt-in by trusted mounted
// intent, never a worker receipt. Complete group and join paths stay strict;
// structure operations are deliberately excluded until the mounted caller
// distinguishes a join from ordinary structure work.
function idaTxnHistoryPolicy(policy,metadata){
  if(policy==='required')return false;
  // This is selected exclusively by the trusted building/geometry bridge
  // after distinguishing the actual component intent. Keep the generic
  // ordinary policy unable to opt a join out of reversible history.
  if(policy==='legacy-ordinary-structure'&&metadata.family==='building'&&metadata.operation==='building-structure')
    return true;
  const ordinary={
    property:['property-create','property-split','property-merge','property-delete','property-and-plot'],
    building:['building-geometry'],
    compound:['compound-membership','compound-transform'],
    identity:['identity-change'],
    road:['road-reflow'],
    districts:['generate','identity','move','restore'],
    defenses:['apply','restore','build','rebuild','enable','disable']
  };
  if(policy!=='legacy-ordinary'||!Object.hasOwn(ordinary,metadata.family)||
     !ordinary[metadata.family].includes(metadata.operation))
    throw Error('Unsupported accepted identity history policy for this operation');
  return true;
}
export function prepareAcceptedIdentityTransaction({
  project,context,requests,receipt,candidateCity,transaction,history,validateDomain,historyPolicy='required'
}={}){
  if(project?.schemaVersion!==11||!project.city)
    throw Error('Identity transaction requires an accepted Schema 11 project');
  if(typeof validateDomain!=='function'||typeof history?.canRecord!=='function')
    throw Error('Independent domain validation and accepted history preflight required');
  validateAllocationCounter(context?.revision);
  if(context.revision===Number.MAX_SAFE_INTEGER)
    throw Error('Accepted identity transaction revision exhausted');
  const metadata=idaTxnMetadata(transaction),allowOversize=idaTxnHistoryPolicy(historyPolicy,metadata);
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
  const recordable=history.canRecord(before,candidate,metadata.editorHistory);
  const oversize=allowOversize&&!recordable&&
    idaTxnSame(history.baseline,before)&&typeof history.fits==='function'&&
    !history.fits(before,candidate,metadata.editorHistory);
  if(!recordable&&!oversize)
    throw Error('Accepted identity transaction history preflight refused');
  // Defensive recheck: the host baseline must not have changed during checks.
  if(!idaTxnSame(project,before))
    throw Error('Accepted identity transaction baseline changed');
  // The host must publish project + revision + history together in a later
  // integration checkpoint. Discarding this result consumes nothing.
  return {project:candidate,context:Object.freeze({
    projectId:context.projectId,revision:context.revision+1,namespace:context.namespace
  }),transaction:metadata,historyStatus:oversize?'oversize':'recorded'};
}
