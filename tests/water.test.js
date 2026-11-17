import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile
} from 'node:fs/promises';
import {
  createProject
} from '../src/core/city-model.js';
import {
  generateRiver
} from '../src/generators/water.js';
import {
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  waterAt,
  waterBridgeGeometry,
  waterDistance,
  waterLineIntervals,
  WATER_BANK
} from '../src/core/water-geometry.js';
import {
  validateStoredProject
} from '../src/data/project-validation.js';
import {
  createProjectDocument,
  defaultWorkspace,
  encodeProjectDocument,
  decodeProjectDocument,
  copyJson
} from '../src/data/project-format.js';
import {
  WaterEditor
} from '../src/editor/water.js';
import {
  pointInPolygon,
  polygonSignedArea
} from '../src/core/geometry.js';

function riverProject(options = {}) {
  const base = createProject({
    seed: 'river-stress',
    morphology: 'organic',
    ...options
  });
  const water = generateRiver(base.city.survey.boundary, base.options.center, {
    seed: 'river-stress',
    width: 24
  });
  return createProject({
    ...base.options,
    seed: base.seed,
    water,
    fortifications: {
      enabled: true
    }
  });
}
test('river, shoreline streets, bridges and defenses remain valid across 96 city configurations', () => {
  for (const shape of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const size of ['small', 'medium', 'large'])
      for (const morphology of ['organic', 'planned', 'radial', 'linear']) {
        const boundary = makeStartingOutline(shape, 'river-stress', size),
          project = riverProject({
            boundary,
            size,
            morphology
          }),
          city = project.city,
          f = city.waterFeatures[0];
        validateStoredProject(project);
        const nodes = new Map(city.nodes.map(n => [n.id, n]));
        let area = 0;
        for (const face of [...city.blocks, city.plaza, ...city.waterFaces]) area += polygonSignedArea(face.vertices.map(id => nodes.get(id)));
        assert.ok(Math.abs(area - polygonSignedArea(boundary)) < .02, `${shape}/${size}/${morphology} coverage`);
        for (const property of city.properties)
          for (const p of property.boundary) assert.ok(waterDistance(p, f.polygon) > 6, 'property shoreline setback');
        for (const building of city.buildings)
          for (const p of building.footprint) assert.equal(pointInPolygon(p, f.polygon), false);
        for (const road of city.roads.filter(r => !r.waterBoundary && !r.bridgeId && !r.bank))
          for (const s of waterLineIntervals(nodes.get(road.a), nodes.get(road.b), f.polygon)) assert.equal(s.inside, false, 'ordinary street cannot cross water');
        for (const bridge of city.bridges) {
          const g = waterBridgeGeometry(f, bridge, boundary);
          assert.equal(g.ends.length, 2);
          assert.ok(city.roads.some(r => r.bridgeId === bridge.id));
        }
        assert.ok(city.walls[0].waterOpenings.length >= 2);
      }
});
test('river and bridge geometry are deterministic and independent of the street seed', () => {
  const a = riverProject(),
    b = riverProject();
  assert.deepEqual(a, b);
  const water = {
    features: a.city.waterFeatures,
    bridges: a.city.bridges,
    state: a.city.waterState
  };
  const c = createProject({
    ...a.options,
    seed: 'different-streets',
    water
  });
  assert.deepEqual(c.city.waterFeatures, a.city.waterFeatures);
  assert.deepEqual(c.city.bridges, a.city.bridges);
  assert.notDeepEqual(c.city.roads, a.city.roads);
  const other = generateRiver(a.options.boundary, a.options.center, {
    seed: 'another-river',
    width: 24
  });
  assert.notDeepEqual(other.features, a.city.waterFeatures);
});
test('bridge movement changes the actual connected street crossing and validates removal and spacing', () => {
  const a = riverProject(),
    water = {
      features: copyJson(a.city.waterFeatures),
      bridges: copyJson(a.city.bridges),
      state: copyJson(a.city.waterState)
    };
  water.bridges[0].t += .025;
  const b = createProject({
    ...a.options,
    seed: a.seed,
    water
  });
  validateStoredProject(b);
  assert.notDeepEqual(b.city.roads, a.city.roads);
  assert.equal(b.city.bridges[0].t, water.bridges[0].t);
  water.bridges = [];
  assert.throws(() => createProject({
    ...a.options,
    seed: a.seed,
    water
  }), /at least one bridge/);
  water.bridges = copyJson(a.city.bridges);
  water.bridges[1].t = water.bridges[0].t;
  assert.throws(() => createProject({
    ...a.options,
    seed: a.seed,
    water
  }), /farther apart/);
  water.bridges = [{
    ...a.city.bridges[0],
    t: .02
  }];
  assert.throws(() => createProject({
    ...a.options,
    seed: a.seed,
    water
  }), /both banks|inside the city/);
});
test('water edits and undo preserve city geometry and compatible metadata', () => {
  const project = riverProject(),
    before = structuredClone(project),
    e = new WaterEditor();
  e.loadCity(project.city);
  e.features[0].extensions.future = {
    retain: true
  };
  e.bridges[0].extensions.label = 'Old Crossing';
  const start = e.definition();
  e.setMode('bridge');
  const p = waterAt(e.features[0], e.bridges[0].t);
  e.down(p, 1);
  e.move(waterAt(e.features[0], e.bridges[0].t + .02));
  e.up(1);
  assert.equal(e.dirty, true);
  assert.equal(e.bridges[0].extensions.label, 'Old Crossing');
  e.undo();
  assert.deepEqual(e.definition(), start);
  e.width(32);
  assert.equal(e.features[0].width, 32);
  e.undo();
  assert.equal(e.features[0].width, 24);
  e.clear();
  assert.equal(e.features.length, 0);
  e.undo();
  assert.deepEqual(e.definition(), start);
  assert.deepEqual(project, before);
  e.setMode('river');
  const q = e.features[0].path[3];
  e.down(q, 1);
  e.move({
    x: q.x,
    y: q.y + 10
  });
  e.up(1, true);
  assert.deepEqual(e.definition(), start);
});
test('water files retain exact geometry, unfinished invalid drafts, undo and future fields', () => {
  const project = riverProject();
  project.city.waterFeatures[0].extensions.note = 'The Silver Run';
  project.city.bridges[0].extensions.name = 'Old Crossing';
  const e = new WaterEditor();
  e.loadCity(project.city);
  e.setMode('river');
  const p = e.features[0].path[4];
  e.down(p, 1);
  e.move({
    ...e.features[0].path[3]
  });
  e.up(1);
  const workspace = defaultWorkspace(project);
  workspace.waterEditor = {
    ...e.snapshot(),
    controls: {
      seed: 'next-river',
      width: ''
    },
    future: {
      keep: true
    }
  };
  workspace.panels = {
    districts: false,
    fortifications: false,
    water: true,
    futurePanel: {
      expanded: true
    }
  };
  const document = createProjectDocument(project, workspace),
    loaded = decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(loaded, document);
  const restored = new WaterEditor();
  restored.load(loaded.workspace.waterEditor, loaded.project.city);
  assert.equal(restored.dirty, true);
  restored.undo();
  assert.deepEqual(restored.features, project.city.waterFeatures);
  const updated = createProjectDocument(project, {
    ...workspace,
    waterEditor: e.snapshot(),
    panels: {
      districts: false,
      fortifications: false,
      water: false
    }
  }, loaded);
  assert.deepEqual(updated.workspace.panels.futurePanel, {
    expanded: true
  });
  assert.deepEqual(updated.workspace.waterEditor.future, {
    keep: true
  });
  assert.equal(updated.workspace.waterEditor.controls.seed, 'next-river');
});
test('saved water corruption and unsupported forms fail before replacing a city', () => {
  const good = riverProject();
  for (const [mutate, pattern] of [
      [p => p.city.waterFeatures[0].polygon[0].x += 5, /banks disagree/],
      [p => p.city.waterFeatures[0].polygon[0] = {
        x: 'bad',
        y: 0
      }, /banks disagree/],
      [p => p.city.bridges[0].waterId = 'missing', /reference/],
      [p => p.city.bridges[0].dataVersion = 2, /Unsupported/],
      [p => p.city.waterFaces[0].waterId = 'missing', /water face reference/],
      [p => delete p.city.roads.find(r => r.bridgeId).bridgeId, /ordinary street/],
      [p => p.city.waterState.version = 2, /Unsupported/],
      [p => p.city.walls[0].waterOpenings = [], /water openings/],
      [p => p.city.waterFeatures[0].path.reverse(), /banks disagree|Smooth|progress|river/]
    ]) {
    const p = copyJson(good);
    mutate(p);
    assert.throws(() => validateStoredProject(p), pattern);
  }
});
test('native 3D files migrate to dry land without changing geometry, walls, districts or workspace', async () => {
  const raw = JSON.parse(await readFile(new URL('./fixtures/save-3d-format1-schema4.json', import.meta.url), 'utf8')),
    loaded = decodeProjectDocument(JSON.stringify(raw));
  assert.equal(loaded.project.schemaVersion, 5);
  assert.equal(loaded.project.city.waterState.status, 'dry');
  const {
    waterState,
    waterFeatures,
    waterFaces,
    bridges,
    ...city
  } = loaded.project.city;
  assert.deepEqual(city, raw.project.city);
  assert.deepEqual(loaded.workspace, raw.workspace);
  assert.deepEqual(decodeProjectDocument(encodeProjectDocument(loaded)), loaded);
});
test('different river widths and rotated custom outlines keep banks and bridge spans valid', () => {
  for (const angle of [0, .43, 1.2])
    for (const width of [10, 32, 60]) {
      const source = makeStartingOutline('planned', 'widths', 'medium'),
        boundary = source.map(p => ({
          x: p.x * Math.cos(angle) - p.y * Math.sin(angle) + 83,
          y: p.x * Math.sin(angle) + p.y * Math.cos(angle) - 130
        })),
        base = createProject({
          seed: 'widths',
          boundary,
          morphology: 'organic'
        }),
        water = generateRiver(boundary, base.options.center, {
          seed: 'widths',
          width
        });
      const p = createProject({
        ...base.options,
        seed: base.seed,
        water
      });
      validateStoredProject(p);
      assert.equal(p.city.waterFeatures[0].width, width);
    }
});
