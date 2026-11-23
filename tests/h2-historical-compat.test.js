import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject } from '../src/core/city-model.js';
import { projectSimpleBuildingS10 } from '../src/core/building-geometry-adapter-s10.js';
import {
  createProjectDocument, decodeProjectDocument, encodeProjectDocument
} from '../src/data/project-format.js';

const snapshots = [
  ['3A.2 schema 1', 'legacy-3a2-schema1.json', 1],
  ['3B schema 1', 'legacy-3b-schema1.json', 1],
  ['3B.1 schema 2', 'save-3b1-format1-schema2.json', 2],
  ['3C schema 3', 'save-3c-format1-schema3.json', 3],
  ['3D schema 4', 'save-3d-format1-schema4.json', 4],
  ['3E schema 5', 'save-3e-format1-schema5.json', 5],
  ['3E.1 schema 6', 'save-3e1-format1-schema6.json', 6],
  ['3E.4 schema 7', 'save-3e4-format1-schema7.json', 7],
  ['3E.5 schema 8', 'save-3e5-format1-schema8.json', 8],
];
const savedRecords = [
  'nodes', 'roads', 'blocks', 'plaza', 'plots', 'properties',
  'buildings', 'openSpaces', 'districts', 'walls', 'gates',
  'towers', 'waterFeatures', 'bridges', 'waterFaces',
  'terrainFeatures', 'terrainFaces'
];

for (const [label, name, schema] of snapshots) {
  test('H2 archived '+label+' preserves accepted geometry, identity and portable round-trip', async () => {
    const bytes = await readFile(new URL('./fixtures/'+name, import.meta.url), 'utf8');
    const source = JSON.parse(bytes);
    const project = source.format === 'mappo-project' ? source.project : source;
    const original = JSON.stringify(source);
    assert.equal(project.schemaVersion, schema, 'fixture must describe the expected historical schema');
    const decoded = decodeProjectDocument(bytes);
    assert.equal(decoded.project.schemaVersion, 10);
    assert.equal(decoded.formatVersion, 1);
    assert.equal(JSON.stringify(source), original, 'reader must not mutate the fixture source');
    assert.equal(decoded.project.city.name, project.city.name);
    for (const field of savedRecords) {
      if (field==='buildings') continue; // The S10 migration transforms only building geometry storage.
      if (Object.hasOwn(project.city, field)) {
        assert.deepEqual(decoded.project.city[field], project.city[field],
          label+': historical '+field+' record(s) must not be regenerated or changed');
      }
    }
    const legacyBuildings=project.city.buildings ?? [];
    assert.equal(decoded.project.city.buildings.length,legacyBuildings.length);
    for (let i=0;i<legacyBuildings.length;i++) {
      const before=legacyBuildings[i],after=decoded.project.city.buildings[i];
      const projected=projectSimpleBuildingS10(after.geometry,after.components);
      assert.equal(projected.ok,true,label+': every migrated building must retain a simple projection');
      assert.deepEqual(projected.footprint,before.footprint,label+': building geometry must remain exact');
      assert.deepEqual(projected.holes,before.holes,label+': courtyards must remain exact');
      const legacyMetadata={...before},newMetadata=JSON.parse(JSON.stringify(after));
      delete legacyMetadata.footprint;delete legacyMetadata.holes;
      delete newMetadata.geometry;delete newMetadata.components;
      assert.deepEqual(newMetadata,legacyMetadata,label+': identity and authored metadata must remain intact');
    }
    for (const key of ['seed', 'generatorVersion']) {
      if (Object.hasOwn(project, key))
        assert.deepEqual(decoded.project[key], project[key], label+': '+key+' must survive migration');
    }
    const reopened = decodeProjectDocument(encodeProjectDocument(decoded));
    assert.deepEqual(reopened, decoded, 'format 1/save schema 10 must round-trip without drift');
    const next = createProjectDocument(decoded.project, decoded.workspace, decoded, '2026-11-21T00:00:00.000Z');
    assert.deepEqual(next.project, decoded.project);
    assert.equal(next.documentId, decoded.documentId);
    assert.equal(next.createdAt, decoded.createdAt);
    assert.deepEqual(next.extensions, decoded.extensions);
    assert.deepEqual(decodeProjectDocument(encodeProjectDocument(next)), next);
  });
}

test('H2 current schema 10 saves keep IDs, independent drafts and unknown fields', () => {
  const project = createProject({seed:'h2-current',size:'small',morphology:'planned'});
  const doc = createProjectDocument(project);
  doc.extensions.futureFeature = { id:'test-preserve', enabled:true };
  doc.project.city.buildings[0].customName = 'Authored H2 building';
  doc.workspace.futureInspector = { customPanel:'continue editing' };
  const restored = decodeProjectDocument(encodeProjectDocument(doc));
  assert.deepEqual(restored, doc);
  assert.deepEqual(restored.project.city.roads.map(r => r.id), project.city.roads.map(r=>r.id));
});

test('H2 malformed and future native save formats are rejected without mutating the accepted project', () => {
  const project = createProject({seed:'h2-reject',size:'small',morphology:'organic'});
  const accepted = JSON.stringify(project);
  const current = createProjectDocument(project);
  const attempts = [
    d => { d.formatVersion = 2; },
    d => { d.project.schemaVersion = 11; },
    d => { d.workspace.schemaVersion = 2; },
    d => { d.project.city.roads[0].a = 'missing-node'; },
  ];
  for (const mutate of attempts) {
    const candidate = JSON.parse(JSON.stringify(current));
    mutate(candidate);
    assert.throws(() => decodeProjectDocument(JSON.stringify(candidate)));
    assert.equal(JSON.stringify(project), accepted);
  }
  assert.throws(() => decodeProjectDocument('{ "format": "mappo-project",'), /incomplete|JSON/);
  assert.equal(JSON.stringify(project), accepted);
});
