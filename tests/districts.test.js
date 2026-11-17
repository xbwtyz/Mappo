import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject
} from '../src/core/city-model.js';
import {
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  buildDistrictTopology,
  districtIsConnected,
  districtSummary
} from '../src/core/district-topology.js';
import {
  generateDistricts,
  DISTRICT_ALGORITHMS
} from '../src/generators/districts.js';
import {
  applyDistrictMembership,
  validateDistricts,
  renameDistrict,
  moveDistrictBlock
} from '../src/core/district-model.js';
import {
  DistrictEditor,
  districtSnapshot,
  restoreDistrictSnapshot,
  validateDistrictEditorState
} from '../src/editor/districts.js';
import {
  createProjectDocument,
  encodeProjectDocument,
  decodeProjectDocument,
  defaultWorkspace,
  copyJson
} from '../src/data/project-format.js';
import {
  pointInPolygon
} from '../src/core/geometry.js';

function assertDistricts(city, context) {
  const topology = buildDistrictTopology(city),
    owners = new Map();
  assert.equal(city.districtState.status, 'assigned', context);
  for (const d of city.districts) {
    assert.ok(d.blockIds.length > 0);
    assert.equal(new Set(d.blockIds).size, d.blockIds.length);
    assert.ok(districtIsConnected(d.blockIds, topology), `${context}: disconnected neighborhood`);
    for (const id of d.blockIds) {
      assert.ok(topology.blocks.has(id));
      assert.ok(!owners.has(id));
      owners.set(id, d.id);
    }
    const summary = districtSummary(city, d, topology);
    assert.equal(summary.blocks, d.blockIds.length);
    assert.equal(summary.properties, city.properties.filter(p => d.blockIds.includes(p.blockId)).length);
    assert.equal(summary.buildings, city.buildings.filter(b => d.blockIds.includes(b.blockId)).length);
    assert.ok(d.blockIds.some(id => pointInPolygon(summary.label, topology.blocks.get(id).vertices.map(id => topology.nodes.get(id)))));
  }
  assert.equal(owners.size, city.blocks.length);
  for (const b of city.blocks) assert.equal(b.districtId, owners.get(b.id));
  for (const p of [...city.properties, ...city.buildings]) assert.equal(p.districtId, owners.get(p.blockId));
  validateDistricts(city);
}

function unchangedGeometry(before, after) {
  for (const key of ['nodes', 'roads', 'plaza', 'plots', 'survey', 'openSpaces', 'walls']) assert.deepEqual(after[key], before[key]);
  for (const key of ['blocks', 'properties', 'buildings']) assert.deepEqual(after[key].map(({
    districtId,
    ...record
  }) => record), before[key].map(({
    districtId,
    ...record
  }) => record));
}

test('district coverage and connectivity hold across 96 outlines, densities and street patterns', () => {
  let configurations = 0;
  for (const outline of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const size of ['small', 'medium', 'large'])
      for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
        const city = createProject({
          seed: 'district-shapes',
          size,
          morphology,
          boundary: makeStartingOutline(outline, 'district-shapes', 'medium')
        }).city;
        assertDistricts(city, `${outline}/${size}/${morphology}`);
        configurations++;
      }
  assert.equal(configurations, 96);
});

test('district generation is reproducible, count-adjustable and separate from all city geometry', () => {
  const city = createProject({
    seed: 'district-independent',
    morphology: 'organic'
  }).city;
  for (const count of [1, 2, 4, 8, 12]) {
    const a = generateDistricts(city, {
        seed: 'district-only',
        count
      }),
      b = generateDistricts(city, {
        seed: 'district-only',
        count
      });
    assert.deepEqual(a, b);
    assert.equal(a.districts.length, count);
    unchangedGeometry(city, a);
    assertDistricts(a, `count-${count}`);
  }
  assert.notDeepEqual(generateDistricts(city, {
    seed: 'other'
  }).districts, generateDistricts(city, {
    seed: 'district-only'
  }).districts);
  assert.throws(() => generateDistricts(city, {
    count: 0
  }), /count|number/);
  assert.throws(() => generateDistricts(city, {
    algorithm: 'missing'
  }), /unavailable/);
  assert.ok(Object.hasOwn(DISTRICT_ALGORITHMS, 'adjacency-growth-v1'));
});

