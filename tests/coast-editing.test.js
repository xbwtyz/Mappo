import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guideWaterPath,
  waterPathIsOrdered
} from '../src/core/water-editing.js';
import {
  waterFeaturePolygon,
  waterFrame
} from '../src/core/water-geometry.js';
import {
  generateCoast
} from '../src/generators/coast.js';
import {
  validateWaterDefinition
} from '../src/core/water-model.js';
import {
  validatePolygon,
  createValidationBudget
} from '../src/data/project-validation.js';
import {
  WaterEditor,
  WATER_HISTORY_LIMIT
} from '../src/editor/water.js';
import {
  createProject
} from '../src/core/city-model.js';
import {
  createProjectDocument,
  defaultWorkspace,
  encodeProjectDocument,
  decodeProjectDocument,
  copyJson
} from '../src/data/project-format.js';

function shore() {
  return {
    id: 'shore-guided',
    kind: 'coast',
    dataVersion: 1,
    path: Array.from({
      length: 9
    }, (_, i) => ({
      x: -400 + 100 * i,
      y: 0
    })),
    waterSide: 'left',
    seaDepth: 2000,
    extensions: {
      name: 'Silver Shore'
    }
  };
}

function editorCoast() {
  return {
    waterFeatures: [shore()],
    waterState: {
      version: 1,
      status: 'coast',
      algorithm: 'shore-v1',
      seed: 'shore-guide'
    },
    bridges: []
  };
}

