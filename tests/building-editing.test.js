import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildingEditSession } from '../src/editor/building.js';

const city = {
  properties: [
    { id: 'p1', buildingIds: ['b1', 'b2'], boundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
    { id: 'p2', buildingIds: ['b3'] }
  ],
  buildings: [
    { id: 'b1', propertyId: 'p1', footprint: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }] },
    { id: 'b2', propertyId: 'p1', footprint: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }] },
    { id: 'b3', propertyId: 'p2', footprint: [{ x: 8, y: 8 }, { x: 9, y: 8 }, { x: 8, y: 9 }] }
  ]
};
const snapshot = () => JSON.stringify(city);
test('3G-A mode is transient, property-scoped and never changes city geometry', () => {
  const original = snapshot(), changes = [];
  const session = new BuildingEditSession(() => changes.push(session.buildingId));
  assert.equal(session.start(city, { buildings: true }, 'absent'), false);
  assert.equal(session.start(city, { buildings: false }, 'b1'), false);
  assert.equal(session.start(city, { buildings: true }, 'b1'), true);
  assert.equal(session.isActive, true);
  assert.equal(session.propertyId, 'p1');
  assert.equal(session.allows(city, { buildings: true }, 'b2'), true);
  assert.equal(session.allows(city, { buildings: true }, 'b3'), false);
  assert.equal(session.focus(city, { buildings: true }, 'b3'), false);
  assert.equal(session.focus(city, { buildings: true }, 'b2'), true);
  assert.equal(session.buildingId, 'b2');
  assert.deepEqual(changes, ['b1', 'b2']);
  assert.equal(session.stop(), true);
  assert.equal(session.stop(), false);
  assert.equal(session.isActive, false);
  assert.equal(snapshot(), original);
});
test('3G-A rejects orphaned/missing buildings and clears stale layer/selection targets', () => {
  const session = new BuildingEditSession();
  assert.equal(session.start({ ...city, properties: [{ id: 'p1', buildingIds: [] }] }, { buildings: true }, 'b1'), false);
  assert.equal(session.start(city, { buildings: true }, 'b1'), true);
  assert.equal(session.reconcile(city, { buildings: true }, { kind: 'building', id: 'b1' }), true);
  assert.equal(session.reconcile(city, { buildings: false }, { kind: 'building', id: 'b1' }), false);
  assert.equal(session.start(city, { buildings: true }, 'b1'), true);
  assert.equal(session.reconcile(city, { buildings: true }, { kind: 'property', id: 'p1' }), false);
  assert.equal(session.start(city, { buildings: true }, 'b1'), true);
  assert.equal(session.reconcile({ ...city, buildings: [] }, { buildings: true }, { kind: 'building', id: 'b1' }), false);
});
