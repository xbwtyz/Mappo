import { AcceptedIdentitySession } from './accepted-identity-session.js';
import { validateJsonTree,validateStoredProject } from '../data/project-validation.js';
import { copyJson,encodeProjectDocument,decodeProjectDocument } from '../data/project-format.js';

// Host-only lifecycle boundary. The entropy source is injectable for tests;
// production uses Web Crypto only, including file:// offline contexts.
// Neither a portable document ID nor a caller-selected namespace is trusted.
function idaHostFreshNamespace(cryptoSource,excluded){
  if(typeof cryptoSource?.getRandomValues!=='function')
    throw Error('Secure identity namespace generation is unavailable.');
  for(let attempt=0;attempt<8;attempt++){
    const bytes=new Uint8Array(16);
    if(cryptoSource.getRandomValues(bytes)!==bytes)
      throw Error('Secure identity namespace generation failed.');
    const ns=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    if(!excluded.has(ns))return ns;
  }
  throw Error('A fresh identity namespace could not be generated.');
}

// No mutable coordinator escapes. Adoption, commit and replay are serialized
// at this boundary, including callbacks that might attempt reentrant adoption.
// The mounted application uses this as its sole accepted-state authority.
export class SecureIdentityHost {
  #state={session:null,used:new Set()};
  #busy=false;
  #crypto;
  #adoptions=new WeakMap();
  #rollbackTokens=new WeakMap();
  #adoptionSequence=0;
  #lastAdoption=null;
  constructor({cryptoSource=globalThis.crypto}={}){
    this.#crypto=cryptoSource;
  }
  #requireSession(){
    if(!this.#state.session)throw Error('No accepted identity session.');
    return this.#state.session;
  }
  #exclusive(run){
    if(this.#busy)throw Error('Reentrant identity host mutation refused.');
    this.#busy=true;
    try{return run();}finally{this.#busy=false;}
  }
  get adopted(){return this.#state.session!==null;}
  #prepareSession(project){
    // Reject malformed input before acquiring entropy or changing history.
    validateJsonTree(project);
    const accepted=copyJson(project);
    if(accepted?.schemaVersion!==11)throw Error('Secure identity host requires Schema 11.');
    validateStoredProject(accepted);
    const used=new Set(this.#state.used);
    const excluded=new Set([...used,...Object.keys(accepted.identityAllocation.namespaces)]);
    const namespace=idaHostFreshNamespace(this.#crypto,excluded);
    const context={projectId:'ida-session-'+namespace,revision:0,namespace};
    const session=new AcceptedIdentitySession({project:accepted,context});
    const result=session.read();
    used.add(namespace);
    return {state:{session,used},result};
  }
  #currentView(){return this.#state.session?.view()??null;}
  // The mounted lifecycle may synchronously reconcile UI against the new
  // immutable view. Reentrant accepted mutations are forbidden throughout.
  // On failure restore the exact outgoing session and keep the attempted
  // namespace excluded privately, so even leaked provisional receipts cannot
  // match a later session. Never persist a namespace merely by adopting.
  #publishAdoption(prepared,result,applyView){
    if(applyView!==undefined&&(typeof applyView!=='function'||Object.prototype.toString.call(applyView)==='[object AsyncFunction]'))
      throw Error('Project adoption requires a synchronous view reconciliation callback.');
    const outgoing=this.#state;
    this.#state=prepared.state;
    try{
      if(applyView&&applyView(this.#currentView(),result.workspace===undefined?undefined:copyJson(result.workspace))!==undefined)
        throw Error('Project adoption view reconciliation must return undefined synchronously.');
      this.#lastAdoption={before:outgoing.session,after:this.#currentView(),sequence:++this.#adoptionSequence};
      return result;
    }catch(error){
      this.#state={session:outgoing.session,used:prepared.state.used};
      throw error;
    }
  }
  adopt(project,{applyView}={}){
    return this.#exclusive(()=>{
      const prepared=this.#prepareSession(project);
      return this.#publishAdoption(prepared,prepared.result,applyView);
    });
  }
  // Accept an already decoded/migrated portable document. Stage the whole
  // validated project and workspace without entropy, history resets or
  // publication. An opaque, host-local token binds the exact outgoing view.
  // A subsequent commit/replay/adoption invalidates an outstanding token.
  stageAdoption(document){
    return this.#exclusive(()=>{
      const canonical=decodeProjectDocument(encodeProjectDocument(document));
      if(canonical.project.schemaVersion!==11)
        throw Error('Secure identity host requires Schema 11.');
      const token=Object.freeze({});
      const staged={baseline:this.#currentView(),document:canonical};
      const preview=copyJson(canonical);
      this.#adoptions.set(token,staged);
      return {token,document:preview};
    });
  }
  cancelAdoption(token){
    return this.#exclusive(()=>this.#adoptions.delete(token));
  }
  commitAdoption(token,{applyView}={}){
    return this.#exclusive(()=>{
      const staged=this.#adoptions.get(token);
      if(!staged)throw Error('Unknown or consumed project adoption token.');
      // One-shot, including refusal; callers may explicitly stage again.
      this.#adoptions.delete(token);
      if(staged.baseline!==this.#currentView())
        throw Error('Stale project adoption token.');
      const prepared=this.#prepareSession(staged.document.project);
      // Prepare all detached workspace/document return values before the
      // same sole publication used by direct adoption. The optional trusted
      // synchronous lifecycle callback may fail; the host rolls back its
      // session, while the mounted caller restores captured editor state.
      const result={...prepared.result,workspace:copyJson(staged.document.workspace),
        document:copyJson(staged.document)};
      return this.#publishAdoption(prepared,result,applyView);
    });
  }
  // File Open may fail just after its application callback returns. An
  // opaque one-use checkpoint can restore ONLY the immediately outgoing
  // session, before any accepted edit or intervening lifecycle transition.
  captureAdoptionRollback(){
    return this.#exclusive(()=>{
      const token=Object.freeze({});
      this.#rollbackTokens.set(token,{session:this.#state.session,view:this.#currentView(),sequence:this.#adoptionSequence});
      return token;
    });
  }
  restoreAdoptionRollback(token){
    return this.#exclusive(()=>{
      const saved=this.#rollbackTokens.get(token);
      if(!saved)throw Error('Unknown or consumed adoption rollback checkpoint.');
      this.#rollbackTokens.delete(token);
      const current=this.#currentView(),last=this.#lastAdoption;
      if(saved.sequence===this.#adoptionSequence&&saved.view===current)return false;
      if(!last||last.sequence!==saved.sequence+1||last.sequence!==this.#adoptionSequence||
        last.before!==saved.session||last.after!==current)
        throw Error('Stale adoption rollback checkpoint.');
      this.#state={session:saved.session,used:this.#state.used};
      this.#adoptionSequence++;this.#lastAdoption=null;
      return true;
    });
  }
  read(){return this.#requireSession().read();}
  view(){return this.#requireSession().view();}
  copyHistory(){return this.#requireSession().copyHistory();}
  reserve(requests){return this.#requireSession().reserve(requests);}
  commit(command){return this.#exclusive(()=>this.#requireSession().commit(command));}
  replay(command){return this.#exclusive(()=>this.#requireSession().replay(command));}
}
