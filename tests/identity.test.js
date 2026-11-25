import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IdentityEditor, normalizeIdentity, validateIdentity, IDENTITY_HISTORY_LIMIT } from '../src/core/identity.js';
import { createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { createProject } from '../src/core/city-model.js';

const ref = { kind: 'property', id: 'P' };
function identityFixture() {
  return { properties: [{ id: 'P', usage: 'temple', plotIds: ['plot'], boundary: [{ x: 1, y: 2 }], future: { keep: true } }],
    buildings: [{ id: 'B', propertyId: 'P', type: 'house', shape: 'rectangle', footprint: [{ x: 3, y: 4 }] }], roads: [{ id: 'R' }] };
}
test('identity edits change only optional target fields, normalize whitespace and keep parent/child identities separate', () => {
  const city = identityFixture(), editor = new IdentityEditor(), before = JSON.stringify(city);
  const next = editor.apply(city, ref, { customName: '  Silver   Stag ', customUse: 'Inn / Tavern' });
  assert.equal(next.properties[0].customName, 'Silver Stag');
  assert.equal(next.properties[0].customUse, 'Inn / Tavern');
  assert.equal(next.properties[0].usage, 'temple');
  assert.equal(next.properties[0].boundary, city.properties[0].boundary);
  assert.equal(next.properties[0].future, city.properties[0].future);
  assert.equal(next.buildings, city.buildings);
  assert.equal(next.roads, city.roads);
  const wing = editor.apply(next, { kind: 'building', id: 'B' }, { customName: 'West wing', customUse: 'Apothecary' });
  assert.equal(wing.properties, next.properties);
  assert.equal(wing.buildings[0].type, 'house');
  assert.equal(wing.buildings[0].footprint, city.buildings[0].footprint);
  assert.equal(wing.properties[0].customName, 'Silver Stag');
  assert.equal(JSON.stringify(city), before);
});
test('clearing removes overrides; no-op edits add no history; undo restores metadata without undoing local district changes', () => {
  const editor = new IdentityEditor(), original = identityFixture();
  const named = editor.apply(original, ref, { customName: 'A', customUse: 'Temple' });
  assert.equal(editor.apply(named, ref, { customName: 'A', customUse: 'Temple' }), named);
  assert.equal(editor.history.length, 1);
  const cleared = editor.apply(named, ref, { customName: ' ', customUse: '' });
  assert.equal(Object.hasOwn(cleared.properties[0], 'customName'), false);
  const local = { ...cleared, properties: cleared.properties.map(p => ({ ...p, districtId: 'new-ward' })) };
  const restored = editor.undo(local);
  assert.equal(restored.properties[0].customName, 'A');
  assert.equal(restored.properties[0].districtId, 'new-ward');
  assert.equal(editor.undo(restored).properties[0].customName, undefined);
});
test('invalid or stale identity changes are atomic and identity history is bounded', () => {
  const editor = new IdentityEditor(), city = identityFixture(), before = JSON.stringify(city);
  for (const input of [{ customName: 'x'.repeat(81) }, { customUse: 42 }, { customName: 'bad\nname' }]) {
    assert.throws(() => editor.apply(city, ref, input));
    assert.equal(editor.history.length, 0);
    assert.equal(JSON.stringify(city), before);
  }
  assert.throws(() => editor.apply(city, { kind: 'building', id: 'missing' }, {}), /no longer/);
  let next = city;
  for (let i = 0; i < 25; i++) next = editor.apply(next, ref, { customName: `Name ${i}` });
  assert.equal(editor.history.length, IDENTITY_HISTORY_LIMIT);
  const changed = { ...next, properties: next.properties.map(p => ({ ...p, customName: 'External change' })) };
  assert.throws(() => editor.undo(changed), /not applied/);
  assert.equal(editor.history.length, IDENTITY_HISTORY_LIMIT);
  assert.deepEqual(normalizeIdentity({}), {});
});
test('optional identities round-trip in schema 9 and malformed imports are rejected without changing the source', () => {
  const project = createProject({ seed: 'identity-storage', size: 'small', morphology: 'organic' });
  const editor = new IdentityEditor(), property = project.city.properties[0];
  const city = editor.apply(project.city, { kind: 'property', id: property.id }, { customName: '<img src=x>', customUse: 'Custom guild' });
  const next = { ...project, city }, document = createProjectDocument(next);
  const text = encodeProjectDocument(document), loaded = decodeProjectDocument(text);
  assert.equal(loaded.project.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(loaded.project, JSON.parse(JSON.stringify(next)), 'JSON round-trip preserves all serializable values');
  const corrupted = JSON.parse(text);
  corrupted.project.city.properties[0].customUse = { invalid: true };
  assert.throws(() => decodeProjectDocument(JSON.stringify(corrupted)), /Descriptive use/);
  assert.equal(JSON.stringify(document), JSON.stringify(JSON.parse(text)));
  for (const bad of [null, '', ' ', 'x'.repeat(81), 4]) assert.throws(() => validateIdentity({ customName: bad }));
});

test('F3 classifies a legacy building through identity, preserving exact accepted data and schema 9', () => {
  const project = createProject({ seed: 'building-use-storage', size: 'small', morphology: 'organic' });
  const building = project.city.buildings[0];
  building.type = 'bakehouse';
  building.customName = '  Hearth   House  ';
  building.customUse = '  Community oven  ';
  building.customDescription = 'A long-standing ward landmark.';
  const ref = { kind: 'building', id: building.id };
  const editor = new IdentityEditor();
  const before = JSON.stringify(project);
  assert.equal(editor.apply(project.city, ref, {
    buildingType: '', customName: 'Hearth House', customUse: 'Community oven'
  }), project.city);
  assert.throws(() => editor.apply(project.city, ref, { buildingType: 'arbitrary' }), /supported building use/);
  assert.throws(() => editor.apply(project.city, ref, {
    buildingType: 'inn', previousBuildingType: 'temple'
  }), /changed since this draft/);
  assert.throws(() => editor.apply(project.city, {
    kind: 'property', id: building.propertyId
  }, { buildingType: 'inn' }), /supported building use/);
  const city = editor.apply(project.city, ref, { buildingType: 'inn', previousBuildingType: 'bakehouse' });
  assert.equal(city.buildings[0].type, 'inn');
  assert.deepEqual(city.buildings[0], { ...building, type: 'inn' });
  assert.equal(city.buildings[1], project.city.buildings[1]);
  assert.equal(city.properties, project.city.properties);
  assert.equal(city.roads, project.city.roads);
  assert.equal(JSON.stringify(project), before);
  const accepted = { ...project, city };
  const saved = decodeProjectDocument(encodeProjectDocument(createProjectDocument(accepted)));
  assert.equal(saved.project.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(JSON.stringify(saved.project), JSON.stringify(accepted));
  assert.deepEqual(editor.undo(city), project.city);
});