function coastalProject() {
  const base = createProject({
      seed: 'shore-guide',
      morphology: 'organic'
    }),
    water = generateCoast(base.options.boundary, base.options.center, {
      seed: 'shore-guide',
      direction: 'east'
    });
  return createProject({
    ...base.options,
    seed: base.seed,
    water
  });
}
test('large shoreline handle gestures retain ordered courses, simple ocean polygons and their ocean side', () => {
  const f = shore();
  let adjusted = 0;
  for (let index = 0; index < 9; index++)
    for (let sample = 0; sample < 25; sample++) {
      const r = guideWaterPath(f, {
        index,
        point: {
          x: -1000 + sample * 80,
          y: (sample % 7 - 3) * 170
        }
      });
      assert.equal(waterPathIsOrdered(r.path), true);
      validatePolygon(waterFeaturePolygon({
        ...f,
        path: r.path,
        seaDepth: r.seaDepth
      }), 'Guided ocean', createValidationBudget());
      assert.equal(r.path.length, 9);
      assert.equal(f.waterSide, 'left');
      if (r.adjusted) adjusted++;
    }
  assert.ok(adjusted > 100);
});
test('coast endpoint guidance covers the full city and preserves complete undo history on cancellation', () => {
  const boundary = [{
      x: -300,
      y: -250
    }, {
      x: 300,
      y: -250
    }, {
      x: 300,
      y: 250
    }, {
      x: -300,
      y: 250
    }],
    e = new WaterEditor(() => {}, () => {}, () => boundary);
  e.loadCity(editorCoast());
  e.setMode('river');
  for (let i = 0; i < WATER_HISTORY_LIMIT; i++) e.remember();
  const before = e.definition(),
    history = copyJson(e.history);
  e.down(e.features[0].path[0], 1);
  e.move({
    x: 0,
    y: 0
  });
  const f = e.features[0],
    frame = waterFrame(f);
  for (const p of boundary) {
    const u = (p.x - frame.origin.x) * frame.u.x + (p.y - frame.origin.y) * frame.u.y;
    assert.ok(u > 0 && u < frame.length);
  }
  e.up(1, true);
  assert.deepEqual(e.definition(), before);
  assert.deepEqual(e.history, history);
  const shallow = {
    ...shore(),
    seaDepth: 100
  };
  const r = guideWaterPath(shallow, {
    boundary
  });
  assert.ok(r.seaDepth > 350);
  assert.equal(r.changed, true);
});
test('1000 narrow-city coast proposals pass their shared bend and full-definition checks', () => {
  const boundary = [{
      x: 0,
      y: 0
    }, {
      x: 100,
      y: 0
    }, {
      x: 100,
      y: 1000
    }, {
      x: 0,
      y: 1000
    }],
    center = {
      x: 20,
      y: 500
    };
  for (let i = 0; i < 1000; i++) {
    const water = generateCoast(boundary, center, {
      seed: `coast-bend-${i}`,
      direction: i % 2 ? 'north' : 'south'
    });
    validateWaterDefinition(water.features, water.bridges, boundary, center);
  }
});
test('shoreline point insertion snaps to the course without duplicate handles', () => {
  const e = new WaterEditor();
  e.loadCity(editorCoast());
  e.features[0].path = [-400, -300, -200, -100, -90, -80, 0, 200, 400].map(x => ({
    x,
    y: 0
  }));
  e.setMode('river');
  e.addPoint({
    x: -95,
    y: 15
  }, 1);
  assert.equal(e.features[0].path.length, 10);
  assert.deepEqual(e.features[0].path[e.selectedPoint], {
    x: -95,
    y: 0
  });
  const history = e.history.length;
  e.addPoint({
    x: -95,
    y: 0
  }, 1);
  assert.equal(e.features[0].path.length, 10);
  assert.equal(e.history.length, history);
  assert.equal(waterPathIsOrdered(e.features[0].path), true);
});
test('coast tidying is undoable and preserves river, bridges, ocean side and compatible metadata', () => {
  const p = coastalProject(),
    e = new WaterEditor();
  e.loadCity(p.city);
  e.generate(p.options.boundary, p.options.center, {
    seed: 'shore-guide-river',
    width: 20
  });
  const river = copyJson(e.features.find(f => f.kind === 'river')),
    bridges = copyJson(e.bridges),
    coast = e.features.find(f => f.kind === 'coast');
  e.selectFeature('coast');
  coast.path[4] = {
    ...coast.path[3]
  };
  const before = e.definition(),
    side = coast.waterSide;
  assert.equal(e.tidyCoast(p.options.boundary, false), true);
  assert.equal(waterPathIsOrdered(coast.path), true);
  assert.equal(coast.waterSide, side);
  assert.deepEqual(e.features.find(f => f.kind === 'river'), river);
  assert.deepEqual(e.bridges, bridges);
  e.undo();
  assert.deepEqual(e.definition(), before);
  const riverDraft = e.features.find(f => f.kind === 'river');
  riverDraft.path[4] = {
    ...riverDraft.path[3]
  };
  const both = e.definition(),
    length = e.history.length;
  assert.deepEqual(e.tidyWater(p.options.boundary).sort(), ['coast', 'river']);
  assert.equal(e.history.length, length + 1);
  e.undo();
  assert.deepEqual(e.definition(), both);
});
test('valid coast geometry stays exact and loaded invalid shoreline drafts are repaired only on request', () => {
  const p = coastalProject(),
    e = new WaterEditor();
  e.loadCity(p.city);
  const coast = copyJson(e.features[0]);
  assert.equal(e.tidyCoast(p.options.boundary, false), false);
  assert.deepEqual(e.features[0], coast);
  e.remember();
  e.features[0].path[4] = {
    ...e.features[0].path[3]
  };
  e.dirty = true;
  const invalid = e.snapshot(),
    workspace = defaultWorkspace(p);
  workspace.waterEditor = invalid;
  const document = createProjectDocument(p, workspace),
    loaded = decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(loaded.project.city, copyJson(p.city));
  assert.deepEqual(loaded.workspace.waterEditor, invalid);
  const restored = new WaterEditor();
  restored.load(loaded.workspace.waterEditor, loaded.project.city);
  assert.deepEqual(restored.snapshot(), invalid);
  assert.equal(waterPathIsOrdered(restored.features[0].path), false);
  assert.equal(restored.tidyCoast(p.options.boundary, false), true);
});
