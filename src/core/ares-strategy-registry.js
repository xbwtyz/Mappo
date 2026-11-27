import { ARES_REFUSAL_REASONS, createAresDiagnostic, createAresDiagnosticContext,
  matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { riCompare, riFreeze } from './road-impact-model.js';

// P3-A: detached metadata and eligibility only. No executable plugin,
// search, scope expansion, candidate trust or Apply authority.
export const ARES_STRATEGY_VERSION=1;
const permissions=Object.freeze(['alternativeFrontage','uniformScaling','destruction','regeneration']);
const descriptorKeys=['id','version','requiredCapabilities','requiredPermissions','blockerReasons'];
function record(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
     Reflect.ownKeys(value).some(k=>!keys.includes(k))||
     keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))
    throw Error('Invalid ARES '+label+'.');
}
function token(s){
  if(typeof s!=='string'||!s.trim()||s.length>200)throw Error('Invalid ARES strategy token.');
  return s;
}
function tokens(input,budget,allowed=null){
  if(!Array.isArray(input))throw Error('Invalid ARES strategy token list.');
  const seen=new Set();
  for(const value of input){
    budget.spend();const s=token(value);
    if((allowed&&!allowed.includes(s))||seen.has(s))throw Error('Unknown or duplicate ARES strategy token.');
    seen.add(s);
  }
  return [...seen].sort(riCompare);
}
function requireBudget(budget){
  if(typeof budget?.spend!=='function')throw Error('Shared ARES strategy budget required.');
}
function descriptor(input,budget){
  budget.spend();record(input,descriptorKeys,'strategy descriptor');
  if(input.version!==ARES_STRATEGY_VERSION)throw Error('Unsupported ARES strategy contract version.');
  return riFreeze({id:token(input.id),version:input.version,
    requiredCapabilities:tokens(input.requiredCapabilities,budget),
    requiredPermissions:tokens(input.requiredPermissions,budget,permissions),
    blockerReasons:tokens(input.blockerReasons,budget,ARES_REFUSAL_REASONS)});
}
// Registry stores copied, immutable descriptors in stable ID order. The
// capability list is supplied by trusted orchestration, not a grant of rights.
// Eligibility is advisory; actual provider and candidate checks remain required.
export function createAresStrategyRegistry(inputs,budget){
  requireBudget(budget);
  if(!Array.isArray(inputs))throw Error('Invalid ARES strategy registry.');
  const byId=new Map();
  for(const input of inputs){
    const d=descriptor(input,budget);
    if(byId.has(d.id))throw Error('Duplicate ARES strategy ID.');
    byId.set(d.id,d);
  }
  const ordered=Object.freeze([...byId.values()].sort((a,b)=>riCompare(a.id,b.id)));
  return Object.freeze({
    descriptors:()=>ordered,
    assess(contextInput,{capabilities,diagnostics},shared){
      requireBudget(shared);
      const context=createAresDiagnosticContext(contextInput);
      const available=new Set(tokens(capabilities,shared));
      if(!Array.isArray(diagnostics))throw Error('Invalid ARES strategy diagnostics.');
      const reasons=new Set();
      for(const d of diagnostics){
        shared.spend();
        if(!matchesAresDiagnosticContext(d,context))throw Error('Stale ARES strategy diagnostic.');
        // Revalidate the whole evidence row, not just a claimed reason.
        const {version,context:ignored,...payload}=d;
        const normalized=createAresDiagnostic(context,payload);
        reasons.add(normalized.reason);
      }
      const assessments=[];
      for(const d of ordered){
        shared.spend();
        const missingCapabilities=d.requiredCapabilities.filter(c=>{shared.spend();return !available.has(c);});
        const missingPermissions=d.requiredPermissions.filter(p=>{shared.spend();return context.operation.permissions[p]!==true;});
        const matchedReasons=d.blockerReasons.filter(r=>{shared.spend();return reasons.has(r);});
        // No blocker requirement means a generic baseline strategy. Otherwise
        // at least one declared observed reason must match. This is routing,
        // not proof of feasibility or a ranking weight.
        const status=missingPermissions.length?'permission-required':
          missingCapabilities.length?'unsupported-capability':
          d.blockerReasons.length&&!matchedReasons.length?'not-relevant':'eligible-for-consideration';
        assessments.push({descriptor:d,status,missingCapabilities,missingPermissions,matchedReasons});
      }
      return riFreeze({version:ARES_STRATEGY_VERSION,context,assessments});
    }
  });
}
