import test from 'node:test';
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
  TerrainEditor,
  validateTerrainEditor
} from '../src/editor/terrain.js';
import {
  generateMountain
} from '../src/generators/terrain.js';
import {
  terrainPrepare,
  terrainShapeSafe,
  terrainRidgeSafe,
  terrainPassGeometry,
  terrainCopy
} from '../src/core/terrain-geometry.js';
import {
  validateTerrainDefinition
} from '../src/core/terrain-model.js';
import {
  WaterEditor
} from '../src/editor/water.js';
import {
  waterDistance,
  waterSetIntervals
} from '../src/core/water-geometry.js';
import {
  polygonSignedArea
} from '../src/core/geometry.js';
import {
  validateStoredProject
} from '../src/data/project-validation.js';
import {
  createProjectDocument,
  defaultWorkspace,
  encodeProjectDocument,
  decodeProjectDocument
} from '../src/data/project-format.js';

function mountainBase(options = {}) {
  return createProject({
    seed: 'mountains',
    morphology: 'organic',
    ...options
  });
}

function terrainApply(base, terrain) {
  return createProject({
    ...base.options,
    seed: base.seed,
    terrain,
    water: {
      features: base.city.waterFeatures,
      bridges: base.city.bridges,
      state: base.city.waterState
    },
    fortifications: {
      enabled: true
    }
  });
}

