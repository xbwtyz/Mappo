import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createProject } from '../src/core/city-model.js';
import { generateMountain } from '../src/generators/terrain.js';
import { terrainPrepare } from '../src/core/terrain-geometry.js';
import { buildRoadGraph, proposeJunctionMove } from '../src/core/road-graph.js';
import { extractRoadFaces, matchExistingFaces } from '../src/core/road-faces.js';
import { roadFaceOverlapArea } from '../src/core/road-face-geometry.js';
import {
  createProjectDocument,
  defaultWorkspace,
  encodeProjectDocument,
} from '../src/data/project-format.js';

const fixtures = JSON.parse(
  await readFile(new URL('./fixtures/road-generation-parity-0.1.json', import.meta.url), 'utf8'),
);
const fromFixture = (f) =>
  createProject(
    f.shape ? { ...f.options, boundary: fixtures.boundaries[`${f.shape}/${f.options.size}`] } : f.options,
  );
const clone = (v) => JSON.parse(JSON.stringify(v));
function freeze(v) {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const extract = (city, context = city) => extractRoadFaces(buildRoadGraph(city), context);
const codes = (r) => r.issues.map((i) => i.code);
function stripCity() {
  const nodes = [
    ['A', 0, 0],
    ['B', 10, 0],
    ['C', 20, 0],
    ['D', 30, 0],
    ['E', 0, 10],
    ['F', 10, 10],
    ['G', 20, 10],
    ['H', 30, 10],
  ].map(([id, x, y]) => ({ id, x, y }));
  const perimeter = [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'H'],
    ['H', 'G'],
    ['G', 'F'],
    ['F', 'E'],
    ['E', 'A'],
  ];
  const roads = perimeter.map(([a, b], i) => ({ id: `EDGE-${i}`, a, b, kind: 'secondary', boundary: true }));
  roads.push(
    { id: 'PLAZA-EDGE', a: 'B', b: 'F', kind: 'primary', plaza: true },
    { id: 'DIVIDER', a: 'C', b: 'G', kind: 'lane' },
  );
  return {
    nodes,
    roads,
    survey: {
      boundary: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 0, y: 10 },
      ],
    },
    plaza: { id: 'PLAZA', name: 'Square', center: { x: 5, y: 5 }, vertices: ['A', 'B', 'F', 'E'], area: 100 },
    blocks: [
      {
        id: 'BLOCK-1',
        vertices: ['B', 'C', 'G', 'F'],
        area: 100,
        ring: 7,
        sector: 42,
        usage: 'market',
        extensions: { future: { name: 'kept' } },
      },
      { id: 'BLOCK-2', vertices: ['C', 'D', 'H', 'G'], area: 100, ring: 4, sector: 11, usage: 'housing' },
    ],
    waterFaces: [],
    terrainFaces: [],
    waterFeatures: [],
    terrainFeatures: [],
    bridges: [],
    terrainPasses: [],
  };
}

test('98 seeded networks extract positive canonical faces and preserve every accepted face record', () => {
  for (const fixture of fixtures.fixtures) {
    const city = freeze(fromFixture(fixture).city),
      before = JSON.stringify(city),
      topology = extract(city);
    assert.equal(topology.valid, true, JSON.stringify(topology.issues));
    assert.equal(
      topology.faces.length,
      city.blocks.length + 1 + city.waterFaces.length + city.terrainFaces.length,
    );
    assert.ok(topology.coverage.error <= 0.02);
    assert.ok(topology.faces.every((f) => f.orientation === 'ccw' && f.area > 0));
    const match = matchExistingFaces(city, topology);
    assert.equal(match.valid, true, JSON.stringify(match.issues));
    assert.equal(match.requiresReview, false, JSON.stringify(match.issues));
    assert.equal(match.preserved.length, topology.faces.length);
    assert.equal(match.changed.length, 0);
    const originals = new Map(
      [...city.blocks, city.plaza, ...city.waterFaces, ...city.terrainFaces].map((f) => [f.id, f]),
    );
    for (const f of match.preserved) assert.deepEqual(f.record, originals.get(f.id));
    assert.equal(JSON.stringify(city), before);
  }
});

