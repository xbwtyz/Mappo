import { AcceptedEditHistoryD01, forkAcceptedHistoryD01 } from './accepted-edit-history-d01.js';
import { prepareAcceptedIdentityTransaction } from './identity-transaction.js';
import { issueIdentityReservation } from './identity-verification.js';
import { validateJsonTree, validateStoredProject } from '../data/project-validation.js';
import { copyJson } from '../data/project-format.js';

// P3a2: one private session state pointer. Reuse D01's recording/pruning
// policy on a staged ledger. Neither the caller nor domain validator can
// obtain a mutable reference to accepted state. No app wiring yet.
// One immutable, reference-stable render snapshot per accepted revision.
// Freeze only validated/owned project data. The history facade has no
// mutators or access to private cursors, and an older view stays historical.
function idaSessionFreezeTree(root){
  const stack=[root];
  while(stack.length){
    const value=stack.pop();
    if(!value||typeof value!=='object'||Object.isFrozen(value))continue;
    for(const child of Object.values(value))if(child&&typeof child==='object')stack.push(child);
    Object.freeze(value);
  }
  return root;
}
function idaSessionPublishedState(project,context,history){
  const accepted=idaSessionFreezeTree(project),binding=Object.freeze({...context});
  const entries=new Map();
  const summary=idaSessionFreezeTree(history.summaries());
  const historyView=Object.freeze({
    notice:history.notice,serial:history.serial,bytes:history.bytes,length:history.length,
    maxEntries:history.maxEntries,maxBytes:history.maxBytes,
    entry(direction){
      if(direction!=='undo'&&direction!=='redo')return null;
      if(!entries.has(direction)){
        const entry=history.entry(direction);
        entries.set(direction,entry?idaSessionFreezeTree(copyJson(entry)):null);
      }
      return entries.get(direction);
    },
    summaries:()=>summary,
    can:(direction,project)=>history.can(direction,project),
    fits:(before,after,editorHistory)=>history.fits(before,after,editorHistory),
    canRecord:(before,after,editorHistory)=>history.canRecord(before,after,editorHistory)
  });
  const view=Object.freeze({project:accepted,context:binding,history:historyView});
  return {project:accepted,context:binding,history,view};
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
      forkAcceptedHistoryD01(history,true);
    if(history===undefined)ledger.clear(accepted);
    if(!ledger.baseline||JSON.stringify(ledger.baseline)!==JSON.stringify(accepted))
      throw Error('Accepted history baseline does not match adopted project');
    this.#state=idaSessionPublishedState(accepted,binding,ledger);
  }
  read(){return idaSessionRead(this.#state);}
  view(){return this.#state.view;}
  // Explicit detached ledger export for future host integration/inspection.
  // This is not persisted history and cannot mutate the accepted ledger.
  copyHistory(){return forkAcceptedHistoryD01(this.#state.history,true);}
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
      const history=forkAcceptedHistoryD01(current.history);
      const recorded=history.record(current.project,prepared.project,prepared.transaction);
      if(recorded.status!=='recorded')
        throw Error('Accepted identity transaction history recording refused');
      if(JSON.stringify(history.baseline)!==JSON.stringify(prepared.project))
        throw Error('Accepted identity transaction history baseline mismatch');
      const next=idaSessionPublishedState(prepared.project,prepared.context,history);
      // Complete every fallible operation, including detached return data,
      // before replacing the sole accepted state pointer. No callbacks after.
      const result={...idaSessionRead(next),pruned:recorded.pruned};
      this.#state=next;
      return result;
    }finally{
      this.#busy=false;
    }
  }
  // Replay is a new accepted revision, not a new allocation. A host command
  // carries its current session binding; never accept a caller-supplied
  // historical candidate or cursor. D01 prepares the exact target itself.
  replay({direction,context,workspace}={}){
    if(this.#busy)throw Error('Reentrant identity transaction refused');
    this.#busy=true;
    try{
      const current=this.#state;
      if(direction!=='undo'&&direction!=='redo')
        throw Error('Invalid identity history direction');
      if(!context||typeof context!=='object'||Array.isArray(context)||
        Reflect.ownKeys(context).length!==3||
        Object.keys(current.context).some(key=>!Object.hasOwn(context,key)||
          context[key]!==current.context[key]))
        throw Error('Stale or incompatible identity history command');
      if(current.context.revision===Number.MAX_SAFE_INTEGER)
        throw Error('Accepted identity transaction revision exhausted');
      validateJsonTree(workspace);
      const history=forkAcceptedHistoryD01(current.history);
      const receipt=history.prepare(direction,current.project,workspace);
      if(!receipt.ok)throw Error(receipt.reason);
      history.accept(direction,receipt.entry,receipt.candidate);
      const next=idaSessionPublishedState(receipt.candidate,{
        ...current.context,revision:current.context.revision+1
      },history);
      if(JSON.stringify(next.project.identityAllocation)!==JSON.stringify(current.project.identityAllocation))
        throw Error('Identity replay changed allocation high-water marks');
      // Return workspace as detached data; caller's workspace is unchanged.
      // All fallible work precedes the same single publication used by Apply.
      const result={...idaSessionRead(next),workspace:copyJson(receipt.workspace),entry:copyJson(receipt.entry)};
      this.#state=next;
      return result;
    }finally{
      this.#busy=false;
    }
  }
}
