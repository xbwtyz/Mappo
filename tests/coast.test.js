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
  generateCoast,
  COAST_DIRECTIONS
} from '../src/generators/coast.js';
import {
  prepareWater
} from '../src/generators/water.js';
import {
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  waterAt,
  waterDistance,
  waterLineIntervals
} from '../src/core/water-geometry.js';
import {
  waterLandRegions
} from '../src/core/water-regions.js';
import {
  validateWaterDefinition
} from '../src/core/water-model.js';
import {
  WaterEditor
} from '../src/editor/water.js';
import {
  pointInPolygon,
  polygonSignedArea
} from '../src/core/geometry.js';
import {
  solidWallSegments
} from '../src/core/fortification-geometry.js';
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

function coastProject(options = {}, direction = 'east') {
  const base = createProject({
      seed: 'coast-stress',
      morphology: 'organic',
      ...options
    }),
    water = generateCoast(base.options.boundary, base.options.center, {
      seed: 'coast-stress',
      direction
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
test('coastal land, streets, properties and defenses stay clear of ocean across 96 configurations', () => {
  for (const shape of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const size of ['small', 'medium', 'large'])
      for (const [i, morphology] of ['radial', 'organic', 'linear', 'planned'].entries()) {
        const boundary = makeStartingOutline(shape, 'coast-stress', size),
          p = coastProject({
            boundary,
            size,
            morphology
          }, COAST_DIRECTIONS[i]),
          c = p.city,
          f = c.waterFeatures[0],
          nodes = new Map(c.nodes.map(n => [n.id, n]));
        validateStoredProject(p);
        assert.equal(c.bridges.length, 0);
        assert.equal(c.waterState.status, 'coast');
        assert.equal(pointInPolygon(c.plaza.center, f.corridor), false);
        assert.equal(waterLandRegions(boundary, f.corridor).landCount, 1);
        const area = [...c.blocks, c.plaza, ...c.waterFaces].reduce((sum, face) => sum + polygonSignedArea(face.vertices.map(id => nodes.get(id))), 0);
        assert.ok(Math.abs(area - polygonSignedArea(boundary)) < .02);
        for (const property of c.properties)
          for (const point of property.boundary) assert.ok(waterDistance(point, f.polygon) > 6, 'shoreline setback');
        for (const b of c.buildings)
          for (const point of b.footprint) assert.equal(pointInPolygon(point, f.polygon), false);
        for (const r of c.roads.filter(r => !r.waterBoundary))
          for (const span of waterLineIntervals(nodes.get(r.a), nodes.get(r.b), f.polygon)) assert.equal(span.inside, false, 'streets stay on land');
        for (const wall of c.walls)
          for (const section of solidWallSegments(wall, c.gates)) {
            const mid = {
              x: (section.a.x + section.b.x) / 2,
              y: (section.a.y + section.b.y) / 2
            };
            assert.equal(pointInPolygon(mid, f.corridor), false, 'no walls in ocean');
          }
        for (const t of c.towers) assert.ok(waterDistance(t.center, f.polygon) > t.radius);
      }
});
test('coast proposals are deterministic with ocean on the requested side and an independent seed', () => {
  const p = coastProject(),
    base = {
      features: p.city.waterFeatures,
      bridges: [],
      state: p.city.waterState
    };
  assert.deepEqual(p, coastProject());
  const other = createProject({
    ...p.options,
    seed: 'new-streets',
    water: base
  });
  assert.deepEqual(other.city.waterFeatures, p.city.waterFeatures);
  assert.notDeepEqual(other.city.roads, p.city.roads);
  for (const [direction, vector] of [
      ['north', {
        x: 0,
        y: -1
      }],
      ['east', {
        x: 1,
        y: 0
      }],
      ['south', {
        x: 0,
        y: 1
      }],
      ['west', {
        x: -1,
        y: 0
      }]
    ]) {
    const water = generateCoast(p.options.boundary, p.options.center, {
        seed: 'direction',
        direction
      }),
      f = water.features[0],
      point = waterAt(f, .5);
    assert.equal(pointInPolygon({
      x: point.x + vector.x * 100,
      y: point.y + vector.y * 100
    }, f.polygon), true);
    assert.equal(pointInPolygon({
      x: point.x - vector.x * 100,
      y: point.y - vector.y * 100
    }, f.polygon), false);
  }
  assert.notDeepEqual(generateCoast(p.options.boundary, p.options.center, {
    seed: 'different'
  }).features, p.city.waterFeatures);
});
test('coast edits, side swaps, cancellation and undo stay in the water draft', () => {
  const p = coastProject(),
    before = copyJson(p),
    e = new WaterEditor();
  e.loadCity(p.city);
  e.features[0].extensions.name = 'Silver Coast';
  const start = e.definition();
  e.setMode('river');
  const point = e.features[0].path[4];
  e.down(point, 1);
  e.move({
    x: point.x + 4,
    y: point.y
  });
  e.up(1);
  assert.equal(e.dirty, true);
  assert.equal(e.features[0].extensions.name, 'Silver Coast');
  const applied = createProject({
    ...p.options,
    seed: p.seed,
    water: e.definition()
  });
  validateStoredProject(applied);
  e.undo();
  assert.deepEqual(e.definition(), start);
  e.flipCoast();
  assert.throws(() => {
    const w = prepareWater(e.definition());
    validateWaterDefinition(w.features, w.bridges, p.options.boundary, p.options.center)
  }, /square/);
  e.undo();
  assert.deepEqual(e.definition(), start);
  e.setMode('bridge');
  e.down(waterAt(e.features[0], .5), 1);
  assert.equal(e.bridges.length, 0);
  e.setMode('addbridge');
  e.down(waterAt(e.features[0], .5), 1);
  assert.equal(e.bridges.length, 0);
  e.setMode('river');
  e.down(e.features[0].path[4], 1);
  e.move({
    ...point,
    x: point.x + 8
  });
  e.up(1, true);
  assert.deepEqual(e.definition(), start);
  assert.deepEqual(copyJson(p), before);
  e.clear();
  assert.equal(e.features.length, 0);
  e.undo();
  assert.deepEqual(e.definition(), start);
});
test('coastal saves preserve exact ocean geometry, invalid drafts, undo and pending direction', () => {
  const p = coastProject();
  p.city.waterFeatures[0].extensions.notes = 'A sheltered harbor';
  const e = new WaterEditor();
  e.loadCity(p.city);
  e.flipCoast();
  const workspace = defaultWorkspace(p);
  workspace.waterEditor = {
    ...e.snapshot(),
    controls: {
      seed: 'future-coast',
      width: '28',
      coastDirection: 'south'
    }
  };
  const document = createProjectDocument(p, workspace),
    loaded = decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(loaded, document);
  const editor = new WaterEditor();
  editor.load(loaded.workspace.waterEditor, loaded.project.city);
  editor.undo();
  assert.deepEqual(editor.features, p.city.waterFeatures);
});
test('coast validation rejects invalid sides, undersized ocean extents, submerged squares and isolated land', () => {
  const p = coastProject();
  for (const [mutate, pattern] of [
      [p => p.city.waterFeatures[0].waterSide = 'up', /Invalid water/],
      [p => p.city.waterFeatures[0].polygon[0].x += 1, /banks disagree/],
      [p => p.city.waterState.algorithm = 'ribbon-v1', /Unsupported/],
      [p => p.city.waterFeatures[0].dataVersion = 2, /Unsupported/],
      [p => p.city.bridges = [{
        id: 'BRIDGE-1',
        dataVersion: 1,
        kind: 'bridge',
        waterId: p.city.waterFeatures[0].id,
        t: .5,
        width: 9
      }], /open ocean/]
    ]) {
    const next = copyJson(p);
    mutate(next);
    assert.throws(() => validateStoredProject(next), pattern);
  }
  const small = copyJson(p.city.waterFeatures[0]);
  small.seaDepth = 100;
  const short = prepareWater({
    features: [small],
    bridges: []
  });
  assert.throws(() => validateWaterDefinition(short.features, [], p.options.boundary, p.options.center), /extent/);
  const boundary = makeStartingOutline('crescent', 'coast-stress', 'small'),
    dry = createProject({
      boundary,
      seed: 'coast-stress',
      size: 'small'
    }),
    island = copyJson(p.city.waterFeatures[0]);
  island.path = [{
    x: 120.76890805694475,
    y: -442
  }, {
    x: 103.93597782830912,
    y: -331.5
  }, {
    x: 97.23259905351267,
    y: -221
  }, {
    x: 104.58552010510722,
    y: -110.5
  }, {
    x: 121.68749955412729,
    y: 0
  }, {
    x: 138.52042978276293,
    y: 110.5
  }, {
    x: 145.22380855755938,
    y: 221
  }, {
    x: 137.87088750596484,
    y: 331.5
  }, {
    x: 120.76890805694477,
    y: 442
  }];
  island.waterSide = 'right';
  const bad = prepareWater({
    features: [island],
    bridges: []
  });
  assert.equal(waterLandRegions(boundary, bad.features[0].corridor).landCount, 2);
  assert.throws(() => validateWaterDefinition(bad.features, [], boundary, dry.options.center), /islands/);
});
test('native 3E river saves migrate without moving geometry or changing editor history', async () => {
  const raw = JSON.parse(await readFile(new URL('./fixtures/save-3e-format1-schema5.json', import.meta.url), 'utf8'));
  assert.equal(raw.project.city.waterFeatures[0].kind, 'river');
  assert.ok(raw.project.city.bridges.length);
  const loaded = decodeProjectDocument(JSON.stringify(raw));
  assert.equal(loaded.project.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(legacyCityViewS10(loaded.project.city), raw.project.city);
  assert.deepEqual(loaded.workspace, raw.workspace);
  assert.deepEqual(decodeProjectDocument(encodeProjectDocument(loaded)), loaded);
});