test('canonical extraction and identity are invariant to record order, endpoint direction and cyclic vertex starts', () => {
  const city = stripCity(),
    original = extract(city);
  const reordered = clone(city);
  reordered.nodes.reverse();
  reordered.roads.reverse();
  reordered.roads.forEach((r) => {
    [r.a, r.b] = [r.b, r.a];
  });
  reordered.blocks.reverse();
  reordered.blocks.forEach((f) => f.vertices.push(f.vertices.shift()));
  const next = extract(reordered);
  assert.deepEqual(next.faces, original.faces);
  assert.deepEqual(next.coverage, original.coverage);
  const first = matchExistingFaces(city, original),
    second = matchExistingFaces(city, next);
  assert.deepEqual(second, first);
  const rotated = matchExistingFaces(reordered, next);
  assert.deepEqual(
    rotated.preserved.map((f) => f.id),
    first.preserved.map((f) => f.id),
  );
});

test('directed edges occur once on bounded faces or the exterior, without gaps or overlapping assignments', () => {
  const result = extract(stripCity()),
    seen = new Set();
  for (const f of [...result.faces, result.exterior])
    for (let i = 0; i < f.vertices.length; i++) {
      const key = JSON.stringify([f.vertices[i], f.vertices[(i + 1) % f.vertices.length]]);
      assert.ok(!seen.has(key));
      seen.add(key);
    }
  assert.equal(seen.size, result.graph.roadsById.size * 2);
  assert.equal(result.coverage.faceArea, 300);
});

test('ordinary junction movement retains IDs, order and arbitrary metadata on unambiguous faces', () => {
  const city = createProject({ seed: 'a2-move', morphology: 'organic' }).city;
  city.blocks.forEach((b) => (b.extensions = { custom: { label: b.id } }));
  const before = JSON.stringify(city),
    graph = buildRoadGraph(city);
  const id = [...graph.nodesById.keys()].find((id) =>
    graph.incidentRoads.get(id).every((r) => !graph.roadClasses.get(r).protected),
  );
  const p = graph.nodesById.get(id),
    proposal = proposeJunctionMove(freeze(city), id, { x: p.x + 0.01, y: p.y + 0.01 });
  assert.ok(proposal.graphValid);
  const topology = extractRoadFaces(proposal.graph, city);
  assert.equal(topology.valid, true, JSON.stringify(topology.issues));
  const result = matchExistingFaces(city, topology);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.equal(result.requiresReview, false);
  assert.ok(result.changed.length >= 2);
  const old = new Map(city.blocks.map((b) => [b.id, b]));
  for (const item of result.changed) {
    const source = old.get(item.id);
    assert.equal(item.record.id, source.id);
    assert.deepEqual(item.record.vertices, source.vertices);
    assert.deepEqual(item.record.extensions, source.extensions);
    assert.equal(item.record.districtId, source.districtId);
    assert.ok(item.overlapArea > 0);
  }
  assert.equal(result.preserved.length + result.changed.length, city.blocks.length + 1);
  assert.equal(result.canApplyIn02A, false);
  assert.equal(JSON.stringify(city), before);
});

