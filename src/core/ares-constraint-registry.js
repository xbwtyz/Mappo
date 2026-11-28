import { riFreeze, riCompare } from './road-impact-model.js';

export const ARES_CONSTRAINT_PROVIDER_VERSION=1;
// Descriptor registration only: no provider execution, geometry or write rights.
export function createAresConstraintRegistry(descriptors) {
  if(!Array.isArray(descriptors))throw Error('Invalid ARES provider descriptors.');
  const providers=new Map();
  for(const d of descriptors) {
    if(!d||typeof d!=='object'||Array.isArray(d)||
       ![Object.prototype,null].includes(Object.getPrototypeOf(d))||
       Object.keys(d).some(k=>!['id','version','capabilities'].includes(k))||
       typeof d.id!=='string'||!d.id.trim()||d.id.length>200||
       d.version!==ARES_CONSTRAINT_PROVIDER_VERSION||
       !Array.isArray(d.capabilities)||!d.capabilities.length||
       d.capabilities.some(c=>typeof c!=='string'||!c.trim()||c.length>200)||
       new Set(d.capabilities).size!==d.capabilities.length||providers.has(d.id))
      throw Error('Invalid or duplicate ARES provider descriptor.');
    providers.set(d.id,riFreeze({id:d.id,version:d.version,capabilities:[...d.capabilities].sort(riCompare)}));
  }
  const ordered=[...providers.values()].sort((a,b)=>riCompare(a.id,b.id));
  return Object.freeze({
    descriptors:()=>Object.freeze([...ordered]),
    // Missing capability is explicitly unsupported, never an unconstrained pass.
    supports:(id,capability)=>providers.get(id)?.capabilities.includes(capability)===true
  });
}
