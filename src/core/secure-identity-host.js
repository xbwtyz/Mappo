import { AcceptedIdentitySession } from './accepted-identity-session.js';
import { validateJsonTree,validateStoredProject } from '../data/project-validation.js';
import { copyJson } from '../data/project-format.js';

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
// This is detached infrastructure: app.js does not consume it yet.
export class SecureIdentityHost {
  #state={session:null,used:new Set()};
  #busy=false;
  #crypto;
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
  adopt(project){
    return this.#exclusive(()=>{
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
      // Fresh context and clean history only become visible after all checks.
      // The namespace is not added to project data until an allocation commits.
      this.#state={session,used};
      return result;
    });
  }
  read(){return this.#requireSession().read();}
  view(){return this.#requireSession().view();}
  copyHistory(){return this.#requireSession().copyHistory();}
  reserve(requests){return this.#requireSession().reserve(requests);}
  commit(command){return this.#exclusive(()=>this.#requireSession().commit(command));}
  replay(command){return this.#exclusive(()=>this.#requireSession().replay(command));}
}