test('face split is a diagnostic and children receive no accepted IDs', () => {
  const city = stripCity(),
    candidate = clone(city);
  candidate.roads.push({ id: 'DIAGONAL', a: 'B', b: 'G', kind: 'lane' });
  const topology = extract(candidate, city);
  assert.equal(topology.valid, true, JSON.stringify(topology.issues));
  const match = matchExistingFaces(freeze(city), topology);
  assert.equal(match.valid, true, JSON.stringify(match.issues));
  assert.equal(match.requiresReview, true);
  assert.equal(match.split.length, 1);
  assert.deepEqual(match.split[0].oldIds, ['BLOCK-1']);
  assert.equal(match.split[0].candidateKeys.length, 2);
  assert.equal(match.split[0].overlapArea, 100);
  assert.ok(![...match.preserved, ...match.changed].some((f) => f.id === 'BLOCK-1'));
  assert.ok(match.split[0].id === undefined);
  assert.ok(codes(match).includes('face-split'));
});

test('face merge reports both original IDs and never chooses an array-order winner', () => {
  const city = stripCity(),
    candidate = clone(city);
  candidate.roads = candidate.roads.filter((r) => r.id !== 'DIVIDER');
  const topology = extract(candidate, city);
  assert.equal(topology.valid, true, JSON.stringify(topology.issues));
  const match = matchExistingFaces(city, topology);
  assert.equal(match.valid, true, JSON.stringify(match.issues));
  assert.equal(match.merged.length, 1);
  assert.deepEqual(match.merged[0].oldIds, ['BLOCK-1', 'BLOCK-2']);
  assert.equal(match.merged[0].overlapArea, 200);
  assert.equal(match.preserved.length, 1);
  assert.equal(match.changed.length, 0);
  city.blocks.reverse();
  assert.deepEqual(matchExistingFaces(city, topology), match);
});

test('many-to-many overlap remains explicitly ambiguous', () => {
  const city = stripCity(),
    candidate = clone(city);
  candidate.roads = candidate.roads.filter((r) => r.id !== 'DIVIDER');
  candidate.roads.push({ id: 'SLANT', a: 'B', b: 'H', kind: 'lane' });
  const topology = extract(candidate, city);
  assert.equal(topology.valid, true, JSON.stringify(topology.issues));
  const match = matchExistingFaces(city, topology);
  assert.equal(match.ambiguous.length, 1);
  assert.deepEqual(match.ambiguous[0].oldIds, ['BLOCK-1', 'BLOCK-2']);
  assert.equal(match.ambiguous[0].candidateKeys.length, 2);
  assert.equal(match.changed.length, 0);
  assert.equal(match.requiresReview, true);
});

test('renumbered or swapped road IDs do not establish face identity by geometry alone', () => {
  const city = stripCity(),
    candidate = clone(city);
  candidate.roads.find((r) => r.id === 'DIVIDER').id = 'NEW-DIVIDER';
  const match = matchExistingFaces(city, extract(candidate, city));
  assert.ok(match.ambiguous.length);
  assert.equal(match.preserved.length, 1);
  assert.ok(match.requiresReview);
  const swap = clone(city),
    a = swap.roads.find((r) => r.id === 'EDGE-1'),
    b = swap.roads.find((r) => r.id === 'DIVIDER');
  [a.id, b.id] = [b.id, a.id];
  const result = matchExistingFaces(city, extract(swap, city));
  assert.ok(result.requiresReview);
  assert.ok(codes(result).includes('protected-edge-change'));
});

test('concave overlap is measured from triangles rather than bounding boxes or convex assumptions', () => {
  const a = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 4 },
    { x: 0, y: 4 },
  ];
  const b = [
    { x: 0.5, y: 0.5 },
    { x: 2, y: 0.5 },
    { x: 2, y: 2 },
    { x: 0.5, y: 2 },
  ];
  assert.ok(Math.abs(roadFaceOverlapArea(a, b, () => {}) - 1.25) < 1e-8);
  const touching = b.map((p) => ({ x: p.x + 3.5, y: p.y }));
  assert.equal(
    roadFaceOverlapArea(a, touching, () => {}),
    0,
  );
  assert.throws(
    () =>
      roadFaceOverlapArea(a, b, () => {
        throw new Error('budget');
      }),
    /budget/,
  );
});

