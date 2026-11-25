import {
  IDENTITY_ALLOCATION_VERSION, formatAllocatedIdentity,
  validateAllocationNamespace, validateAllocationType, validateIdentityAllocationState
} from './identity-allocation.js';

// Detached reservations, not committed IDs or Apply authority. The caller
// supplies an already selected editing-session namespace and stable request keys.
export const MAX_IDENTITY_RESERVATION_REQUESTS = 4096;
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const has = (value,key) => Object.hasOwn(value,key);

export function normalizeIdentityRequests(requests) {
  if (!Array.isArray(requests) || requests.length > MAX_IDENTITY_RESERVATION_REQUESTS)
    throw Error('Invalid identity reservation request count');
  const seen = new Set(), normalized = [];
  for (const request of requests) {
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        ![Object.prototype,null].includes(Object.getPrototypeOf(request)) ||
        Reflect.ownKeys(request).length !== 2 || !has(request,'type') || !has(request,'key'))
      throw Error('Invalid identity reservation request');
    const {type,key} = request;
    validateAllocationType(type);
    if (typeof key !== 'string' || !keyPattern.test(key) || seen.has(key))
      throw Error('Invalid or duplicate identity reservation key');
    seen.add(key);
    normalized.push(Object.freeze({type,key}));
  }
  normalized.sort((a,b)=>compare(a.type,b.type)||compare(a.key,b.key));
  return Object.freeze(normalized);
}

function canonicalStateCopy(state) {
  return Object.fromEntries(Object.keys(state.namespaces).sort(compare).map(namespace=>[
    namespace,Object.fromEntries(Object.keys(state.namespaces[namespace]).sort(compare)
      .map(type=>[type,state.namespaces[namespace][type]]))
  ]));
}

export function reserveAllocatedIdentities(state, namespace, requests) {
  validateIdentityAllocationState(state);
  validateAllocationNamespace(namespace);
  const normalized = normalizeIdentityRequests(requests);
  const namespaces = canonicalStateCopy(state);
  const prior = namespaces[namespace] ?? {};
  const counts = new Map();
  for (const {type} of normalized) counts.set(type,(counts.get(type)??0)+1);
  // Refuse the entire batch if a single type would exhaust its counter.
  for (const [type,count] of counts) {
    if (Number.MAX_SAFE_INTEGER - (prior[type]??0) < count)
      throw Error('Identity allocation counter exhausted');
  }
  const next = {...prior}, allocations = [];
  for (const {type,key} of normalized) {
    const sequence = (next[type]??0)+1;
    next[type]=sequence;
    allocations.push(Object.freeze({type,key,sequence,id:formatAllocatedIdentity(type,namespace,sequence)}));
  }
  // Empty reservations do not persist the session namespace.
  if (allocations.length) namespaces[namespace]=next;
  // Canonical ordering includes newly introduced keys/namespaces.
  const ordered = canonicalStateCopy({namespaces});
  for (const counters of Object.values(ordered)) Object.freeze(counters);
  const nextState = Object.freeze({version:IDENTITY_ALLOCATION_VERSION,namespaces:Object.freeze(ordered)});
  validateIdentityAllocationState(nextState);
  return Object.freeze({version:1,namespace,allocations:Object.freeze(allocations),nextState});
}
