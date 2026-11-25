// Detached IDA-P1a foundation. No project-schema or runtime adoption yet.
export const IDENTITY_ALLOCATION_VERSION = 1;
export const ALLOCATION_TYPES = Object.freeze({
  building: 'BLD',
  property: 'PROP',
  plot: 'PLOT'
});
const namespacePattern = /^[0-9a-f]{32}$/;
const idPattern = /^(BLD|PROP|PLOT)-IDA-([0-9a-f]{32})-([0-9]+)$/;
const typeByPrefix = Object.freeze(Object.fromEntries(
  Object.entries(ALLOCATION_TYPES).map(([type, prefix]) => [prefix, type])
));
const has = (object, key) => Object.hasOwn(object, key);
const record = (value, label) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('Invalid ' + label);
  }
  return value;
};
const exactKeys = (object, keys, label) => {
  const actual = Reflect.ownKeys(object);
  if (actual.length !== keys.length || !keys.every(key => has(object, key))) {
    throw new Error('Invalid ' + label + ' fields');
  }
};
export function validateAllocationNamespace(namespace) {
  if (typeof namespace !== 'string' || !namespacePattern.test(namespace)) {
    throw new Error('Invalid identity allocation namespace');
  }
  return namespace;
}
export function validateAllocationType(type) {
  if (typeof type !== 'string' || !has(ALLOCATION_TYPES, type)) {
    throw new Error('Unsupported identity allocation type');
  }
  return type;
}
export function validateAllocationCounter(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || Object.is(value, -0)) {
    throw new Error('Invalid identity allocation counter');
  }
  return value;
}
export function formatAllocatedIdentity(type, namespace, sequence) {
  validateAllocationType(type);
  validateAllocationNamespace(namespace);
  validateAllocationCounter(sequence, 1);
  return ALLOCATION_TYPES[type] + '-IDA-' + namespace + '-' + String(sequence).padStart(6, '0');
}
export function parseAllocatedIdentity(id) {
  if (typeof id !== 'string') throw new Error('Invalid allocated identity');
  const match = idPattern.exec(id);
  if (!match) throw new Error('Invalid allocated identity');
  const type = typeByPrefix[match[1]];
  const namespace = match[2];
  const sequence = Number(match[3]);
  if (formatAllocatedIdentity(type, namespace, sequence) !== id) {
    throw new Error('Noncanonical allocated identity');
  }
  return Object.freeze({ type, namespace, sequence });
}
export function validateIdentityAllocationState(value) {
  const state = record(value, 'identity allocation state');
  exactKeys(state, ['version', 'namespaces'], 'identity allocation state');
  if (state.version !== IDENTITY_ALLOCATION_VERSION) {
    throw new Error('Unsupported identity allocation version');
  }
  const namespaces = record(state.namespaces, 'allocation namespaces');
  for (const namespace of Reflect.ownKeys(namespaces)) {
    validateAllocationNamespace(namespace);
    const counters = record(namespaces[namespace], 'allocation counters');
    const keys = Reflect.ownKeys(counters);
    if (keys.length === 0) throw new Error('Empty allocation namespace');
    for (const type of keys) {
      validateAllocationType(type);
      validateAllocationCounter(counters[type], 1);
    }
  }
  return true;
}
export function createIdentityAllocationState() {
  return Object.freeze({
    version: IDENTITY_ALLOCATION_VERSION,
    namespaces: Object.freeze({})
  });
}
// State validation alone is not proof of historical nonreuse. Later checkpoints
// bind reservations to the accepted revision, live inventory and commit/history.