test('renaming and recoloring keep stable district IDs, membership, future metadata and city geometry', () => {
  const city = createProject({
      seed: 'district-edit'
    }).city,
    district = city.districts[0];
  district.extensions.rules = {
    futureTheme: 'crafts'
  };
  const next = renameDistrict(city, district.id, 'Copper Fox Quarter', '#12ab34');
  assert.equal(next.districts[0].id, district.id);
  assert.deepEqual(next.districts[0].blockIds, district.blockIds);
  assert.deepEqual(next.districts[0].extensions, district.extensions);
  assert.equal(district.name === next.districts[0].name, false);
  assert.equal(next.districts[0].color, '#12ab34');
  unchangedGeometry(city, next);
  assert.throws(() => renameDistrict(city, district.id, ' ', '#123456'), /names/);
  assert.throws(() => renameDistrict(city, district.id, 'Valid', 'red'), /colors/);
});

test('moving a boundary block updates every property and building and keeps both neighborhoods connected', () => {
  const city = createProject({
      seed: 'district-move',
      morphology: 'organic'
    }).city,
    topology = buildDistrictTopology(city);
  let result = null,
    moved = null;
  for (const block of city.blocks) {
    for (const neighbor of topology.neighbors.get(block.id)) {
      const target = topology.blocks.get(neighbor).districtId;
      if (target === block.districtId) continue;
      try {
        result = moveDistrictBlock(city, block.id, target);
        moved = {
          blockId: block.id,
          target
        };
        break;
      } catch {}
    }
    if (result) break;
  }
  assert.ok(result);
  assertDistricts(result, 'moved');
  unchangedGeometry(city, result);
  for (const record of [...result.properties, ...result.buildings].filter(r => r.blockId === moved.blockId)) assert.equal(record.districtId, moved.target);
  assert.notEqual(city.blocks.find(b => b.id === moved.blockId).districtId, moved.target);
});

function gridDistrictFixture() {
  const nodes = [];
  for (let y = 0; y <= 2; y++)
    for (let x = 0; x <= 3; x++) nodes.push({
      id: `N-${x}-${y}`,
      x: x * 20,
      y: y * 20
    });
  const blocks = [],
    roadPairs = new Map();
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 3; x++) {
      const vertices = [`N-${x}-${y}`, `N-${x+1}-${y}`, `N-${x+1}-${y+1}`, `N-${x}-${y+1}`],
        id = `B-${x}-${y}`;
      blocks.push({
        id,
        vertices,
        area: 400
      });
      for (let i = 0; i < 4; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % 4],
          key = [a, b].sort().join(':');
        if (!roadPairs.has(key)) roadPairs.set(key, {
          id: `R-${roadPairs.size}`,
          a,
          b,
          kind: 'secondary'
        });
      }
    }
  const city = {
    nodes,
    roads: [...roadPairs.values()],
    blocks,
    properties: [],
    buildings: []
  };
  const d = (id, blockIds) => ({
    id,
    dataVersion: 1,
    kind: 'neighborhood',
    name: id,
    color: '#aabbcc',
    blockIds
  });
  return applyDistrictMembership(city, [d('TOP', ['B-0-0', 'B-1-0', 'B-2-0']), d('BOTTOM', ['B-0-1', 'B-1-1', 'B-2-1'])], {
    version: 1,
    status: 'assigned',
    count: 2
  });
}

test('district moves reject source splits, isolated targets and empty neighborhoods without changing data', () => {
  const city = gridDistrictFixture(),
    before = copyJson(city);
  validateDistricts(city);
  assert.throws(() => moveDistrictBlock(city, 'B-1-0', 'BOTTOM'), /split/);
  assert.deepEqual(city, before);
  const moved = moveDistrictBlock(city, 'B-0-0', 'BOTTOM');
  validateDistricts(moved);
  const one = applyDistrictMembership(city, [{
    ...city.districts[0],
    blockIds: ['B-0-0']
  }, {
    ...city.districts[1],
    blockIds: city.blocks.filter(b => b.id !== 'B-0-0').map(b => b.id)
  }], city.districtState);
  assert.throws(() => moveDistrictBlock(one, 'B-0-0', 'BOTTOM'), /at least one/);
  const remote = applyDistrictMembership(city, [{
    ...city.districts[0],
    blockIds: ['B-0-0']
  }, {
    ...city.districts[1],
    blockIds: ['B-2-1']
  }, {
    ...city.districts[1],
    id: 'MIDDLE',
    blockIds: ['B-1-0', 'B-2-0', 'B-0-1', 'B-1-1']
  }], {
    version: 1,
    status: 'assigned',
    count: 3
  });
  assert.throws(() => moveDistrictBlock(remote, 'B-0-0', 'BOTTOM'), /share a street edge/);
});

