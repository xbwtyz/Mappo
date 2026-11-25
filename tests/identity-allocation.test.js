import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOCATION_TYPES, createIdentityAllocationState, formatAllocatedIdentity,
  parseAllocatedIdentity, validateIdentityAllocationState
} from '../src/core/identity-allocation.js';

const ns = '0123456789abcdef0123456789abcdef';
const state = counters => ({ version: 1, namespaces: { [ns]: counters } });

test('IDA creates empty deterministic immutable state', () => {
  const a = createIdentityAllocationState(), b = createIdentityAllocationState();
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.namespaces));
  assert.equal(validateIdentityAllocationState(a), true);
});
for (const [type, prefix] of Object.entries(ALLOCATION_TYPES)) {
  test('IDA round trips canonical ' + type + ' identities', () => {
    for (const sequence of [1, 999999, 1000000, Number.MAX_SAFE_INTEGER]) {
      const id = formatAllocatedIdentity(type, ns, sequence);
      assert.ok(id.startsWith(prefix + '-IDA-'));
      assert.ok(id.length <= 128);
      assert.deepEqual(parseAllocatedIdentity(id), { type, namespace: ns, sequence });
    }
  });
}
test('IDA typed IDs remain distinct for the same namespace and sequence', () => {
  assert.equal(new Set(Object.keys(ALLOCATION_TYPES).map(type =>
    formatAllocatedIdentity(type, ns, 1))).size, 3);
});
test('IDA rejects invalid and noncanonical identities', () => {
  const prefix = 'BLD-IDA-' + ns + '-';
  for (const id of [null, '', 'BLD-000001', prefix + '1', prefix + '0000001',
    prefix + '000000', prefix + '-00001', prefix + '1e6', prefix + '9007199254740992',
    prefix + '000001\n', 'BLD-IDA-' + ns.toUpperCase() + '-000001']) {
    assert.throws(() => parseAllocatedIdentity(id));
  }
});
test('IDA rejects invalid type, namespace and allocation sequence', () => {
  for (const type of ['constructor', '__proto__', 'road', null]) {
    assert.throws(() => formatAllocatedIdentity(type, ns, 1));
  }
  for (const namespace of ['', ns.slice(1), ns.toUpperCase(), ns + '\n', null]) {
    assert.throws(() => formatAllocatedIdentity('building', namespace, 1));
  }
  for (const sequence of [0, -0, -1, 1.5, Infinity, NaN, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => formatAllocatedIdentity('building', ns, sequence));
  }
});
test('IDA state validation accepts sparse positive counters and multiple namespaces', () => {
  const value = state({ building: 1, plot: Number.MAX_SAFE_INTEGER });
  value.namespaces['f'.repeat(32)] = { property: 42 };
  assert.equal(validateIdentityAllocationState(value), true);
  assert.equal(validateIdentityAllocationState(JSON.parse(JSON.stringify(value))), true);
});
test('IDA state validation refuses malformed metadata without mutating it', () => {
  const values = [
    null, [], {}, {version: 2, namespaces: {}},
    {version: 1, namespaces: {}, extra: true},
    {version: 1, namespaces: []}, {version: 1, namespaces: {bad: {plot: 1}}},
    state({}), state({building: 0}), state({building: -1}), state({building: 1.5}),
    state({building: '1'}), state({building: Infinity}), state({building: Number.MAX_SAFE_INTEGER + 1}),
    state({road: 1}), state(JSON.parse('{"__proto__":1}')),
    {version: 1, namespaces: JSON.parse('{"__proto__":{"plot":1}}')}
  ];
  for (const value of values) {
    const before = JSON.stringify(value);
    assert.throws(() => validateIdentityAllocationState(value));
    assert.equal(JSON.stringify(value), before);
  }
});
