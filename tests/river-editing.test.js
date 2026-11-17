import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guideRiverPath,
  riverPathIsOrdered
} from '../src/core/river-editing.js';
import {
  waterFrame,
  waterFeaturePolygon
} from '../src/core/water-geometry.js';
import {
  validateWaterDefinition
} from '../src/core/water-model.js';
import {
  generateRiver
} from '../src/generators/water.js';
import {
  generateCoast
} from '../src/generators/coast.js';
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
import {
  validatePolygon,
  createValidationBudget
} from '../src/data/project-validation.js';
import {
  insideOrOn
} from '../src/core/boundary.js';

function straightRiver() {
  return {
    id: 'river-guided',
    kind: 'river',
    dataVersion: 1,
    width: 28,
    path: Array.from({
      length: 9
    }, (_, i) => ({
      x: -400 + 100 * i,
      y: 0
    })),
    extensions: {
      name: 'Keep this name'
    }
  };
}

function riverCity() {
  return {
    waterFeatures: [straightRiver()],
    waterState: {
      version: 1,
      status: 'river',
      algorithm: 'ribbon-v1',
      seed: 'guide'
    },
    bridges: []
  };
}

function assertSafePath(feature, path) {
  const frame = waterFrame({
    path
  });
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      advance = (b.x - a.x) * frame.u.x + (b.y - a.y) * frame.u.y,
      lateral = (b.x - a.x) * frame.v.x + (b.y - a.y) * frame.v.y;
    assert.ok(advance > .001);
    assert.ok(Math.abs(lateral) <= advance * .8 + 1e-8);
  }
  validatePolygon(waterFeaturePolygon({
    ...feature,
    path
  }), 'Guided river banks', createValidationBudget());
}
test('large river handle gestures stay ordered with simple banks instead of tangles and sharp bends', () => {
  const f = straightRiver();
  let corrected = 0;
  for (let index = 0; index < 9; index++)
    for (let sample = 0; sample < 25; sample++) {
      const point = {
          x: -1000 + sample * 80,
          y: (sample % 7 - 3) * 170
        },
        result = guideRiverPath(f, {
          index,
          point
        });
      assertSafePath(f, result.path);
      if (result.adjusted) corrected++;
      assert.equal(result.path.length, f.path.length);
      assert.deepEqual(result.path[index].extensions, f.path[index].extensions);
    }
  assert.ok(corrected > 100);
});
test('guided endpoint moves extend past city land and cancelled gestures retain a full undo history', () => {
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
  e.loadCity(riverCity());
  e.setMode('river');
  for (let i = 0; i < WATER_HISTORY_LIMIT; i++) e.remember();
  const before = e.definition(),
    history = copyJson(e.history);
  e.down(e.features[0].path[0], 1);
  e.move({
    x: 0,
    y: 0
  });
  assert.equal(insideOrOn(e.features[0].path[0], boundary), false);
  assertSafePath(e.features[0], e.features[0].path);
  e.up(1, true);
  assert.deepEqual(e.definition(), before);
  assert.deepEqual(e.history, history);
  assert.equal(e.dirty, false);
});
test('river creation validates every preview including 1000 narrow coastal-city seeds', () => {
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
    },
    coast = generateCoast(boundary, center, {
      seed: 'thin-coast',
      direction: 'east'
    });
  for (let i = 0; i < 1000; i++) {
    const next = generateRiver(boundary, center, {
      seed: `thin-${i}`,
      width: 14,
      otherFeatures: coast.features
    });
    validateWaterDefinition([...next.features, ...coast.features], next.bridges, boundary, center);
  }
});
test('double-clicking inserts on the river and selects existing handles instead of making duplicates', () => {
  const e = new WaterEditor();
  e.loadCity(riverCity());
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
  assertSafePath(e.features[0], e.features[0].path);
  const before = e.features[0].path.length,
    history = e.history.length;
  e.addPoint({
    x: -95,
    y: 0
  }, 1);
  assert.equal(e.features[0].path.length, before);
  assert.equal(e.history.length, history);
});
test('tidying old invalid drafts is undoable and preserves coast, bridge and record metadata', () => {
  const e = new WaterEditor();
  e.loadCity(riverCity());
  const coast = {
    id: 'coast-retained',
    kind: 'coast',
    dataVersion: 1,
    path: [{
      x: 300,
      y: -500
    }, {
      x: 310,
      y: 0
    }, {
      x: 300,
      y: 500
    }],
    waterSide: 'right',
    seaDepth: 2000,
    extensions: {
      keep: true
    }
  };
  e.features.push(coast);
  e.state = {
    version: 1,
    status: 'mixed',
    algorithm: 'union-v1',
    seed: 'old-draft'
  };
  e.bridges = [{
    id: 'bridge-retained',
    dataVersion: 1,
    kind: 'bridge',
    waterId: 'river-guided',
    t: .3,
    width: 9,
    extensions: {
      keep: true
    }
  }];
  e.features[0].path[4] = {
    x: 250,
    y: 300
  };
  e.features[0].path[5] = {
    x: 0,
    y: 0
  };
  const before = e.definition(),
    bridges = copyJson(e.bridges);
  assert.equal(riverPathIsOrdered(e.features[0].path), false);
  assert.equal(e.tidyRiver([], false), true);
  assertSafePath(e.features[0], e.features[0].path);
  assert.deepEqual(e.features[1], coast);
  assert.deepEqual(e.bridges, bridges);
  assert.equal(e.features[0].extensions.name, 'Keep this name');
  e.undo();
  assert.deepEqual(e.definition(), before);
});
test('valid river geometry is untouched and loading an unfinished draft never tidies it automatically', () => {
  const base = createProject({
      seed: 'guide-save',
      morphology: 'organic'
    }),
    water = generateRiver(base.options.boundary, base.options.center, {
      seed: 'guide-save'
    }),
    project = createProject({
      ...base.options,
      seed: base.seed,
      water
    });
  const e = new WaterEditor();
  e.loadCity(project.city);
  const accepted = copyJson(e.features),
    history = e.history.length;
  assert.equal(e.tidyRiver(project.options.boundary, false), false);
  assert.deepEqual(e.features, accepted);
  assert.equal(e.history.length, history);
  e.remember();
  e.features[0].path[4] = {
    ...e.features[0].path[3]
  };
  e.dirty = true;
  const invalid = e.snapshot(),
    workspace = defaultWorkspace(project);
  workspace.waterEditor = invalid;
  const loaded = decodeProjectDocument(encodeProjectDocument(createProjectDocument(project, workspace)));
  assert.deepEqual(loaded.project.city, copyJson(project.city));
  assert.deepEqual(loaded.workspace.waterEditor, invalid);
  const restored = new WaterEditor();
  restored.load(loaded.workspace.waterEditor, loaded.project.city);
  assert.deepEqual(restored.snapshot(), invalid);
  assert.equal(riverPathIsOrdered(restored.features[0].path), false);
  assert.equal(restored.tidyRiver(project.options.boundary, false), true);
});