test('missing exterior flags, detached boundaries, escaped streets and invalid base graphs fail closed', () => {
  const city = stripCity(),
    missing = clone(city);
  missing.roads[0].boundary = false;
  assert.ok(codes(extract(missing, city)).includes('boundary-ring'));
  const escaped = clone(city);
  escaped.nodes.find((n) => n.id === 'C').y = -2;
  assert.equal(extract(escaped, city).valid, false);
  const disconnected = clone(city);
  disconnected.nodes.push({ id: 'ORPHAN', x: 5, y: 5 });
  assert.ok(codes(extract(disconnected, city)).includes('invalid-road-graph'));
  assert.ok(codes(extractRoadFaces(buildRoadGraph(city), {})).includes('protected-context'));
  assert.equal(matchExistingFaces(city, extract(disconnected, city)).valid, false);
});

test('a center on a dividing edge, duplicate accepted faces and ownership drift are diagnosed', () => {
  const city = stripCity(),
    badCenter = clone(city);
  badCenter.plaza.center = { x: 10, y: 5 };
  assert.ok(codes(extract(city, badCenter)).includes('plaza-face'));
  const duplicate = clone(city);
  duplicate.blocks[1].id = 'BLOCK-1';
  assert.ok(codes(matchExistingFaces(duplicate, extract(city))).includes('face-matching'));
  const wrong = clone(city);
  wrong.blocks[0].vertices = ['A', 'B', 'F', 'E'];
  assert.equal(matchExistingFaces(wrong, extract(city)).valid, false);
  const wet = fromFixture(fixtures.fixtures.at(-2)).city,
    corrupt = clone(wet);
  corrupt.waterFaces[0].waterIds = ['missing'];
  delete corrupt.waterFaces[0].waterId;
  assert.ok(codes(matchExistingFaces(corrupt, extract(wet))).includes('protected-face-owner'));
});

test('protected edge metadata changes are blocked, including promoting ordinary edges', () => {
  const city = stripCity(),
    candidate = clone(city);
  candidate.roads.find((r) => r.id === 'DIVIDER').plaza = true;
  const result = matchExistingFaces(city, extract(candidate, city));
  assert.ok(codes(result).includes('protected-edge-change'));
  assert.equal(result.valid, false);
  const changed = clone(city);
  changed.roads.find((r) => r.plaza).kind = 'secondary';
  assert.ok(codes(matchExistingFaces(city, extract(changed, city))).includes('protected-edge-change'));
});

test('district and fortification references are rechecked without rewriting accepted memberships', () => {
  const city = fromFixture(fixtures.fixtures.at(-2)).city,
    topology = extract(city);
  const district = clone(city);
  district.districts[0].blockIds[0] = 'missing';
  const report = matchExistingFaces(freeze(district), topology);
  assert.ok(codes(report).includes('district-reference'));
  assert.ok(report.requiresReview);
  const gate = clone(city);
  gate.gates[0].connection.cityNodeId = 'missing';
  assert.ok(codes(matchExistingFaces(freeze(gate), topology)).includes('defense-reference'));
  const owner = clone(city);
  owner.blocks[0].districtId = 'missing';
  assert.ok(codes(matchExistingFaces(owner, topology)).includes('district-reference'));
});

test('analysis records are immutable, detached, and absent from project/save bytes', () => {
  const project = fromFixture(fixtures.fixtures[0]),
    document = createProjectDocument(project, defaultWorkspace(project)),
    before = encodeProjectDocument(document);
  const topology = extract(freeze(project.city)),
    match = matchExistingFaces(project.city, topology);
  assert.throws(() => {
    topology.faces[0].polygon[0].x = 999;
  }, TypeError);
  assert.throws(() => {
    match.preserved[0].record.vertices.push('fake');
  }, TypeError);
  assert.notEqual(match.preserved[0].record, project.city.blocks[0]);
  assert.equal(encodeProjectDocument(document), before);
  assert.equal(project.schemaVersion, PROJECT_SCHEMA_VERSION);
});

