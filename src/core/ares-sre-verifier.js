import { createAresDiagnosticContext, matchesAresDiagnosticContext } from './ares-diagnostic-contract.js';
import { aresReplayJson } from './ares-diagnostic-replay.js';
import { hydrateProjectS10 } from './building-project-s10.js';
import { verifySpatialUnifiedRoadWitness } from './spatial-recovery-coordinator.js';
import { ROAD_IMPACT_COLLECTIONS, riFreeze } from './road-impact-model.js';
import { APP_VERSION } from './version.js';

// Research consequences from verified before/after persisted records only.
// These are not production scoring weights or new write authority.
export const ARES_SRE_METRICS=Object.freeze(['retiredProperties','retiredPlots','retiredBuildings',
  'demolishedFootprint','survivingFootprintLoss','buildingFrontageChanges','primaryRoadChanges',
  'otherRoadChanges','modifiedRecords']);
function requireBudget(budget){
  if(typeof budget?.spend!=='function')throw Error('Shared ARES SRE verification budget required.');
}
async function digest(text,budget){
  const bytes=new TextEncoder().encode(text);
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if(!globalThis.crypto?.subtle)throw Error('ARES source fingerprint unavailable.');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}
function exactRecord(value,keys){
  if(!value||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||
    Reflect.ownKeys(value).length!==keys.length||
    keys.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))
    throw Error('Invalid ARES SRE witness envelope.');
}
function area(record){
  if(!Number.isFinite(record.area)||record.area<=0)throw Error('Invalid ARES building footprint evidence.');
  return record.area;
}
function consequences(before,after,budget){
  const metrics=Object.fromEntries(ARES_SRE_METRICS.map(k=>[k,0]));
  const retired={properties:'retiredProperties',plots:'retiredPlots',buildings:'retiredBuildings'};
  for(const [collection] of ROAD_IMPACT_COLLECTIONS){
    const a=before.city[collection]??[],b=after.city[collection]??[],next=new Map();
    for(const row of b){budget.spend();if(next.has(row.id))throw Error('Duplicate candidate identity.');next.set(row.id,row);}
    for(const old of a){
      budget.spend();const row=next.get(old.id);
      if(!row){
        if(!Object.hasOwn(retired,collection))throw Error('Unsupported retired ARES identity.');
        metrics[retired[collection]]++;
        if(collection==='buildings')metrics.demolishedFootprint+=area(old);
        continue;
      }
      next.delete(old.id);
      if(aresReplayJson(old,budget)!==aresReplayJson(row,budget)){
        metrics.modifiedRecords++;
        if(collection==='roads')metrics[old.kind==='primary'?'primaryRoadChanges':'otherRoadChanges']++;
      }
      if(collection==='buildings'){
        metrics.survivingFootprintLoss+=Math.max(0,area(old)-area(row));
        if(old.frontageRoadId!==row.frontageRoadId)metrics.buildingFrontageChanges++;
      }
    }
    if(next.size)throw Error('Regenerated identities unsupported by ARES SRE research verifier.');
  }
  if(Object.values(metrics).some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid ARES consequence totals.');
  return metrics;
}
// Capture the exact accepted source before any await. Use the same signed
// zero preserving hash as P2. Only non-regenerative existing SRE authority
// is supported; never trust a proposed cost, ledger or provisional receipt.
export async function createAresSreVerifier(project,contextInput,budget){
  requireBudget(budget);
  const context=createAresDiagnosticContext(contextInput);
  if(context.sourceVersion!==APP_VERSION||project?.schemaVersion!==11||
     (project.id??project.city?.id)!==context.operation.projectId)
    throw Error('Invalid ARES SRE source.');
  if(context.operation.permissions.regeneration)throw Error('ARES SRE regeneration research unsupported.');
  const persisted=aresReplayJson(project,budget);
  const source=hydrateProjectS10(JSON.parse(persisted));
  const snapshotFingerprint=await digest(persisted,budget);
  const verify=async(proposal,binding,shared)=>{
    requireBudget(shared);
    if(binding?.snapshotFingerprint!==snapshotFingerprint||
       !matchesAresDiagnosticContext({version:1,context:binding.context},context))
      throw Error('Stale ARES SRE source binding.');
    exactRecord(proposal,['kind','delta','basisDelta']);
    if(!['nondestructive','retirement'].includes(proposal.kind))
      throw Error('Unsupported ARES SRE witness kind.');
    if(proposal.kind==='retirement'&&!context.operation.permissions.destruction)
      throw Error('Unauthorized ARES retirement witness.');
    const witness=JSON.parse(aresReplayJson(proposal,shared));
    const candidate=await verifySpatialUnifiedRoadWitness(source,context.operation,witness,shared);
    const measured=consequences(source,candidate,shared);
    const metrics=Object.fromEntries(binding.profile.criteria.map(({metric})=>{
      shared.spend();
      if(!Object.hasOwn(measured,metric))throw Error('Unsupported ARES SRE ranking metric.');
      return [metric,measured[metric]];
    }));
    return riFreeze({status:'verified',context,snapshotFingerprint,
      candidate:JSON.parse(aresReplayJson(candidate,shared)),metrics});
  };
  return Object.freeze({context,snapshotFingerprint,verify});
}
