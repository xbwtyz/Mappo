import { AcceptedEditHistoryD01 } from './accepted-edit-history-d01.js';
import { prepareAcceptedIdentityTransaction } from './identity-transaction.js';
import { issueIdentityReservation } from './identity-verification.js';
import { validateJsonTree, validateStoredProject } from '../data/project-validation.js';
import { copyJson } from '../data/project-format.js';

// P3a2: one private session state pointer. Reuse D01's recording/pruning
// policy on a staged ledger. Neither the caller nor domain validator can
// obtain a mutable reference to accepted state. No app wiring yet.
function idaSessionForkHistory(history,detach=false){
  if(!(history instanceof AcceptedEditHistoryD01))
    throw Error('An accepted D01 history is required');
  if(!Number.isSafeInteger(history.serial)||history.serial<0||
    !Array.isArray(history.past)||!Array.isArray(history.future))
    throw Error('Invalid accepted history cursor');
  const fork=new AcceptedEditHistoryD01({
    maxEntries:history.maxEntries,maxBytes:history.maxBytes
  });
  // Entries are treated as immutable inside the coordinator. record() only
  // replaces arrays, appends a new entry and replaces baseline/notice.
  // Import/export boundaries detach entries; staging shares private entries.
  fork.past=detach?copyJson(history.past):history.past.slice();
  fork.future=detach?copyJson(history.future):history.future.slice();
  fork.serial=history.serial;
  fork.baseline=detach?copyJson(history.baseline):history.baseline;
  fork.notice=history.notice;
  return fork;
}
function idaSessionRead(state){
  return {
    project:copyJson(state.project),
    context:{...state.context},
    history:{
      entries:state.history.summaries(),
      bytes:state.history.bytes,
      notice:state.history.notice,
      serial:state.history.serial
    }
  };
}
export class AcceptedIdentitySession {
  #state;
  #busy=false;
  constructor({project,context,history}={}){
    validateJsonTree(project);
    const accepted=copyJson(project);
    validateStoredProject(accepted);
    // Empty reservation validates the trusted context and current inventory,
    // without allocating or persisting a session namespace.
    const binding=issueIdentityReservation(
      accepted.identityAllocation,accepted.city,context,[]).binding;
    const ledger=history===undefined?new AcceptedEditHistoryD01():
      idaSessionForkHistory(history,true);
    if(history===undefined)ledger.clear(accepted);
    if(!ledger.baseline||JSON.stringify(ledger.baseline)!==JSON.stringify(accepted))
      throw Error('Accepted history baseline does not match adopted project');
    this.#state={project:accepted,context:binding,history:ledger};
  }
  read(){return idaSessionRead(this.#state);}
  // Explicit detached ledger export for future host integration/inspection.
  // This is not persisted history and cannot mutate the accepted ledger.
  copyHistory(){return idaSessionForkHistory(this.#state.history,true);}
  reserve(requests){
    const {project,context}=this.#state;
    return issueIdentityReservation(project.identityAllocation,project.city,context,requests);
  }
  commit({requests,receipt,candidateCity,transaction,validateDomain}={}){
    if(this.#busy)throw Error('Reentrant identity transaction refused');
    this.#busy=true;
    try{
      const current=this.#state;
      if(current.history.serial===Number.MAX_SAFE_INTEGER)
        throw Error('Accepted history serial exhausted');
      const prepared=prepareAcceptedIdentityTransaction({
        project:current.project,context:current.context,requests,receipt,
        candidateCity,transaction,history:current.history,validateDomain
      });
      const history=idaSessionForkHistory(current.history);
      const recorded=history.record(current.project,prepared.project,prepared.transaction);
      if(recorded.status!=='recorded')
        throw Error('Accepted identity transaction history recording refused');
      if(JSON.stringify(history.baseline)!==JSON.stringify(prepared.project))
        throw Error('Accepted identity transaction history baseline mismatch');
      const next={project:prepared.project,context:prepared.context,history};
      // Complete every fallible operation, including detached return data,
      // before replacing the sole accepted state pointer. No callbacks after.
      const result={...idaSessionRead(next),pruned:recorded.pruned};
      this.#state=next;
      return result;
    }finally{
      this.#busy=false;
    }
  }
}