test('compiled face extraction and identity matching agree with modules', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  let script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  script =
    script.slice(0, script.indexOf('// src/app.js')) +
    'globalThis.a2={buildRoadGraph,extractRoadFaces,matchExistingFaces};\n})();';
  const context = vm.createContext({});
  vm.runInContext(script, context);
  const api = context.a2,
    city = stripCity();
  const compiled = api.extractRoadFaces(api.buildRoadGraph(city), city),
    modular = extract(city);
  assert.deepEqual(clone(compiled.faces), clone(modular.faces));
  assert.deepEqual(clone(api.matchExistingFaces(city, compiled)), clone(matchExistingFaces(city, modular)));
});

test('mountain passes and exterior terrain faces retain protected ownership', () => {
  const base = createProject({
    seed: 'mountains',
    morphology: 'organic',
    boundary: [
      { x: -300, y: -300 },
      { x: 300, y: -300 },
      { x: 300, y: 300 },
      { x: -300, y: 300 },
    ],
    center: { x: 0, y: 0 },
  });
  for (const placement of ['crossing', 'surrounding']) {
    const terrain =
      placement === 'crossing'
        ? terrainPrepare({
            features: [
              {
                id: 'MTN-DIVIDER',
                dataVersion: 1,
                kind: 'mountain',
                name: 'Long Ridge',
                center: { x: 130, y: 0 },
                path: Array.from({ length: 12 }, (_, i) => ({
                  x: 130 + 70 * Math.cos((i * Math.PI) / 6),
                  y: 430 * Math.sin((i * Math.PI) / 6),
                })),
                ridge: [
                  { x: 130, y: -230, height: 600 },
                  { x: 130, y: 0, height: 900 },
                  { x: 130, y: 230, height: 700 },
                ],
                generation: { seed: 'divider', algorithm: 'mountain-v1', placement: 'crossing', size: 150 },
                extensions: {},
              },
            ],
            passes: [
              {
                id: 'PASS-001',
                dataVersion: 1,
                kind: 'pass',
                terrainId: 'MTN-DIVIDER',
                t: 0.5,
                width: 12,
                extensions: {},
              },
            ],
          })
        : generateMountain(base.options.boundary, base.options.center, {
            seed: 'mountains',
            placement,
            size: 70,
          });
    const city = createProject({
      ...base.options,
      seed: base.seed,
      terrain,
      fortifications: { enabled: true },
    }).city;
    if (placement === 'crossing') assert.ok(city.roads.some((r) => r.passId));
    const topology = extract(freeze(city));
    assert.equal(topology.valid, true, JSON.stringify(topology.issues));
    const result = matchExistingFaces(city, topology);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
    assert.equal(result.requiresReview, false);
    const terrainIds = new Set(city.terrainFaces.map((f) => f.id));
    assert.equal(result.preserved.filter((f) => terrainIds.has(f.id)).length, city.terrainFaces.length);
  }
});

test('a connecting cut-edge cannot publish a pinched face even if graph connectivity passes', () => {
  const city = stripCity();
  const network = {
    nodes: [
      ['A', 0, 0],
      ['B', 4, 0],
      ['C', 4, 4],
      ['D', 0, 4],
      ['E', 8, 0],
      ['F', 12, 0],
      ['G', 12, 4],
      ['H', 8, 4],
    ].map(([id, x, y]) => ({ id, x, y })),
    roads: [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'A'],
      ['B', 'E'],
      ['E', 'F'],
      ['F', 'G'],
      ['G', 'H'],
      ['H', 'E'],
    ].map(([a, b], i) => ({ id: `R-${i}`, a, b, kind: 'lane' })),
  };
  const graph = buildRoadGraph(network);
  assert.equal(graph.valid, true);
  const result = extractRoadFaces(graph, city);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('face-traversal'));
});
