import { createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { riFreeze, riCompare } from './road-impact-model.js';

// Detached reference retention, not Apply or host authority. The verifier
// must be a trusted independently implemented domain adapter, never the
// proposing strategy or executable content loaded from a save.
export const ARES_RETENTION_VERSION=1;
function record(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==keys.length||
    keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))
    throw Error('Invalid ARES '+label+'.');
}
function token(s){
  if(typeof s!=='string'||!s.trim()||s.length>200)throw Error('Invalid ARES ranking token.');
  return s;
}
function fingerprint(s){
  if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))throw Error('Invalid ARES candidate fingerprint.');
  return s;
}
function detached(value,budget){
  return riFreeze(JSON.parse(aresReplayJson(value,budget)));
}
function profile(input,budget){
  record(input,['id','version','criteria'],'ranking profile');
  if(input.version!==1||!Array.isArray(input.criteria)||!input.criteria.length)throw Error('Invalid ARES ranking profile.');
  const seen=new Set(),criteria=[];
  for(const c of input.criteria){
    budget.spend();record(c,['metric','direction'],'ranking criterion');
    const metric=token(c.metric);
    if(seen.has(metric)||!['min','max'].includes(c.direction))throw Error('Duplicate or invalid ARES ranking criterion.');
    seen.add(metric);criteria.push({metric,direction:c.direction});
  }
  return riFreeze({id:token(input.id),version:1,criteria});
}
function sourceMatches(input,context,snapshot){
  return input.snapshotFingerprint===snapshot&&matchesAresDiagnosticContext({version:1,context:input.context},context);
}
function metrics(input,ranking,budget){
  const keys=ranking.criteria.map(c=>c.metric);
  record(input,keys,'verified metrics');
  return Object.fromEntries(keys.map(k=>{
    budget.spend();
    if(!Number.isFinite(input[k])||input[k]<0)throw Error('Invalid ARES verified metric.');
    return [k,input[k]===0?0:input[k]];
  }));
}
async function digest(text,budget){
  const bytes=new TextEncoder().encode(text);
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(!globalThis.crypto?.subtle)throw Error('ARES candidate fingerprint unavailable.');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
// Trusted reference verifier returns a detached candidate and independently
// computed consequences. Synthetic verification is contract testing only;
// actual city validity requires the domain adapter in the next batch.
export function createAresCandidateRetention(contextInput,snapshotInput,profileInput,capacity,verify,budget){
  if(typeof budget?.spend!=='function')throw Error('Shared ARES retention budget required.');
  if(typeof verify!=='function')throw Error('Independent ARES verifier required.');
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>3)throw Error('Invalid ARES research retention capacity.');
  const context=createAresDiagnosticContext(contextInput),snapshotFingerprint=fingerprint(snapshotInput);
  const ranking=profile(profileInput,budget);
  let retained=[],active=false;
  function compare(a,b){
    budget.spend();
    for(const c of ranking.criteria){
      budget.spend();const x=a.metrics[c.metric],y=b.metrics[c.metric];
      if(x!==y)return (x<y?-1:1)*(c.direction==='min'?1:-1);
    }
    return riCompare(a.candidateFingerprint,b.candidateFingerprint);
  }
  const state=()=>riFreeze({version:ARES_RETENTION_VERSION,context,snapshotFingerprint,profile:ranking,
    capacity,incumbent:retained[0]??null,alternatives:retained.slice(1)});
  return Object.freeze({
    snapshot:state,
    async consider(input){
      if(active)throw Error('ARES serial verification already active.');
      active=true;
      try{
        budget.spend();
        record(input,['version','context','snapshotFingerprint','proposal'],'candidate proposal');
        if(input.version!==ARES_RETENTION_VERSION||!sourceMatches(input,context,snapshotFingerprint))
          throw Error('Stale ARES candidate proposal.');
        const proposal=detached(input.proposal,budget);
        const output=await verify(proposal,Object.freeze({context,snapshotFingerprint,profile:ranking}),budget);
        budget.spend();
        // Detach returned evidence before any further await. No caller
        // supplied metric or claimed verified result can skip this callback.
        const observed=detached(output,budget);
        if(observed.status==='refused'){
          record(observed,['status','context','snapshotFingerprint','reason'],'verification refusal');
          if(!sourceMatches(observed,context,snapshotFingerprint))throw Error('Stale ARES verification result.');
          return riFreeze({status:'refused',reason:token(observed.reason)});
        }
        record(observed,['status','context','snapshotFingerprint','candidate','metrics'],'verification result');
        if(observed.status!=='verified'||!sourceMatches(observed,context,snapshotFingerprint))
          throw Error('Stale or invalid ARES verification result.');
        const measured=metrics(observed.metrics,ranking,budget);
        const candidate=observed.candidate;
        const candidateFingerprint=await digest(aresReplayJson(candidate,budget),budget);
        const row=riFreeze({candidateFingerprint,candidate,metrics:measured});
        const duplicate=retained.find(r=>r.candidateFingerprint===candidateFingerprint);
        if(duplicate){
          if(aresReplayJson(duplicate.metrics,budget)!==aresReplayJson(measured,budget))
            throw Error('Inconsistent ARES verified consequence evidence.');
          return riFreeze({status:'duplicate',candidateFingerprint});
        }
        // Atomic retention: budget exhaustion, malformed evidence or any
        // verification exception leaves the previous incumbent untouched.
        const next=[...retained,row].sort(compare).slice(0,capacity);
        const included=next.includes(row),improved=next[0]===row;
        retained=next;
        return riFreeze({status:included?'retained':'not-retained',candidateFingerprint,improved});
      }finally{active=false;}
    }
  });
}
