import {createIdentityAllocationState} from '../core/identity-allocation.js';
import {validateActiveIdentityInventory} from '../core/identity-verification.js';
import {validateJsonTree} from './project-validation.js';

// Detached migration only. Full stored-project validation and hydration are
// the adoption pipeline's responsibility. No generator or session allocation.
export function migrateSchema10ProjectS11(source){
  if(!source||typeof source!=='object'||Array.isArray(source)||
    source.schemaVersion!==10||!source.city||typeof source.city!=='object'||
    Array.isArray(source.city))
    throw Error('S11 migration requires a Schema 10 project with a city.');
  if(Object.hasOwn(source,'identityAllocation'))
    throw Error('S11 migration cannot overwrite existing identityAllocation metadata.');
  validateJsonTree(source);
  const candidate=JSON.parse(JSON.stringify(source));
  // A legacy ID in the reserved namespace is ambiguous, even if it happens
  // to be well formed. Never infer allocation history from present entities.
  const allocation=createIdentityAllocationState();
  validateActiveIdentityInventory(allocation,candidate.city);
  candidate.schemaVersion=11;
  candidate.identityAllocation=allocation;
  validateJsonTree(candidate);
  return candidate;
}
