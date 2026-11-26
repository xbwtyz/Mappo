import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import test from 'node:test';
import { legacyCityViewS10 } from './helpers/schema10-legacy-view.js';
import assert from 'node:assert/strict';
import {
  readFile
} from 'node:fs/promises';
import {
  createProject
} from '../src/core/city-model.js';
import {
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  WaterEditor
} from '../src/editor/water.js';
import {
  prepareWater
} from '../src/generators/water.js';
import {
  waterSetBoundary,
  waterUnionSegments,
  waterSetContains,
  waterDistance,
  waterAt,
  waterBridgeGeometry,
  waterPolygonsOverlap
} from '../src/core/water-geometry.js';
import {
  waterShoreComponents
} from '../src/core/water-shore-topology.js';
import {
  pointInPolygon,
  polygonSignedArea
} from '../src/core/geometry.js';
import {
  validateStoredProject
} from '../src/data/project-validation.js';
import {
  validateWaterDefinition
} from '../src/core/water-model.js';
import {
  createProjectDocument,
  defaultWorkspace,
  encodeProjectDocument,
  decodeProjectDocument,
  copyJson
} from '../src/data/project-format.js';

function mixedProject(options = {}, order = 'coast-first', direction = 'east') {
  const base = createProject({
      seed: 'mixed',
      morphology: 'organic',
      ...options
    }),
    e = new WaterEditor();
  e.loadCity(base.city);
  const settings = {
    seed: 'mixed',
    width: 24,
    direction
  };
  if (order === 'river-first') {
    e.generate(base.options.boundary, base.options.center, settings);
    e.generateCoastline(base.options.boundary, base.options.center, settings);
  } else {
    e.generateCoastline(base.options.boundary, base.options.center, settings);
    e.generate(base.options.boundary, base.options.center, settings);
  }
  return createProject({
    ...base.options,
    seed: base.seed,
    water: e.definition(),
    fortifications: {
      enabled: true
    }
  });
}
test('river and coast coexist in both generation orders across 64 shape, street and ocean configurations', () => {
  for (const shape of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const [i, morphology] of ['radial', 'organic', 'linear', 'planned'].entries())
      for (const order of ['river-first', 'coast-first']) {
        const p = mixedProject({
            boundary: makeStartingOutline(shape, 'mixed', 'medium'),
            morphology
          }, order, ['north', 'east', 'south', 'west'][i]),
          c = p.city,
          nodes = new Map(c.nodes.map(n => [n.id, n]));
        validateStoredProject(p);
        assert.equal(c.waterFeatures.length, 2);
        assert.equal(c.waterState.status, 'mixed');
        assert.equal(waterShoreComponents(c.survey.boundary, c.waterFeatures, c.bridges), 1);
        assert.ok(c.bridges.length > 0);
        for (const property of c.properties)
          for (const f of c.waterFeatures)
            for (const point of property.boundary) assert.ok(waterDistance(point, f.polygon) > 6);
        const area = [...c.blocks, c.plaza, ...c.waterFaces].reduce((sum, face) => sum + polygonSignedArea(face.vertices.map(id => nodes.get(id))), 0);
        assert.ok(Math.abs(area - polygonSignedArea(c.survey.boundary)) < .02);
        for (const road of c.roads.filter(r => r.bank)) {
          const a = nodes.get(road.a),
            b = nodes.get(road.b);
          assert.equal(waterSetBoundary({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2
          }, c.waterFeatures), true, 'no quay across internal water seams');
        }
        for (const face of c.waterFaces) {
          assert.ok(face.waterIds.length);
          for (const f of c.waterFeatures) assert.equal(face.waterIds.includes(f.id), waterPolygonsOverlap(face.vertices.map(id => nodes.get(id)), f.corridor));
        }
      }
});
test('generating, editing and removing either feature preserves the other and its metadata', () => {
  const p = mixedProject(),
    e = new WaterEditor();
  e.loadCity(p.city);
  e.features.find(f => f.kind === 'coast').extensions.future = {
    note: 'keep'
  };
  const coast = copyJson(e.features.find(f => f.kind === 'coast'));
  e.generate(p.options.boundary, p.options.center, {
    seed: 'independent-river',
    width: 28
  });
  assert.deepEqual(e.features.find(f => f.kind === 'coast'), coast);
  const river = copyJson(e.features.find(f => f.kind === 'river')),
    bridges = copyJson(e.bridges);
  e.generateCoastline(p.options.boundary, p.options.center, {
    seed: 'independent-coast',
    direction: 'east'
  });
  assert.deepEqual(e.features.find(f => f.kind === 'river'), river);
  assert.deepEqual(e.bridges, bridges);
  e.removeFeature('coast');
  assert.deepEqual(e.features, [river]);
  assert.deepEqual(e.bridges, bridges);
  e.undo();
  assert.equal(e.features.length, 2);
  const nextCoast = copyJson(e.features.find(f => f.kind === 'coast'));
  e.removeFeature('river');
  assert.deepEqual(e.features, [nextCoast]);
  assert.equal(e.bridges.length, 0);
  e.undo();
  assert.deepEqual(e.features.find(f => f.kind === 'river'), river);
  e.selectFeature('coast');
  e.setMode('river');
  const point = e.activeFeature().path[4];
  e.down(point, 1);
  e.move({
    x: point.x + 3,
    y: point.y
  });
  e.up(1);
  assert.deepEqual(e.features.find(f => f.kind === 'river'), river);
  e.undo();
  e.width(30);
  assert.deepEqual(e.features.find(f => f.kind === 'coast'), nextCoast);
});
test('merged river mouths have no internal shoreline even when water boundaries touch', () => {
  const rectangle = (id, x0, x1) => ({
    id,
    corridor: [{
      x: x0,
      y: 0
    }, {
      x: x1,
      y: 0
    }, {
      x: x1,
      y: 100
    }, {
      x: x0,
      y: 100
    }]
  });
  const features = [rectangle('river', 0, 100), rectangle('ocean', 100, 200)];
  assert.equal(waterSetBoundary({
    x: 100,
    y: 50
  }, features), false);
  assert.equal(waterSetContains({
    x: 100,
    y: 50
  }, features), true);
  assert.ok(waterUnionSegments(features).every(s => !(Math.abs(s.a.x - 100) < 1e-5 && Math.abs(s.b.x - 100) < 1e-5)));
  const p = mixedProject();
  assert.ok(p.city.waterFaces.some(f => f.waterIds.length === 2));
  assert.ok(p.city.walls[0].waterOpenings.some(o => o.waterIds.length === 2));
});
test('mixed projects save exact geometry, independent controls and active shoreline undo', () => {
  const p = mixedProject(),
    e = new WaterEditor();
  e.loadCity(p.city);
  e.selectFeature('coast');
  e.setMode('river');
  e.flipCoast();
  const workspace = defaultWorkspace(p);
  workspace.waterEditor = {
    ...e.snapshot(),
    controls: {
      seed: 'river-pending',
      coastSeed: 'coast-pending',
      coastDirection: 'south',
      width: '31'
    }
  };
  const document = createProjectDocument(p, workspace),
    loaded = decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(loaded, document);
  const restored = new WaterEditor();
  restored.load(loaded.workspace.waterEditor, loaded.project.city);
  assert.equal(restored.activeFeature().kind, 'coast');
  restored.undo();
  assert.deepEqual(restored.features, p.city.waterFeatures);
});
test('invalid combined references, internal banks and ocean bridges are rejected', () => {
  const p = mixedProject();
  for (const [mutate, pattern] of [
      [p => p.city.waterFaces[0].waterIds = [], /water face reference/],
      [p => p.city.bridges[0].waterId = 'missing', /reference/],
      [p => p.city.waterState.algorithm = 'ribbon-v1', /Unsupported/],
      [p => p.city.waterFeatures.push(copyJson(p.city.waterFeatures[0])), /duplicate/i],
      [p => p.city.walls[0].waterOpenings[0].waterIds = ['missing'], /water openings/]
    ]) {
    const next = copyJson(p);
    mutate(next);
    assert.throws(() => validateStoredProject(next), pattern);
  }
  const e = new WaterEditor();
  e.loadCity(p.city);
  const river = e.features.find(f => f.kind === 'river'),
    coast = e.features.find(f => f.kind === 'coast');
  let t = null;
  for (let i = 5; i < 95; i++) {
    try {
      const g = waterBridgeGeometry(river, {
        t: i / 100
      }, p.options.boundary);
      if (g.ends.some(point => pointInPolygon(point, coast.corridor))) {
        t = i / 100;
        break;
      }
    } catch {}
  }
  assert.ok(t);
  e.bridges[0].t = t;
  const water = prepareWater(e.definition());
  assert.throws(() => validateWaterDefinition(water.features, water.bridges, p.options.boundary, p.options.center), /ocean/);
});
test('native 3E.1 coasts migrate unchanged and can gain a river without changing the coast record', async () => {
  const raw = JSON.parse(await readFile(new URL('./fixtures/save-3e1-format1-schema6.json', import.meta.url), 'utf8')),
    loaded = decodeProjectDocument(JSON.stringify(raw));
  assert.equal(loaded.project.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(legacyCityViewS10(loaded.project.city), raw.project.city);
  assert.deepEqual(loaded.workspace, raw.workspace);
  const e = new WaterEditor();
  e.load(loaded.workspace.waterEditor, loaded.project.city);
  const coast = copyJson(e.features.find(f => f.kind === 'coast'));
  e.generate(loaded.project.options.boundary, loaded.project.options.center, {
    seed: 'legacy-river',
    width: 20
  });
  assert.deepEqual(e.features.find(f => f.kind === 'coast'), coast);
  assert.equal(new Set(e.features.map(f => f.id)).size, 2);
  const p = createProject({
    ...loaded.project.options,
    seed: loaded.project.seed,
    water: e.definition()
  });
  validateStoredProject(p);
  assert.deepEqual(p.city.waterFeatures.find(f => f.kind === 'coast'), coast);
});