test('district undo restores edits and rebuilding, including a legacy unassigned city with opaque annotations', () => {
  const city = createProject({
      seed: 'district-undo'
    }).city,
    editor = new DistrictEditor();
  editor.selectedDistrictId = city.districts[0].id;
  const renamed = editor.edit(city, 'Renamed Ward', '#abcdef'),
    rebuilt = editor.generate(renamed, {
      seed: 'rebuild',
      count: 3
    });
  assert.deepEqual(editor.undo(rebuilt), renamed);
  assert.deepEqual(editor.undo(renamed), city);
  const legacy = {
    ...city,
    districts: [{
      id: 'opaque',
      future: {
        preserve: true
      }
    }],
    districtState: {
      version: 1,
      status: 'unassigned'
    },
    blocks: city.blocks.map(({
      districtId,
      ...r
    }) => r),
    properties: city.properties.map(({
      districtId,
      ...r
    }, i) => i ? r : {
      ...r,
      districtId: 'opaque'
    }),
    buildings: city.buildings.map(({
      districtId,
      ...r
    }) => r)
  };
  const next = editor.generate(legacy, {
    count: 3
  });
  assert.deepEqual(editor.undo(next), legacy);
});

test('district names, assignments, layers, selection and undo history survive portable saves', () => {
  const project = createProject({
      seed: 'district-save'
    }),
    editor = new DistrictEditor();
  editor.selectedDistrictId = project.city.districts[0].id;
  project.city = editor.edit(project.city, 'Saved Ward', '#654321');
  const workspace = defaultWorkspace(project);
  workspace.districtEditor = editor.snapshot();
  workspace.view.layers.districtLabels = false;
  const loaded = decodeProjectDocument(encodeProjectDocument(createProjectDocument(project, workspace)));
  assert.deepEqual(loaded.project, copyJson(project));
  assert.deepEqual(loaded.workspace, workspace);
  const restored = new DistrictEditor();
  restored.load(loaded.workspace.districtEditor);
  const prior = restored.undo(loaded.project.city);
  assert.notEqual(prior.districts[0].name, 'Saved Ward');
  validateDistricts(prior);
});

test('save validation rejects broken district coverage, membership, colors and disconnected histories', () => {
  const project = createProject({
    seed: 'district-invalid'
  });
  const metadata = copyJson(project);
  metadata.city.districtState.requestedCount = {
    invalid: true
  };
  assert.throws(() => encodeProjectDocument(createProjectDocument(metadata)), /requested district count/);
  let bad = copyJson(project);
  bad.city.districts[0].blockIds.pop();
  assert.throws(() => encodeProjectDocument(createProjectDocument(bad)));
  bad = copyJson(project);
  bad.city.buildings[0].districtId = 'missing';
  assert.throws(() => encodeProjectDocument(createProjectDocument(bad)), /district|District/);
  bad = copyJson(project);
  bad.city.districts[0].color = 'url(evil)';
  assert.throws(() => encodeProjectDocument(createProjectDocument(bad)), /color/);
  const history = {
    selectedDistrictId: null,
    selectedBlockId: null,
    history: [districtSnapshot(gridDistrictFixture())]
  };
  history.history[0].districts[0].blockIds = ['B-0-0', 'B-2-0'];
  assert.throws(() => validateDistrictEditorState(history, gridDistrictFixture()), /disconnected|blocks|membership/);
});

test('legacy district undo rejects duplicate or missing record assignments and preserves opaque fields', () => {
  const city = gridDistrictFixture(),
    legacy = {
      ...city,
      districts: [],
      districtState: {
        version: 1,
        status: 'unassigned'
      },
      blocks: city.blocks.map(({
        districtId,
        ...b
      }) => b)
    };
  const snapshot = districtSnapshot(legacy);
  snapshot.futureMetadata = {
    keep: true
  };
  assert.deepEqual(restoreDistrictSnapshot(legacy, snapshot), legacy);
  snapshot.legacyMembership.blocks[1] = copyJson(snapshot.legacyMembership.blocks[0]);
  assert.throws(() => restoreDistrictSnapshot(legacy, snapshot), /different city/);
});
