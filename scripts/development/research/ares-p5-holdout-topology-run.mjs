import {holdoutLockedRow,HOLDOUT_SPLIT_PERMISSIONS} from './ares-p5-holdout-lock.mjs';
import {observeP5Topology,constructP5HoldoutSplit} from './ares-p5-topology-observe.mjs';
import {auditP5HoldoutSplit} from './ares-p5-topology-audit.mjs';
import {LareBudgetExceeded} from '../../../src/core/reconciliation-budget.js';
export async function runHoldoutTopology(caseId){
  const frozen=holdoutLockedRow(caseId);
  const base={caseId,source:frozen.source,options:frozen.options,group:frozen.group,offset:frozen.offset,selectedRoadIds:frozen.selectedRoadIds,authority:'none'};
  let observation;
  try{observation=await observeP5Topology(caseId,HOLDOUT_SPLIT_PERMISSIONS);}
  catch(e){if(e instanceof LareBudgetExceeded)return {...base,category:'observation-work-limit',reason:e.resource};throw e;}
  if(observation.source!==frozen.source||observation.caseId!==caseId||observation.authority!=='none'||observation.topologyChanged)
    throw Error('Holdout topology observation identity changed.');
  const row={...base,observation,construction:null,audit:null};
  if(!observation.scope.mandatoryComplete)return {...row,category:'preflight-refused'};
  if(observation.other.length)return {...row,category:'other-blockers'};
  if(!observation.conflicts.length)return {...row,category:'no-contacts'};
  if(observation.conflicts.some(c=>c.status!=='research-contact-only'||c.contact.kind!=='interior-interior'))
    return {...row,category:'contact-closure-held'};
  // Census is read-only and separately accounted. Constructor repeats its
  // own preflight in its original root, never consumes the observed DTO.
  row.construction=await constructP5HoldoutSplit(caseId);
  if(row.construction.status!=='graph-candidate')return {...row,category:row.construction.status};
  row.audit=await auditP5HoldoutSplit(caseId,row.construction);
  return {...row,category:row.audit.status==='topology-final-verified'&&row.audit.reason===null?'strict-topology-verified':row.audit.status==='topology-final-verified'?'swept-held':row.audit.status};
}
