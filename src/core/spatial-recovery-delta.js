import { ROAD_IMPACT_COLLECTIONS, riFreeze } from './road-impact-model.js';
import { createSpatialOperation, createSpatialInventory, createSpatialRef, spatialRefKey } from './spatial-recovery-contract.js';
import { verifyIdentityAdditions } from './identity-verification.js';
import { copyJson } from '../data/project-format.js';
import { iterateJsonTreeValidation } from '../data/project-validation.js';

export const SRE_DELTA_VERSION = 2;
const sreDeltaCollections = ROAD_IMPACT_COLLECTIONS.map(([key])=>key);
const sreDevelopmentCollections = new Set(['properties','plots','buildings']);
const sreDeltaFields = ['version','projectId','revision','acceptedFingerprint','intentFingerprint','policyFingerprint',
  'strategyVersion','modified','retired','added','candidateFingerprint'];
function sreExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some(key=>!Object.hasOwn(value,key)))
    throw Error('Malformed spatial delta.');
}
function sreCheckJson(value,budget) {
  for (const _ of iterateJsonTreeValidation(value)) budget.spend(256);
  budget.spend();
}
async function sreFingerprint(value,budget) {
  sreCheckJson(value,budget);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  budget.spend(Math.max(1,Math.ceil(bytes.length/64)));
  if (!globalThis.crypto?.subtle) throw Error('Spatial fingerprint unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
function sreSameJson(a,b) { return JSON.stringify(a)===JSON.stringify(b); }
function sreOutsideCollections(project) {
  const {identityAllocation: _allocation, ...root}=project;
  return {...root,city:Object.fromEntries(Object.entries(project.city).filter(([key])=>!sreDeltaCollections.includes(key)))};
}
function sreIndexDelta(project, budget) {
  const index=new Map();
  for (const collection of sreDeltaCollections) {
    if (!Object.hasOwn(project.city,collection)) continue;
    const records=project.city[collection];
    if (!Array.isArray(records)) throw Error('Invalid spatial delta collection.');
    const map=new Map();
    for (const row of records) {
      budget.spend();
      const ref=createSpatialRef({collection,id:row?.id});
      if (map.has(ref.id)) throw Error('Duplicate spatial delta identity.');
      map.set(ref.id,row);
    }
    index.set(collection,map);
  }
  return index;
}
function sreRequireStrategy(version) {
  if (!Number.isSafeInteger(version)||version<1) throw Error('Invalid spatial strategy version.');
}
function sreDeltaMembership(ref,permission,action) {
  if (!sreDevelopmentCollections.has(ref.collection) ||
    !(action==='retire'?permission.destruction:permission.regeneration))
    throw Error('Unauthorized spatial membership change.');
}
// Conservative deterministic accounting for the independent allocator verifier:
// its accepted inventory is scanned twice and its candidate inventory once.
// Charge namespace/counter and request processing before invoking it as well.
function sreVerifyIdentityMetered(accepted,candidate,context,requests,receipt,budget) {
  for (const [city,multiplier] of [[accepted.city,2],[candidate.city,1]]) {
    for (const rows of Object.values(city)) {
      budget.spend();
      if (Array.isArray(rows) && rows.length) budget.spend(rows.length*multiplier);
    }
  }
  for (const state of [accepted.identityAllocation,receipt?.nextState]) {
    for (const counters of Object.values(state?.namespaces??{})) {
      budget.spend(8);
      if (counters && typeof counters==='object') budget.spend(Math.max(1,Object.keys(counters).length*8));
    }
  }
  if (Array.isArray(requests)) budget.spend(Math.max(1,requests.length*8));
  if (Array.isArray(receipt?.allocations)) budget.spend(Math.max(1,receipt.allocations.length*8));
  return verifyIdentityAdditions(accepted.identityAllocation,accepted.city,context,requests,receipt,candidate.city);
}
// Allocation authorization is a separate host-supplied context and request list.
// A receipt alone is not authorization; never derive requests from a delta.
function sreVerifyAllocation(accepted,candidate,operation,authorization,budget) {
  const before=accepted.identityAllocation;
  if (!authorization) {
    if (!sreSameJson(before,candidate.identityAllocation)) throw Error('Unauthorized spatial allocation change.');
    for (const key of sreDevelopmentCollections) {
      const old=new Set(accepted.city[key].map(row=>row.id));
      for (const row of candidate.city[key]) { budget.spend(); if (!old.has(row.id)) throw Error('Unreserved spatial identity addition.'); }
    }
    return;
  }
  const {context,requests,receipt}=authorization;
  if (!operation.permissions.regeneration || context?.projectId!==operation.projectId || context?.revision!==operation.revision)
    throw Error('Unauthorized or stale spatial allocation context.');
  const next=sreVerifyIdentityMetered(accepted,candidate,context,requests,receipt,budget);
  if (!sreSameJson(next,candidate.identityAllocation)) throw Error('Spatial allocation transition mismatch.');
}
// Structural diff only. It must never be used as geometry/provenance
// validation or as authority to Apply; that gate belongs to later P1/P2 work.
// v2 deliberately refuses collection reorder, non-collection changes, and
// inserting new identities anywhere but the end of the collection.
export async function createSpatialDelta(accepted,candidate,input,strategyVersion,budget,authorization) {
  const operation=createSpatialOperation(input);
  sreRequireStrategy(strategyVersion);
  const acceptedFingerprint=await sreFingerprint(accepted,budget);
  const candidateFingerprint=await sreFingerprint(candidate,budget);
  return sreBuildSpatialDelta(accepted,candidate,operation,strategyVersion,budget,authorization,acceptedFingerprint,candidateFingerprint);
}

// Internal structural ledger builder. Fingerprints are produced only by
// the validating entry point or the independent reconstruction below.
// No caller-supplied digest or search evidence can bypass validation.
async function sreBuildSpatialDelta(accepted,candidate,operation,strategyVersion,budget,authorization,acceptedFingerprint,candidateFingerprint) {
  createSpatialInventory(accepted,operation,budget);
  if (candidate?.schemaVersion!==11 || !sreSameJson(sreOutsideCollections(accepted),sreOutsideCollections(candidate)))
    throw Error('Unsupported non-collection spatial change.');
  const before=sreIndexDelta(accepted,budget), after=sreIndexDelta(candidate,budget);
  const modified=[],retired=[],added=[];
  for (const collection of sreDeltaCollections) {
    const a=before.get(collection),b=after.get(collection);
    if (Boolean(a)!==Boolean(b)) throw Error('Unsupported spatial collection change.');
    if (!a) continue;
    const expected=[...a.keys()].filter(id=>b.has(id)).concat([...b.keys()].filter(id=>!a.has(id)));
    if (!sreSameJson(expected,[...b.keys()])) throw Error('Unsupported spatial collection order.');
    for (const [id,row] of a) {
      budget.spend();
      const ref=createSpatialRef({collection,id});
      if (!b.has(id)) {sreDeltaMembership(ref,operation.permissions,'retire');retired.push(ref);}
      else if (!sreSameJson(row,b.get(id))) modified.push({ref,record:copyJson(b.get(id))});
    }
    for (const [id,row] of b) if (!a.has(id)) {
      budget.spend();
      const ref=createSpatialRef({collection,id});
      sreDeltaMembership(ref,operation.permissions,'add');
      added.push({ref,record:copyJson(row)});
    }
  }
  sreVerifyAllocation(accepted,candidate,operation,authorization,budget);
  return riFreeze({version:SRE_DELTA_VERSION,projectId:operation.projectId,revision:operation.revision,
    acceptedFingerprint,intentFingerprint:await sreFingerprint(operation,budget),
    policyFingerprint:await sreFingerprint(operation.permissions,budget),strategyVersion,
    modified,retired,added,candidateFingerprint});
}
// The caller supplies the CURRENT trusted operation and revision, not the
// operation echoed by a worker. This checks transport consistency only.
export async function reconstructSpatialDelta(accepted,input,strategyVersion,delta,budget,authorization) {
  const operation=createSpatialOperation(input);
  sreRequireStrategy(strategyVersion);
  sreExactKeys(delta,sreDeltaFields);
  sreCheckJson(delta,budget);
  if (delta.version!==SRE_DELTA_VERSION || delta.projectId!==operation.projectId ||
      delta.revision!==operation.revision || delta.strategyVersion!==strategyVersion ||
      delta.acceptedFingerprint!==await sreFingerprint(accepted,budget) ||
      delta.intentFingerprint!==await sreFingerprint(operation,budget) ||
      delta.policyFingerprint!==await sreFingerprint(operation.permissions,budget))
    throw Error('Stale or incompatible spatial delta.');
  createSpatialInventory(accepted,operation,budget);
  const candidate=copyJson(accepted),index=sreIndexDelta(candidate,budget),seen=new Set();
  const acceptRef=(value,action)=>{
    budget.spend();
    const ref=createSpatialRef(value),key=spatialRefKey(ref);
    if (seen.has(key)) throw Error('Duplicate spatial delta reference.');
    seen.add(key);
    const records=index.get(ref.collection);
    if (!records || (action==='add'?records.has(ref.id):!records.has(ref.id)))
      throw Error('Missing or reused spatial delta identity.');
    if (action!=='modify') sreDeltaMembership(ref,operation.permissions,action);
    return {ref,records};
  };
  for (const name of ['modified','retired','added']) if (!Array.isArray(delta[name])) throw Error('Malformed spatial delta list.');
  for (const item of delta.modified) {
    sreExactKeys(item,['ref','record']);
    const {ref,records}=acceptRef(item.ref,'modify');
    if (item.record?.id!==ref.id||sreSameJson(records.get(ref.id),item.record)) throw Error('Invalid spatial modification.');
    records.set(ref.id,copyJson(item.record));
  }
  for (const item of delta.retired) {
    const {ref,records}=acceptRef(item,'retire');
    records.delete(ref.id);
  }
  for (const item of delta.added) {
    sreExactKeys(item,['ref','record']);
    const {ref,records}=acceptRef(item.ref,'add');
    if (item.record?.id!==ref.id) throw Error('Invalid spatial addition.');
    records.set(ref.id,copyJson(item.record));
  }
  for (const [collection,records] of index) candidate.city[collection]=[...records.values()];
  if (authorization) {
    const {context,requests,receipt}=authorization;
    if (!operation.permissions.regeneration || context?.projectId!==operation.projectId || context?.revision!==operation.revision)
      throw Error('Unauthorized or stale spatial allocation context.');
    candidate.identityAllocation=sreVerifyIdentityMetered(accepted,candidate,context,requests,receipt,budget);
  }
  const result=copyJson(candidate);
  const candidateFingerprint=await sreFingerprint(result,budget);
  if (delta.candidateFingerprint!==candidateFingerprint) throw Error('Spatial candidate fingerprint mismatch.');
  // Recompute the full structural ledger rather than trusting the worker's
  // classification or order. The candidate is an owned reconstruction; its
  // independently validated digest can be reused within this call only.
  // Recheck the externally owned accepted project as before.
  const acceptedFingerprint=await sreFingerprint(accepted,budget);
  const rebuilt=await sreBuildSpatialDelta(accepted,result,operation,strategyVersion,budget,authorization,acceptedFingerprint,candidateFingerprint);
  if (!sreSameJson(rebuilt,delta)) throw Error('Spatial delta differs from reconstructed ledger.');
  return result;
}