function dividingRange() {
  return terrainPrepare({
    features: [{
      id: 'MTN-DIVIDER',
      dataVersion: 1,
      kind: 'mountain',
      name: 'Long Ridge',
      center: {
        x: 130,
        y: 0
      },
      path: Array.from({
        length: 12
      }, (_, i) => ({
        x: 130 + 70 * Math.cos(i * Math.PI / 6),
        y: 430 * Math.sin(i * Math.PI / 6)
      })),
      ridge: [{
        x: 130,
        y: -230,
        height: 600
      }, {
        x: 130,
        y: 0,
        height: 900
      }, {
        x: 130,
        y: 230,
        height: 700
      }],
      generation: {
        seed: 'divider',
        algorithm: 'mountain-v1',
        placement: 'crossing',
        size: 150
      },
      extensions: {}
    }],
    passes: [{
      id: 'PASS-001',
      dataVersion: 1,
      kind: 'pass',
      terrainId: 'MTN-DIVIDER',
      t: .5,
      width: 12,
      extensions: {}
    }]
  });
}
test('mountains surround, occupy and cross cities with valid streets, dry buildings and defenses across 96 configurations', () => {
  for (const shape of ['organic', 'planned', 'twin', 'branching', 'crescent', 'wedge', 'linear', 'radial'])
    for (const morphology of ['radial', 'organic', 'planned', 'linear'])
      for (const placement of ['surrounding', 'inside', 'crossing']) {
        const base = mountainBase({
            boundary: makeStartingOutline(shape, 'mountains', 'medium'),
            morphology
          }),
          terrain = generateMountain(base.options.boundary, base.options.center, {
            seed: 'mountains',
            placement,
            size: placement === 'inside' ? 45 : 70
          }),
          p = terrainApply(base, terrain),
          city = p.city,
          nodes = new Map(city.nodes.map(n => [n.id, n]));
        validateStoredProject(p);
        const area = [...city.blocks, city.plaza, ...city.waterFaces, ...city.terrainFaces].reduce((n, f) => n + polygonSignedArea(f.vertices.map(id => nodes.get(id))), 0);
        assert.ok(Math.abs(area - polygonSignedArea(city.survey.boundary)) < .02);
        for (const feature of city.terrainFeatures) {
          assert.ok(terrainShapeSafe(feature) && terrainRidgeSafe(feature));
          for (const property of city.properties)
            for (const point of property.boundary) assert.ok(waterDistance(point, feature.polygon) > 6);
        }
        for (const road of city.roads.filter(r => !r.passId && !r.foothill && !r.terrainBoundary)) assert.equal(waterSetIntervals(nodes.get(road.a), nodes.get(road.b), city.terrainFeatures).some(s => s.inside), false);
      }
});
test('a range splitting the city requires a real, editable pass between dry foothills', () => {
  const base = mountainBase({
      boundary: [{
        x: -300,
        y: -300
      }, {
        x: 300,
        y: -300
      }, {
        x: 300,
        y: 300
      }, {
        x: -300,
        y: 300
      }],
      center: {
        x: 0,
        y: 0
      }
    }),
    terrain = dividingRange();
  assert.throws(() => validateTerrainDefinition(terrain.features, [], base.options.boundary, base.options.center), /divide/);
  const p = terrainApply(base, terrain);
  validateStoredProject(p);
  assert.ok(p.city.roads.some(r => r.passId === 'PASS-001'));
  assert.ok(p.city.walls[0].terrainOpenings.length >= 2);
  p.city.walls[0].terrainOpenings[0].extensions = {
    future: 'cliff'
  };
  validateStoredProject(p);
  const corruptGap = terrainCopy(p);
  corruptGap.city.walls[0].terrainOpenings[0].end += 1;
  assert.throws(() => validateStoredProject(corruptGap), /mountain openings/);
  const editor = new TerrainEditor();
  editor.loadCity(p.city);
  editor.setMode('pass');
  const g = terrainPassGeometry(editor.features[0], editor.passes[0], base.options.boundary);
  editor.down(g.center, 1);
  editor.move({
    x: g.center.x,
    y: g.center.y + 30
  });
  editor.up(1);
  assert.notEqual(editor.passes[0].t, .5);
  validateStoredProject(terrainApply(base, editor.definition()));
  editor.undo();
  assert.equal(editor.passes[0].t, .5);
});
test('multiple ranges coexist with lakes, river and coast while each definition stays independent', () => {
  const base = mountainBase(),
    water = new WaterEditor();
  water.generateCoastline(base.options.boundary, base.options.center, {
    seed: 'mountains',
    direction: 'east'
  });
  water.generate(base.options.boundary, base.options.center, {
    seed: 'mountains',
    width: 24
  });
  water.generateLakeDraft(base.options.boundary, base.options.center, {
    seed: 'mountains',
    radius: 18
  });
  const wet = createProject({
      ...base.options,
      seed: base.seed,
      water: water.definition()
    }),
    editor = new TerrainEditor();
  for (const placement of ['surrounding', 'inside', 'surrounding']) editor.generate(base.options.boundary, base.options.center, {
    seed: 'mixed-mountains',
    placement,
    size: placement === 'inside' ? 40 : 70,
    water: {
      features: wet.city.waterFeatures,
      bridges: wet.city.bridges
    }
  });
  const p = terrainApply(wet, editor.definition());
  validateStoredProject(p);
  assert.equal(p.city.terrainFeatures.length, 3);
  assert.deepEqual(p.city.waterFeatures, wet.city.waterFeatures);
});
test('footprint, ridge, peak heights, range movement, closed insertion and cancellation have independent undo', () => {
  const base = mountainBase(),
    editor = new TerrainEditor();
  for (let i = 0; i < 2; i++) editor.generate(base.options.boundary, base.options.center, {
    seed: 'edit-mountains',
    placement: 'inside',
    size: 40
  });
  const other = terrainCopy(editor.features[0]),
    f = terrainCopy(editor.features[1]);
  editor.setMode('shape');
  editor.down(f.path[0], 1);
  editor.move(f.center);
  assert.ok(terrainShapeSafe(editor.activeFeature()));
  assert.ok(terrainRidgeSafe(editor.activeFeature()));
  editor.up(1, true);
  assert.deepEqual(editor.activeFeature(), f);
  const a = f.path.at(-1),
    b = f.path[0];
  editor.addPoint({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  }, 1);
  assert.equal(editor.activeFeature().path.length, 13);
  editor.removePoint();
  assert.equal(editor.activeFeature().path.length, 12);
  editor.setMode('ridge');
  editor.down(f.ridge[1], 1);
  editor.move({
    x: 1e8,
    y: -1e8
  });
  assert.ok(terrainRidgeSafe(editor.activeFeature()));
  editor.up(1);
  editor.height(1500);
  assert.equal(editor.activeFeature().ridge[1].height, 1500);
  editor.undo();
  editor.undo();
  assert.deepEqual(editor.activeFeature(), f);
  editor.setMode('move');
  editor.down(f.center, 1);
  editor.move({
    x: f.center.x + 12,
    y: f.center.y + 18
  });
  editor.up(1);
  assert.equal(editor.activeFeature().center.x, f.center.x + 12);
  editor.undo();
  assert.deepEqual(editor.activeFeature(), f);
  assert.deepEqual(editor.features[0], other);
});
test('selected regeneration, removal, snapshots and incompatible terrain corruption preserve the accepted city', () => {
  const base = mountainBase(),
    editor = new TerrainEditor();
  editor.generate(base.options.boundary, base.options.center, {
    seed: 'persist-mountains',
    placement: 'inside',
    size: 40
  });
  const id = editor.activeTerrainId;
  editor.features[0].name = 'Ironspine';
  editor.features[0].extensions.future = {
    biome: 'snow'
  };
  editor.generate(base.options.boundary, base.options.center, {
    seed: 'changed',
    placement: 'inside',
    size: 40
  }, id);
  assert.equal(editor.activeTerrainId, id);
  assert.equal(editor.activeFeature().name, 'Ironspine');
  assert.equal(editor.activeFeature().extensions.future.biome, 'snow');
  const p = terrainApply(base, editor.definition());
  editor.loadCity(p.city);
  editor.setMode('ridge');
  editor.height(1200);
  const workspace = defaultWorkspace(p);
  workspace.terrainEditor = {
    ...editor.snapshot(),
    controls: {
      seed: 'next',
      size: '50',
      height: '1600',
      placement: 'crossing'
    }
  };
  const document = createProjectDocument(p, workspace),
    loaded = decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(loaded, document);
  const restored = new TerrainEditor();
  restored.load(loaded.workspace.terrainEditor, loaded.project.city);
  assert.deepEqual(restored.snapshot(), editor.snapshot());
  restored.undo();
  assert.deepEqual(restored.features, p.city.terrainFeatures);
  restored.remove();
  assert.equal(restored.features.length, 0);
  restored.undo();
  assert.deepEqual(restored.features, p.city.terrainFeatures);
  for (const mutate of [p => p.city.terrainFeatures[0].corridor[0].x += 1, p => p.city.terrainFeatures[0].ridge[1].height = 0, p => p.city.terrainFaces[0].terrainIds = ['missing'], p => p.city.terrainPasses[0].terrainId = 'missing', p => p.city.roads.find(r => r.passId).passId = 'missing']) {
    const broken = terrainCopy(p);
    mutate(broken);
    assert.throws(() => validateStoredProject(broken));
  }
  const draft = editor.snapshot();
  draft.features[0].path[1] = {
    ...draft.features[0].path[0]
  };
  assert.doesNotThrow(() => validateTerrainEditor(draft));
});
test('native schema-8 water cities and unfinished drafts load unchanged and can gain mountains', async () => {
  const raw = JSON.parse(await readFile(new URL('./fixtures/save-3e5-format1-schema8.json', import.meta.url), 'utf8')),
    loaded = decodeProjectDocument(JSON.stringify(raw));
  assert.equal(loaded.project.schemaVersion, 9);
  assert.deepEqual(loaded.project.city, raw.project.city);
  assert.deepEqual(loaded.workspace, raw.workspace);
  const e = new TerrainEditor();
  e.generate(loaded.project.options.boundary, loaded.project.options.center, {
    seed: 'legacy-mountains',
    placement: 'surrounding',
    size: 50,
    water: {
      features: loaded.project.city.waterFeatures,
      bridges: loaded.project.city.bridges
    }
  });
  validateStoredProject(terrainApply(loaded.project, e.definition()));
});
test('six independent ranges and height boundaries are supported; failed additions preserve history', () => {
  const base = mountainBase({
      boundary: [{
        x: -900,
        y: -900
      }, {
        x: 900,
        y: -900
      }, {
        x: 900,
        y: 900
      }, {
        x: -900,
        y: 900
      }],
      size: 'small'
    }),
    e = new TerrainEditor();
  for (let i = 0; i < 6; i++) e.generate(base.options.boundary, base.options.center, {
    seed: 'six-ranges',
    placement: 'surrounding',
    size: 50,
    height: i % 2 ? 50 : 3000
  });
  const before = e.snapshot();
  assert.throws(() => e.generate(base.options.boundary, base.options.center, {
    size: 50
  }), /six/);
  assert.deepEqual(e.snapshot(), before);
  validateStoredProject(terrainApply(base, e.definition()));
  assert.equal(e.features.length, 6);
  for (const f of e.features) assert.ok(f.ridge.every(p => p.height >= 50 && p.height <= 3000));
});
test('water proposal hooks retry around existing mountains and preserve independent terrain definitions', () => {
  const base = mountainBase(),
    e = new TerrainEditor();
  e.generate(base.options.boundary, base.options.center, {
    seed: 'reverse-mountains',
    placement: 'inside',
    size: 40
  });
  const terrain = terrainPrepare(e.definition()),
    before = e.definition();
  let validated = 0;
  const water = new WaterEditor(() => {}, () => {}, () => base.options.boundary, definition => {
    validated++;
    validateTerrainDefinition(terrain.features, terrain.passes, base.options.boundary, base.options.center, definition);
  });
  water.generateCoastline(base.options.boundary, base.options.center, {
    seed: 'mountains',
    direction: 'east'
  });
  water.generate(base.options.boundary, base.options.center, {
    seed: 'mountains',
    width: 24
  });
  water.generateLakeDraft(base.options.boundary, base.options.center, {
    seed: 'mountains',
    radius: 18
  });
  const p = createProject({
    ...base.options,
    seed: base.seed,
    terrain: e.definition(),
    water: water.definition(),
    fortifications: {
      enabled: true
    }
  });
  validateStoredProject(p);
  assert.ok(validated >= 3);
  assert.deepEqual(e.definition(), before);
});
