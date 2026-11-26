import { ROAD_IMPACT_COLLECTIONS, riCompare, riFreeze } from './road-impact-model.js';
import { iterateActiveIdentityInventory } from './identity-verification.js';
import { createLareBudget, LARE_PRESERVATION_LIMITS, LARE_DEMOLITION_LIMITS } from './reconciliation-budget.js';

// Transient contract only. This is not an Apply authorization or a solver.
export const SRE_CONTRACT_VERSION = 1;
const sreCollections = Object.freeze(Object.fromEntries(ROAD_IMPACT_COLLECTIONS.map(([collection, kind]) => [collection, kind])));
const sreFamilies = Object.freeze({
  road: ['roads', 'nodes'], property: ['properties', 'plots'], building: ['buildings'],
  water: ['waterFeatures'], terrain: ['terrainFeatures'], defense: ['walls', 'gates', 'towers'],
  district: ['districts', 'blocks'],
});
const srePermissionKeys = ['alternativeFrontage', 'uniformScaling', 'maxLinearReduction', 'destruction', 'regeneration'];
function sreRecord(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some(key => !allowed.includes(key)))
    throw Error('Invalid spatial ' + label + '.');
}
function sreText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw Error('Invalid spatial ' + label + '.');
  return value;
}
export function createSpatialRef(input) {
  sreRecord(input, ['collection', 'id'], 'reference');
  if (!Object.hasOwn(sreCollections, input.collection)) throw Error('Unsupported spatial collection.');
  return Object.freeze({ collection: input.collection, id: sreText(input.id, 'ID') });
}
export function spatialRefKey(ref) {
  const normalized = createSpatialRef(ref);
  return JSON.stringify([normalized.collection, normalized.id]);
}
export function createSpatialPermissions(input = {}) {
  sreRecord(input, srePermissionKeys, 'permissions');
  const flags = ['alternativeFrontage', 'uniformScaling', 'destruction', 'regeneration'];
  for (const flag of flags)
    if (Object.hasOwn(input, flag) && typeof input[flag] !== 'boolean') throw Error('Invalid spatial permission: ' + flag);
  const scaling = input.uniformScaling ?? false;
  const limit = input.maxLinearReduction ?? (scaling ? 0.1 : 0);
  if (scaling ? ![0.05, 0.1, 0.2].includes(limit) : limit !== 0)
    throw Error('Invalid spatial scaling limit.');
  return Object.freeze({
    alternativeFrontage: input.alternativeFrontage ?? false,
    uniformScaling: scaling, maxLinearReduction: limit,
    destruction: input.destruction ?? false, regeneration: input.regeneration ?? false,
  });
}
export function createSpatialOperation(input) {
  sreRecord(input, ['version', 'family', 'operation', 'projectId', 'revision', 'editedRefs', 'permissions', 'geometry'], 'operation');
  if (input.version !== SRE_CONTRACT_VERSION || !Object.hasOwn(sreFamilies, input.family))
    throw Error('Unsupported spatial operation version or family.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0)
    throw Error('Invalid spatial accepted revision.');
  if (!Array.isArray(input.editedRefs) || !input.editedRefs.length) throw Error('Missing spatial targets.');
  const refs = input.editedRefs.map(createSpatialRef);
  const keys = refs.map(spatialRefKey);
  if (new Set(keys).size !== keys.length || refs.some(ref => !sreFamilies[input.family].includes(ref.collection)))
    throw Error('Duplicate or incompatible spatial targets.');
  refs.sort((a,b) => riCompare(spatialRefKey(a), spatialRefKey(b)));
  let geometry;
  if (Object.hasOwn(input,'geometry')) {
    if (input.family !== 'road' || input.operation !== 'translate-road-group')
      throw Error('Unsupported spatial geometry contract.');
    sreRecord(input.geometry,['offset'],'road geometry');
    sreRecord(input.geometry.offset,['x','y'],'road offset');
    const {x,y}=input.geometry.offset;
    if (![x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000) || (x===0&&y===0))
      throw Error('Invalid spatial road offset.');
    geometry={offset:{x,y}};
  }
  return riFreeze({
    version: SRE_CONTRACT_VERSION, family: input.family,
    operation: sreText(input.operation, 'operation name'),
    projectId: sreText(input.projectId, 'project identity'), revision: input.revision,
    editedRefs: refs, permissions: createSpatialPermissions(input.permissions),
    ...(geometry ? {geometry} : {}),
  });
}
// Inventory is detached and read-only; finding a reference does not make it writable.
export function createSpatialInventory(project, operation, budget) {
  const descriptor = createSpatialOperation(operation);
  if (project?.schemaVersion !== 11 || (project.id ?? project.city?.id) !== descriptor.projectId)
    throw Error('Spatial project identity or schema mismatch.');
  if (!budget?.spend) throw Error('Shared spatial budget required.');
  for (const _ of iterateActiveIdentityInventory(project.identityAllocation, project.city, n => budget.spend(n))) { /* detached validation */ }
  const seen = new Set(), refs = [];
  for (const collection of Object.keys(sreCollections)) {
    const records = project.city[collection] ?? [];
    if (!Array.isArray(records)) throw Error('Invalid spatial collection.');
    for (const record of records) {
      budget.spend();
      const ref = createSpatialRef({ collection, id: record?.id });
      const key = spatialRefKey(ref);
      if (seen.has(key)) throw Error('Duplicate spatial inventory identity.');
      seen.add(key); refs.push(ref);
    }
  }
  if (descriptor.editedRefs.some(ref => !seen.has(spatialRefKey(ref)))) throw Error('Missing spatial target.');
  refs.sort((a,b) => riCompare(spatialRefKey(a), spatialRefKey(b)));
  return riFreeze({ version: SRE_CONTRACT_VERSION, operation: descriptor, refs });
}
// Reuse existing deterministic accounting. Relaxed search limits are not set here.
export function createSpatialPreservationBudget(limits = LARE_PRESERVATION_LIMITS) {
  return createLareBudget(limits, { ceiling: LARE_PRESERVATION_LIMITS });
}


// Existing B1R demolition limits, not an increase or an automatic second
// allowance. Detached qualification only; integration will share one parent.
export function createSpatialDestructionBudget(limits=LARE_DEMOLITION_LIMITS){
  return createLareBudget(limits,{ceiling:LARE_DEMOLITION_LIMITS});
}
