import { ALLOCATION_TYPES, parseAllocatedIdentity, validateAllocationNamespace,
  validateAllocationCounter, validateIdentityAllocationState, iterateIdentityAllocationStateValidation } from './identity-allocation.js';
import { normalizeIdentityRequests, reserveAllocatedIdentities } from './identity-reservations.js';

const idaInventoryCollections=Object.freeze({building:'buildings',property:'properties',plot:'plots'});
const idaOtherCollections=['nodes','roads','blocks','districts','walls','gates','towers',
  'waterFeatures','bridges','waterFaces','terrainFeatures','terrainPasses','terrainFaces','openSpaces'];
const idaReservedPattern=/^(BLD|PROP|PLOT)-IDA-/;
const idaVerifyHas=(o,k)=>Object.hasOwn(o,k);
function idaVerifyFields(o,keys,label){
  if(!o||typeof o!=='object'||Array.isArray(o)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(o))||
    Reflect.ownKeys(o).length!==keys.length||keys.some(k=>!idaVerifyHas(o,k)))
    throw Error('Invalid identity '+label);
}
function idaNormalizeContext(input){
  idaVerifyFields(input,['projectId','revision','namespace'],'reservation context');
  const {projectId,revision,namespace}=input;
  if(typeof projectId!=='string'||!projectId.trim()||projectId.length>200)
    throw Error('Invalid identity project binding');
  validateAllocationCounter(revision);
  validateAllocationNamespace(namespace);
  return Object.freeze({projectId,revision,namespace});
}

// Checks active top-level IDs against the persisted high-water marks.
// Historical gaps are permitted, but the counter may never be below an active ID.
function* idaIterateInventory(state,city,spend=()=>{}){
  yield* iterateIdentityAllocationStateValidation(state,spend);
  let scanned=0;
  if(!city||typeof city!=='object'||Array.isArray(city))throw Error('Missing identity inventory');
  const index=new Map();
  for(const [type,collection] of Object.entries(idaInventoryCollections)){
    if(!Array.isArray(city[collection]))throw Error('Missing identity inventory collection');
    const ids=new Set();
    for(const row of city[collection]){
      spend(1);
      if(++scanned%256===0)yield {stage:'project-identity-inventory'};
      const id=row?.id;
      if(typeof id!=='string'||!id.trim()||id.length>128||ids.has(id))
        throw Error('Invalid or duplicate active identity');
      ids.add(id);
      if(idaReservedPattern.test(id)){
        const parsed=parseAllocatedIdentity(id);
        if(parsed.type!==type||!idaVerifyHas(state.namespaces,parsed.namespace)||
          (state.namespaces[parsed.namespace][type]??0)<parsed.sequence)
          throw Error('Active identity not covered by allocation state');
      }
    }
    index.set(type,ids);
  }
  // Reserved syntax is not available to unregistered top-level entity types.
  for(const collection of idaOtherCollections){
    const rows=city[collection]??[];
    if(!Array.isArray(rows))throw Error('Invalid identity inventory collection');
    for(const row of rows){
      spend(1);
      if(++scanned%256===0)yield {stage:'project-identity-inventory'};
      if(typeof row?.id==='string'&&idaReservedPattern.test(row.id))
        throw Error('Reserved identity in unsupported collection');
    }
  }
  if(typeof city.plaza?.id==='string'&&idaReservedPattern.test(city.plaza.id))
    throw Error('Reserved identity in unsupported collection');
  return index;
}
function idaIndexInventory(state,city){
  const steps=idaIterateInventory(state,city);
  for(let step=steps.next();;step=steps.next())if(step.done)return step.value;
}
export function* iterateActiveIdentityInventory(state,city,spend){
  yield* idaIterateInventory(state,city,spend);
  return true;
}
export function validateActiveIdentityInventory(state,city){
  idaIndexInventory(state,city);
  return true;
}

