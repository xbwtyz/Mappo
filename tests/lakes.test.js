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
  WaterEditor,
  validateWaterEditor
} from '../src/editor/water.js';
import {
  lakeShapeSafe,
  lakeFitsBoundary,
  LAKE_LIMIT
} from '../src/core/lake-geometry.js';
import {
  guideLakePath
} from '../src/core/lake-editing.js';
import {
  prepareWater
} from '../src/generators/water.js';
import {
  validateWaterDefinition
} from '../src/core/water-model.js';
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
  decodeProjectDocument,
  copyJson
} from '../src/data/project-format.js';

function lakeSetup(options = {}) {
  const base = createProject({
      seed: 'lakes',
      morphology: 'organic',
      ...options
    }),
    editor = new WaterEditor(() => {}, () => {}, () => base.options.boundary);
  editor.loadCity(base.city);
  return {
    base,
    editor
  };
}

function applyLakes(base, editor) {
  return createProject({
    ...base.options,
    seed: base.seed,
    water: editor.definition(),
    fortifications: {
      enabled: true
    }
  });
}
test('three independent lakes partition land, connect shore streets and keep buildings dry across 32 city configurations', () => {
  for (const shape of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
      const {
        base,
        editor
      } = lakeSetup({
        boundary: makeStartingOutline(shape, 'lakes', 'medium'),
        morphology
      });
      for (let i = 0; i < 3; i++) editor.generateLakeDraft(base.options.boundary, base.options.center, {
        seed: 'lakes',
        radius: 22
      });
      const p = applyLakes(base, editor),
        c = p.city,
        nodes = new Map(c.nodes.map(n => [n.id, n]));
      validateStoredProject(p);
      assert.equal(c.waterFeatures.length, 3);
      assert.equal(c.waterState.status, 'mixed');
      const area = [...c.blocks, c.plaza, ...c.waterFaces].reduce((sum, f) => sum + polygonSignedArea(f.vertices.map(id => nodes.get(id))), 0);
      assert.ok(Math.abs(area - polygonSignedArea(c.survey.boundary)) < .02);
      for (const f of c.waterFeatures) {
        assert.ok(lakeShapeSafe(f));
        assert.ok(lakeFitsBoundary(f, c.survey.boundary));
        for (const property of c.properties)
          for (const point of property.boundary) assert.ok(waterDistance(point, f.polygon) > 6);
      }
      for (const road of c.roads.filter(r => !r.bank)) assert.equal(waterSetIntervals(nodes.get(road.a), nodes.get(road.b), c.waterFeatures).some(s => s.inside), false);
    }
});
test('lakes coexist with river, coast and bridges in either creation order', () => {
  for (const order of ['lakes-first', 'lakes-last'])
    for (const direction of ['north', 'east', 'south', 'west']) {
      const {
        base,
        editor
      } = lakeSetup();
      const add = () => {
        for (let i = 0; i < 2; i++) editor.generateLakeDraft(base.options.boundary, base.options.center, {
          seed: 'mixed-lake',
          radius: 20
        });
      };
      if (order === 'lakes-first') add();
      editor.generateCoastline(base.options.boundary, base.options.center, {
        seed: 'lakes',
        direction
      });
      editor.generate(base.options.boundary, base.options.center, {
        seed: 'lakes',
        width: 24
      });
      if (order === 'lakes-last') add();
      const p = applyLakes(base, editor);
      validateStoredProject(p);
      assert.equal(p.city.waterFeatures.length, 4);
      assert.ok(p.city.bridges.length);
    }
});
test('lake edits guide extreme shoreline drags and whole-lake moves without tangles or mutating another feature', () => {
  const {
    base,
    editor
  } = lakeSetup();
  for (let i = 0; i < 2; i++) editor.generateLakeDraft(base.options.boundary, base.options.center, {
    radius: 28
  });
  const first = copyJson(editor.features[0]),
    second = copyJson(editor.features[1]);
  editor.selectFeature(first.id);
  editor.setMode('river');
  for (const point of [{
      x: 99999,
      y: -99999
    }, first.center, first.path[5]]) {
    editor.down(first.path[0], 1);
    editor.move(point);
    assert.ok(lakeShapeSafe(editor.activeFeature()));
    assert.ok(lakeFitsBoundary(editor.activeFeature(), base.options.boundary));
    editor.up(1);
    editor.undo();
    assert.deepEqual(editor.features[0], first);
  }
  editor.setMode('lake-move');
  editor.down(first.center, 1);
  editor.move({
    x: 99999,
    y: 99999
  });
  assert.ok(lakeFitsBoundary(editor.activeFeature(), base.options.boundary));
  assert.ok(lakeShapeSafe(editor.activeFeature()));
  editor.up(1, true);
  assert.deepEqual(editor.features[0], first);
  assert.deepEqual(editor.features[1], second);
  const gentle = guideLakePath(first, {
    index: 0,
    point: {
      x: first.path[0].x + 2,
      y: first.path[0].y
    },
    boundary: base.options.boundary
  });
  assert.equal(gentle.adjusted, false);
  assert.equal(gentle.changed, true);
});
test('closed shore insertion includes last edge; handle deletion, selected regeneration and removal retain identities and undo', () => {
  const {
    base,
    editor
  } = lakeSetup();
  for (let i = 0; i < 2; i++) editor.generateLakeDraft(base.options.boundary, base.options.center, {
    radius: 28
  });
  const first = editor.features[0],
    second = copyJson(editor.features[1]);
  editor.selectFeature(first.id);
  editor.setMode('river');
  const p = first.path.at(-1),
    q = first.path[0];
  editor.addPoint({
    x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2
  }, 1);
  assert.equal(first.path.length, 13);
  assert.equal(editor.selectedPoint, 12);
  editor.removePoint();
  assert.equal(first.path.length, 12);
  first.extensions.future = {
    value: 3
  };
  first.name = 'Longwater';
  editor.generateLakeDraft(base.options.boundary, base.options.center, {
    seed: 'new',
    radius: 24
  }, first.id);
  assert.equal(editor.features.length, 2);
  assert.equal(editor.features[0].id, first.id);
  assert.equal(editor.features[0].name, 'Longwater');
  assert.deepEqual(editor.features[0].extensions, first.extensions);
  assert.deepEqual(editor.features[1], second);
  editor.removeFeature(second.id);
  assert.equal(editor.features.length, 1);
  assert.equal(editor.features[0].id, first.id);
  editor.undo();
  assert.deepEqual(editor.features[1], second);
});
test('multiple lake geometry, active selection, pending inputs and drafts round-trip exactly; corrupt accepted lake banks reject', () => {
  const {
    base,
    editor
  } = lakeSetup();
  for (let i = 0; i < 2; i++) editor.generateLakeDraft(base.options.boundary, base.options.center, {
    radius: 26
  });
  const p = applyLakes(base, editor);
  editor.loadCity(p.city);
  editor.selectFeature(p.city.waterFeatures[1].id);
  editor.setMode('lake-move');
  const f = editor.activeFeature();
  editor.down(f.center, 1);
  editor.move({
    x: f.center.x + 3,
    y: f.center.y + 4
  });
  editor.up(1);
  const workspace = defaultWorkspace(p);
  workspace.waterEditor = {
    ...editor.snapshot(),
    controls: {
      seed: 'river',
      width: '28',
      coastSeed: 'coast',
      coastDirection: 'west',
      lakeSeed: 'pending',
      lakeRadius: '31'
    }
  };
  const doc = createProjectDocument(p, workspace);
  assert.deepEqual(decodeProjectDocument(encodeProjectDocument(doc)), doc);
  const loaded = new WaterEditor();
  loaded.load(doc.workspace.waterEditor, p.city);
  assert.deepEqual(loaded.snapshot(), editor.snapshot());
  loaded.undo();
  assert.deepEqual(loaded.features, p.city.waterFeatures);
  for (const mutate of [p => p.city.waterFeatures[0].corridor[0].x += 1, p => p.city.waterFeatures[0].center.x = 1e9, p => p.city.waterFeatures[0].path.reverse(), p => p.city.waterFeatures[0].polygon[0].y += 1]) {
    const broken = copyJson(p);
    mutate(broken);
    assert.throws(() => validateStoredProject(broken));
  }
  const draft = editor.snapshot();
  draft.features[0].path[1] = {
    ...draft.features[0].path[0]
  };
  assert.doesNotThrow(() => validateWaterEditor(draft));
});
test('eight lakes are supported with stable IDs and failed additions leave all drafts and history intact', () => {
  const boundary = [{
      x: -600,
      y: -600
    }, {
      x: 600,
      y: -600
    }, {
      x: 600,
      y: 600
    }, {
      x: -600,
      y: 600
    }],
    {
      base,
      editor
    } = lakeSetup({
      boundary,
      size: 'small'
    });
  for (let i = 0; i < LAKE_LIMIT; i++) editor.generateLakeDraft(base.options.boundary, base.options.center, {
    radius: 20
  });
  const snapshot = editor.snapshot();
  assert.throws(() => editor.generateLakeDraft(boundary, base.options.center, {
    radius: 20
  }), /eight lakes/);
  assert.deepEqual(editor.snapshot(), snapshot);
  const p = applyLakes(base, editor);
  validateStoredProject(p);
  assert.equal(p.city.waterFeatures.length, 8);
});
test('native schema-7 city and shoreline drafts migrate without regenerating any saved geometry', async () => {
  const raw = JSON.parse(await readFile(new URL('./fixtures/save-3e4-format1-schema7.json', import.meta.url), 'utf8'));
  assert.equal(raw.project.schemaVersion, 7);
  assert.equal(raw.project.city.waterFeatures.length, 2);
  const loaded = decodeProjectDocument(JSON.stringify(raw));
  assert.equal(loaded.project.schemaVersion, 10);
  assert.deepEqual(loaded.project.city, raw.project.city);
  assert.deepEqual(loaded.workspace, raw.workspace);
  const editor = new WaterEditor();
  editor.load(loaded.workspace.waterEditor, loaded.project.city);
  const old = copyJson(editor.features);
  editor.generateLakeDraft(loaded.project.options.boundary, loaded.project.options.center, {
    seed: 'legacy-lake',
    radius: 18
  });
  assert.deepEqual(editor.features.slice(0, 2), old);
  validateStoredProject(applyLakes(loaded.project, editor));
});
