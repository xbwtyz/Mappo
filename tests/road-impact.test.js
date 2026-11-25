import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph, proposeJunctionMove } from '../src/core/road-graph.js';
import { extractRoadFaces, matchExistingFaces } from '../src/core/road-faces.js';
import { waterFaceInterior } from '../src/core/water-geometry.js';
import { analyzeRoadImpact, inspectJunctionImpact } from '../src/core/road-impact.js';
import {
  inspectRoadDependencies,
  inspectRoadContextReferences,
} from '../src/core/road-impact-dependencies.js';
import { riReporter, riBudget } from '../src/core/road-impact-model.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import {
  createProjectDocument,
  defaultWorkspace,
  encodeProjectDocument,
} from '../src/data/project-format.js';
import { terrainPrepare } from '../src/core/terrain-geometry.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
function freeze(v) {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
const parity = JSON.parse(
  await readFile(new URL('./fixtures/road-generation-parity-0.1.json', import.meta.url), 'utf8'),
);
const fromFixture = (f) =>
  createProject(
    f.shape ? { ...f.options, boundary: parity.boundaries[`${f.shape}/${f.options.size}`] } : f.options,
  );
const base = createProject({ seed: 'a3-test', morphology: 'organic' }),
  graph = buildRoadGraph(base.city);
const ordinary = [...graph.nodesById.keys()].find((id) =>
  graph.incidentRoads.get(id).every((r) => !graph.roadClasses.get(r).protected),
);
const point = graph.nodesById.get(ordinary);
const move = (project = base, delta = 0.01) =>
  inspectJunctionImpact(project, ordinary, { x: point.x + delta, y: point.y + delta });
const has = (r, code, kind = null, id = null) =>
  r.affected.some((i) => i.code === code && (!kind || i.kind === kind) && (!id || i.id === id));
const proposal = (city) => ({ operation: 'inspect-network', graph: buildRoadGraph(city) });
function blankProject() {
  const project = clone(base);
  project.city.properties = [];
  project.city.plots = [];
  project.city.buildings = [];
  project.city.openSpaces = project.city.blocks.map((b) => ({
    id: `OPEN-${b.id}`,
    blockId: b.id,
    kind: 'undeveloped',
    area: b.area,
  }));
  validateStoredProject(project);
  return project;
}

test('98 unchanged accepted cities are Safe only after full candidate validation', () => {
  for (const f of parity.fixtures) {
    const project = fromFixture(f),
      before = JSON.stringify(project),
      g = buildRoadGraph(project.city),
      id = g.nodesById.keys().next().value,
      n = g.nodesById.get(id);
    const result = inspectJunctionImpact(freeze(project), id, n);
    assert.equal(
      result.status,
      'safe',
      JSON.stringify({ options: f.options, issues: result.issues.slice(0, 5) }),
    );
    assert.equal(result.complete, true);
    assert.equal(result.validation.candidate, 'valid');
    assert.equal(result.requiresReconciliation, false);
    assert.equal(result.canApplyIn02A, false);
    assert.deepEqual(result.roadIds, []);
    assert.equal(result.issues.length, 0);
    assert.equal(JSON.stringify(project), before);
  }
});

test('a real move with no dependent land records remains Safe with derived area metrics only', () => {
  const project = blankProject(),
    before = JSON.stringify(project),
    result = move(freeze(project));
  assert.equal(result.status, 'safe', JSON.stringify(result.issues));
  assert.equal(result.complete, true);
  assert.equal(result.validation.candidate, 'valid');
  assert.ok(result.metrics.faces.some((f) => f.geometryChanged));
  assert.ok(result.metrics.openSpaceAreas.length > 0);
  assert.ok(result.affected.every((i) => i.severity === 'info'));
  assert.equal(result.requiresReconciliation, false);
  assert.equal(JSON.stringify(project), before);
});

test('ordinary frontage movement reports exact property, plot, building and frame dependencies', () => {
  const result = move();
  assert.equal(result.status, 'needs-review');
  assert.equal(result.complete, true);
  assert.equal(result.requiresReconciliation, true);
  const changed = new Set(result.roadIds),
    properties = base.city.properties.filter((p) => changed.has(p.frontageRoadId)),
    plots = base.city.plots.filter((p) => changed.has(p.frontageRoadId)),
    buildings = base.city.buildings.filter((b) => changed.has(b.frontageRoadId));
  assert.ok(properties.length && plots.length && buildings.length);
  for (const [kind, records] of [
    ['property', properties],
    ['plot', plots],
    ['building', buildings],
  ])
    for (const r of records) assert.ok(has(result, 'frontage-geometry', kind, r.id), r.id);
  assert.ok(has(result, 'frame-reference', 'property'));
  assert.ok(has(result, 'access-connection', 'building'));
  for (const issue of result.affected.filter((i) => i.code === 'frontage-geometry'))
    assert.ok(issue.metrics.oldLength > 0 && issue.metrics.newLength > 0);
  const unrelated = base.city.properties.find((p) => !result.affected.some((i) => i.id === p.id));
  assert.ok(result.preservedIds.includes(unrelated.id));
  assert.ok(!result.preservedIds.includes(properties[0].id));
});

test('setback and building corridor conflicts provide measured distances and road IDs', () => {
  const result = move(base, 10);
  assert.equal(result.status, 'needs-review');
  const setbacks = result.issues.filter((i) => i.code === 'road-setback');
  assert.ok(setbacks.length);
  for (const i of setbacks) {
    assert.equal(i.kind, 'property');
    assert.ok(i.metrics.newDistance < i.metrics.requiredDistance);
    assert.ok(i.relatedIds.some((id) => result.roadIds.includes(id)));
  }
  assert.ok(has(result, 'road-clearance', 'building'));
});

test('a well-formed graph with existing parcels outside new blocks cannot be Safe', () => {
  const result = move(base, 15);
  assert.notEqual(result.status, 'safe');
  assert.ok(
    has(result, 'block-containment', 'property') ||
      has(result, 'road-setback', 'property') ||
      result.status === 'invalid',
  );
});

test('crossing and disconnected candidates are Invalid with exact graph IDs', () => {
  const crossing = move(base, 100);
  assert.equal(crossing.status, 'invalid');
  assert.ok(has(crossing, 'unnormalized-crossing', 'road'));
  assert.equal(crossing.complete, false);
  assert.ok(
    crossing.issues.filter((i) => i.code === 'unnormalized-crossing').some((i) => i.relatedIds.length > 0),
  );
  const city = clone(base.city);
  city.nodes.push({ id: 'N-ORPHAN', x: 0, y: 0 });
  const disconnected = analyzeRoadImpact(base, proposal(city));
  assert.equal(disconnected.status, 'invalid');
  assert.ok(has(disconnected, 'orphan-junction', 'junction', 'N-ORPHAN'));
  assert.ok(has(disconnected, 'disconnected-graph'));
});

test('invalid coordinates, absent junctions and boundary escape never mutate accepted state', () => {
  const before = JSON.stringify(base);
  for (const p of [{ x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: 99999, y: 99999 }, null]) {
    const r = inspectJunctionImpact(freeze(base), ordinary, p);
    assert.equal(r.status, 'invalid');
    assert.equal(r.canApplyIn02A, false);
    assert.doesNotThrow(() => JSON.stringify(r));
  }
  assert.equal(inspectJunctionImpact(base, 'missing', { x: 0, y: 0 }).status, 'invalid');
  assert.equal(JSON.stringify(base), before);
});

test('protected plaza and perimeter moves identify accepted feature/dependency IDs', () => {
  const plazaRoad = base.city.roads.find((r) => r.plaza),
    n = graph.nodesById.get(plazaRoad.a);
  const plaza = inspectJunctionImpact(base, n.id, { x: n.x + 1, y: n.y + 1 });
  assert.equal(plaza.status, 'invalid');
  assert.ok(has(plaza, 'protected-edge', 'plaza', base.city.plaza.id));
  const fortified = fromFixture(parity.fixtures.at(-2)),
    gate = fortified.city.gates[0],
    node = fortified.city.nodes.find((n) => n.id === gate.connection.cityNodeId);
  const perimeter = inspectJunctionImpact(fortified, node.id, { x: node.x + 0.1, y: node.y + 0.1 });
  assert.equal(perimeter.status, 'invalid');
  assert.ok(has(perimeter, 'gate-connection', 'defense', gate.id));
});

test('bridge, bank and owning water IDs are explicit in protected reports', () => {
  const project = fromFixture(parity.fixtures.at(-2)),
    city = project.city,
    g = buildRoadGraph(city);
  for (const road of [city.roads.find((r) => r.bridgeId), city.roads.find((r) => r.bank)]) {
    assert.ok(road);
    const n = g.nodesById.get(road.a),
      r = inspectJunctionImpact(project, n.id, { x: n.x + 0.1, y: n.y + 0.1 });
    assert.equal(r.status, 'invalid');
    assert.ok(r.affected.some((i) => i.kind === 'water'));
    if (road.bridgeId) {
      const bridge = city.bridges.find((b) => b.id === road.bridgeId);
      assert.ok(has(r, 'protected-edge', 'water', bridge.id));
      assert.ok(has(r, 'bridge-connection', 'water', bridge.waterId));
    }
  }
});

function mountainProject() {
  const p = createProject({
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
  const terrain = terrainPrepare({
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
  });
  return createProject({ ...p.options, seed: p.seed, terrain, fortifications: { enabled: true } });
}
test('mountain pass and foothill reports preserve explicit pass/range ownership', () => {
  const project = mountainProject(),
    city = project.city,
    g = buildRoadGraph(city);
  for (const road of [city.roads.find((r) => r.passId), city.roads.find((r) => r.foothill)]) {
    const n = g.nodesById.get(road.a),
      r = inspectJunctionImpact(project, n.id, { x: n.x + 0.1, y: n.y + 0.1 });
    assert.equal(r.status, 'invalid');
    assert.ok(r.affected.some((i) => i.kind === 'terrain'));
    if (road.passId) {
      assert.ok(has(r, 'protected-edge', 'terrain', 'PASS-001'));
      assert.ok(has(r, 'pass-connection', 'terrain', 'MTN-DIVIDER'));
    }
  }
});

test('unrecognized extensions and dependency fields are reviewed instead of assumed harmless', () => {
  const project = blankProject();
  project.city.blocks[0].extensions = { future: { roadId: 'RD-future' } };
  const result = move(project);
  assert.equal(result.status, 'needs-review');
  assert.ok(has(result, 'unrecognized-dependency', 'block', project.city.blocks[0].id));
  const cityExtra = blankProject();
  cityExtra.city.futureAccessRules = { version: 1 };
  assert.ok(has(move(cityExtra), 'unrecognized-dependency', 'city', cityExtra.city.id));
  const nested = blankProject();
  nested.city.survey.futureDependencies = ['road'];
  assert.ok(has(move(nested), 'unrecognized-dependency', 'city'));
  for (const value of [false, null, '', []]) {
    const constrained = blankProject();
    constrained.city.blocks[0].allowRoadEditing = value;
    assert.ok(
      has(move(constrained), 'unrecognized-dependency', 'block', constrained.city.blocks[0].id),
      'Unknown negative/empty constraint values must not be assumed inactive.',
    );
  }
  const noop = inspectJunctionImpact(project, ordinary, point);
  assert.equal(noop.status, 'safe', 'no geometry change does not reinterpret opaque stored metadata');
});

test('known custom names and uses stay intact without being treated as unknown dependencies', () => {
  const project = clone(base);
  project.city.properties[0].customName = 'Archive House';
  project.city.properties[0].customUse = 'Library';
  const n = project.city.nodes.find((n) => n.id === ordinary),
    before = JSON.stringify(project);
  assert.equal(inspectJunctionImpact(project, n.id, n).status, 'safe');
  assert.equal(JSON.stringify(project), before);
});

test('corrupt plot/building/block references yield exact IDs and never Safe', () => {
  const mutations = [
    [(p) => p.city.properties[0].plotIds.push('MISSING-PLOT'), 'plot-ownership', 'property'],
    [(p) => (p.city.buildings[0].plotIds = ['MISSING-PLOT']), 'plot-reference', 'building'],
    [(p) => (p.city.plots[0].propertyId = 'MISSING-PROPERTY'), 'property-reference', 'plot'],
    [(p) => (p.city.properties[0].blockId = 'MISSING-BLOCK'), 'block-topology', 'property'],
    [(p) => (p.city.properties[0].frontageRoadId = 'MISSING-ROAD'), 'frontage-missing', 'property'],
  ];
  for (const [mutate, code, kind] of mutations) {
    const p = clone(base);
    mutate(p);
    const r = move(p);
    assert.equal(r.status, 'invalid');
    assert.ok(has(r, code, kind), JSON.stringify(r.issues.slice(0, 4)));
  }
});

test('district, gate, wall and tower references produce object-specific diagnostics', () => {
  const p = fromFixture(parity.fixtures.at(-2));
  p.city.gates[0].connection.cityNodeId = 'missing';
  const g = buildRoadGraph(p.city),
    id = [...g.nodesById.keys()].find((id) =>
      g.incidentRoads.get(id).every((r) => !g.roadClasses.get(r).protected),
    ),
    n = g.nodesById.get(id);
  const gate = inspectJunctionImpact(p, id, n);
  assert.equal(gate.status, 'invalid');
  assert.ok(has(gate, 'gate-connection', 'defense', p.city.gates[0].id));
  const q = fromFixture(parity.fixtures.at(-2));
  q.city.towers[0].wallId = 'missing';
  const tower = inspectJunctionImpact(q, id, n);
  assert.ok(has(tower, 'wall-reference', 'defense', q.city.towers[0].id));
  const district = clone(base);
  district.city.districts[0].blockIds[0] = 'missing';
  assert.ok(has(move(district), 'block-membership', 'district', district.city.districts[0].id));
});

test('reordered records, keys and undirected endpoints retain deterministic reports', () => {
  const p = blankProject(),
    r = move(p),
    reordered = clone(p);
  for (const key of ['nodes', 'roads', 'blocks', 'openSpaces', 'districts']) reordered.city[key].reverse();
  reordered.city.roads.forEach((road) => {
    [road.a, road.b] = [road.b, road.a];
  });
  assert.deepEqual(move(reordered), r);
  const candidate = clone(p.city);
  candidate.roads.reverse();
  candidate.roads.forEach((road) => {
    [road.a, road.b] = [road.b, road.a];
  });
  assert.equal(analyzeRoadImpact(p, proposal(candidate)).status, 'safe');
});

test('caller-supplied Safe flags or empty changed-ID lists cannot bypass actual analysis', () => {
  const prepared = proposeJunctionMove(base.city, ordinary, { x: point.x + 0.01, y: point.y + 0.01 });
  const forged = { ...prepared, graphValid: true, changedRoadIds: [], status: 'safe' };
  const r = analyzeRoadImpact(base, forged);
  assert.equal(r.status, 'needs-review');
  assert.ok(r.roadIds.length > 0);
  const invalid = clone(base.city);
  invalid.nodes.push({ id: 'orphan', x: 0, y: 0 });
  const g = buildRoadGraph(invalid);
  assert.equal(
    analyzeRoadImpact(base, { operation: 'inspect-network', graph: { ...g, valid: true } }).status,
    'invalid',
  );
});

test('budget exhaustion fails closed and does not return a Safe partial result', () => {
  const spend = riBudget();
  assert.throws(() => spend(6000001), /work budget/);
  const p = blankProject(),
    reporter = riReporter();
  assert.throws(
    () =>
      inspectRoadDependencies(
        p.city,
        p.city,
        { roadIds: [], junctionIds: [], changedBlockIds: [], acceptedValid: true },
        reporter.emit,
        () => {
          throw new Error('bounded');
        },
      ),
    /bounded/,
  );
});

test('reports are frozen, serializable, detached and excluded from saved/recovery document bytes', () => {
  const p = clone(base),
    document = createProjectDocument(p, defaultWorkspace(p)),
    before = encodeProjectDocument(document),
    r = move(freeze(p));
  assert.throws(() => {
    r.issues.push({});
  }, TypeError);
  assert.throws(() => {
    r.metrics.junctions[0].oldPoint.x = 123;
  }, TypeError);
  assert.doesNotThrow(() => JSON.stringify(r));
  assert.equal(r.graph, undefined);
  assert.equal(r.city, undefined);
  assert.equal(r.candidate, undefined);
  assert.equal(encodeProjectDocument(document), before);
  assert.equal(p.schemaVersion, PROJECT_SCHEMA_VERSION);
});

test('compiled impact reports agree with modular reports without exposing product globals', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  let script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  script = script.slice(0, script.indexOf('// src/app.js')) + 'globalThis.a3={inspectJunctionImpact};\n})();';
  const context = vm.createContext({});
  vm.runInContext(script, context);
  assert.deepEqual(
    clone(context.a3.inspectJunctionImpact(base, ordinary, { x: point.x + 0.01, y: point.y + 0.01 })),
    clone(move()),
  );
});

test('valid face splits propagate unresolved block identity to every accepted dependent ID', () => {
  const city = clone(base.city),
    block = city.blocks.find(
      (b) => b.vertices.length === 4 && city.properties.some((p) => p.blockId === b.id),
    );
  city.roads.push({ id: 'RD-A3-SPLIT', a: block.vertices[0], b: block.vertices[2], kind: 'lane' });
  const r = analyzeRoadImpact(freeze(base), proposal(city));
  assert.equal(r.status, 'needs-review', JSON.stringify(r.issues.slice(0, 5)));
  assert.ok(has(r, 'face-split', 'block', block.id));
  assert.ok(r.metrics.topology.split.some((group) => group.oldIds.includes(block.id)));
  for (const [key, kind] of [
    ['properties', 'property'],
    ['plots', 'plot'],
    ['buildings', 'building'],
  ])
    for (const record of base.city[key].filter((p) => p.blockId === block.id))
      assert.ok(has(r, 'block-topology', kind, record.id));
  assert.equal(r.canApplyIn02A, false);
});

test('valid face merges and ambiguous ID replacements remain Needs review', () => {
  let merged = null;
  for (const road of base.city.roads.filter((r) => !graph.roadClasses.get(r.id).protected).slice(0, 40)) {
    const city = clone(base.city);
    city.roads = city.roads.filter((r) => r.id !== road.id);
    const candidate = buildRoadGraph(city);
    if (!candidate.valid) continue;
    const extraction = extractRoadFaces(candidate, base.city);
    if (!extraction.valid) continue;
    const matching = matchExistingFaces(base.city, extraction);
    if (!matching.merged.length) continue;
    merged = analyzeRoadImpact(base, { operation: 'inspect-network', graph: candidate });
    break;
  }
  assert.ok(merged);
  assert.equal(merged.status, 'needs-review');
  assert.ok(merged.metrics.topology.merged.length);
  const city = clone(base.city),
    road = city.roads.find(
      (r) =>
        !graph.roadClasses.get(r.id).protected && base.city.properties.some((p) => p.frontageRoadId === r.id),
    );
  road.id = 'RD-REPLACEMENT';
  const r = analyzeRoadImpact(base, proposal(city));
  assert.equal(r.status, 'needs-review');
  assert.ok(has(r, 'face-ambiguous'));
  assert.ok(has(r, 'frontage-missing'));
});

test('an ordinary road crossing a bank identifies the owning water records even before face extraction', () => {
  const p = fromFixture(parity.fixtures.at(-2)),
    g = buildRoadGraph(p.city),
    id = [...g.nodesById.keys()].find((id) =>
      g.incidentRoads.get(id).every((r) => !g.roadClasses.get(r).protected),
    );
  const target = waterFaceInterior(p.city.waterFaces[0].vertices, g.nodesById),
    r = inspectJunctionImpact(p, id, target);
  assert.equal(r.status, 'invalid');
  assert.ok(r.affected.some((i) => i.kind === 'water'));
});

test('unknown nested geometry metadata cannot silently qualify a changed proposal as Safe', () => {
  const p = blankProject();
  p.city.survey.anchors[0].futureRoadConstraint = 'unknown';
  assert.ok(has(move(p), 'unrecognized-dependency', 'city', p.city.id));
});

test('equal IDs in distinct supported collections keep kind-qualified diagnostics', () => {
  const project = clone(base),
    property = project.city.properties.find(
      (p) => project.city.blocks.find((b) => b.id === p.blockId)?.vertices.length === 4,
    ),
    oldId = property.id;
  property.id = property.blockId;
  for (const plot of project.city.plots) if (plot.propertyId === oldId) plot.propertyId = property.id;
  for (const building of project.city.buildings)
    if (building.propertyId === oldId) building.propertyId = property.id;
  validateStoredProject(project);
  const candidate = clone(project.city),
    block = candidate.blocks.find((b) => b.id === property.blockId);
  candidate.roads.push({ id: 'RD-TYPED-SPLIT', a: block.vertices[0], b: block.vertices[2], kind: 'lane' });
  const r = analyzeRoadImpact(project, proposal(candidate));
  assert.equal(r.status, 'needs-review');
  assert.ok(has(r, 'face-split', 'block', block.id));
  assert.ok(has(r, 'block-topology', 'property', property.id));
});

test('malformed accepted JSON and malformed proposal indexes are Invalid rather than reviewable', () => {
  const cyclic = clone(base);
  cyclic.loop = cyclic;
  const r = inspectJunctionImpact(cyclic, ordinary, point);
  assert.equal(r.status, 'invalid');
  assert.equal(r.validation.accepted, 'invalid');
  assert.doesNotThrow(() => JSON.stringify(r));
  const nan = clone(base);
  nan.city.nodes[0].x = NaN;
  assert.equal(inspectJunctionImpact(nan, ordinary, point).status, 'invalid');
  const invalid = analyzeRoadImpact(base, { operation: 'inspect-network', graph: {} });
  assert.equal(invalid.status, 'invalid');
  assert.ok(has(invalid, 'candidate-input'));
  assert.equal(invalid.canApplyIn02A, false);
});