export function issueIdentityReservation(state,city,context,requests){
  const binding=idaNormalizeContext(context);
  idaIndexInventory(state,city);
  const proposed=reserveAllocatedIdentities(state,binding.namespace,requests);
  return Object.freeze({version:1,binding,allocations:proposed.allocations,nextState:proposed.nextState});
}

// Independent arithmetic and identity checks, NOT a call back into the
// reservation producer. The context and requests must originate with the host,
// never from the untrusted receipt. Host revision must advance on accepted edits.
export function verifyIdentityReservation(state,city,context,requests,receipt){
  const binding=idaNormalizeContext(context),index=idaIndexInventory(state,city);
  const expected=normalizeIdentityRequests(requests);
  idaVerifyFields(receipt,['version','binding','allocations','nextState'],'reservation receipt');
  const actual=idaNormalizeContext(receipt.binding);
  if(receipt.version!==1||Object.keys(binding).some(k=>binding[k]!==actual[k]))
    throw Error('Stale or incompatible identity reservation');
  if(!Array.isArray(receipt.allocations)||receipt.allocations.length!==expected.length)
    throw Error('Identity reservation count mismatch');
  const increments=new Map(),ids=new Set();
  const prior=state.namespaces[binding.namespace]??{};
  for(let i=0;i<expected.length;i++){
    const row=receipt.allocations[i],request=expected[i];
    idaVerifyFields(row,['type','key','sequence','id'],'reservation allocation');
    const n=(increments.get(request.type)??0)+1;
    increments.set(request.type,n);
    const base=prior[request.type]??0;
    if(Number.MAX_SAFE_INTEGER-base<n)throw Error('Identity allocation counter exhausted');
    const parsed=parseAllocatedIdentity(row.id);
    if(row.type!==request.type||row.key!==request.key||row.sequence!==base+n||
      parsed.type!==request.type||parsed.namespace!==binding.namespace||parsed.sequence!==base+n||
      ids.has(row.id)||index.get(request.type).has(row.id))
      throw Error('Identity reservation allocation mismatch');
    ids.add(row.id);
  }
  validateIdentityAllocationState(receipt.nextState);
  // Compare every namespace and registered counter, not only modified fields.
  const namespaces=new Set(Object.keys(state.namespaces));
  if(expected.length)namespaces.add(binding.namespace);
  if(Object.keys(receipt.nextState.namespaces).length!==namespaces.size)
    throw Error('Identity reservation namespace mismatch');
  const verified={};
  for(const ns of [...namespaces].sort()){
    if(!idaVerifyHas(receipt.nextState.namespaces,ns))throw Error('Identity reservation namespace mismatch');
    const old=state.namespaces[ns]??{},next=receipt.nextState.namespaces[ns],out={};
    for(const type of Object.keys(ALLOCATION_TYPES).sort()){
      const value=(old[type]??0)+(ns===binding.namespace?(increments.get(type)??0):0);
      if(value===0?idaVerifyHas(next,type):next[type]!==value)
        throw Error('Identity reservation counter mismatch');
      if(value)out[type]=value;
    }
    verified[ns]=Object.freeze(out);
  }
  return Object.freeze({version:1,namespaces:Object.freeze(verified)});
}

// Verify exact new membership in the registered collections. Does not
// authorize retirement, survivor changes, ownership, geometry or Apply.
export function verifyIdentityAdditions(state,before,context,requests,receipt,candidate){
  const next=verifyIdentityReservation(state,before,context,requests,receipt);
  const oldIndex=idaIndexInventory(state,before),newIndex=idaIndexInventory(next,candidate);
  const expected=new Set(receipt.allocations.map(row=>row.id));
  for(const [type,ids] of newIndex)for(const id of ids){
    if(oldIndex.get(type).has(id))continue;
    if(!expected.delete(id))throw Error('Unreserved identity addition');
  }
  if(expected.size)throw Error('Reserved identity missing from candidate');
  return next;
}
