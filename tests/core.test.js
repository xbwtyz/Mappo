import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeed, createRng, hashSeed } from '../src/core/prng.js';
import { createProject } from '../src/core/city-model.js';
import { generateSurvey, SIZE_PRESETS, MORPHOLOGY_PRESETS } from '../src/generators/survey.js';
import { pointInPolygon } from '../src/core/geometry.js';
import { Camera } from '../src/renderer/camera.js';

test('seed normalizes and stable PRNG sequences are reproducible', () => {
  assert.equal(normalizeSeed('  '), 'mappo');
  assert.equal(hashSeed('same'), hashSeed('same'));
  assert.deepEqual(Array.from({ length: 12 }, createRng('hello')),
    Array.from({ length: 12 }, createRng('hello')));
  assert.notDeepEqual(Array.from({ length: 4 }, createRng('hello')),
    Array.from({ length: 4 }, createRng('world')));
});

test('all settlement sizes generate reproducible project data', () => {
  for (const size of Object.keys(SIZE_PRESETS)) {
    const a = createProject({ seed: 'raven-hill', size });
    const b = createProject({ seed: 'raven-hill', size });
    assert.deepEqual(a, b);
    assert.equal(a.options.size, size);
    assert.equal(a.options.morphology, 'radial');
    assert.ok(a.city.roads.length > 40);
    assert.ok(a.city.blocks.length > 15);
    assert.ok(a.city.plaza.vertices.length >= 4);
    assert.ok(a.city.buildings.length > 20);
    assert.equal(a.city.survey.boundary.length, 64);
    assert.ok(a.city.survey.anchors.length > 3);
  }
});

test('survey anchors remain in the survey boundary for 1200 layouts', () => {
  for (const size of Object.keys(SIZE_PRESETS)) {
    for (const morphology of MORPHOLOGY_PRESETS) for (let n = 0; n < 100; n++) {
      const survey = generateSurvey(`stress-${n}`, size, morphology);
      assert.ok(survey.boundary.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      for (const anchor of survey.anchors) {
        assert.ok(pointInPolygon(anchor, survey.boundary), `anchor outside boundary for ${size}/${n}`);
      }
    }
  }
});

test('camera round-trips coordinates and retains cursor position on zoom', () => {
  const camera = new Camera();
  camera.resize(940, 720);
  camera.fit(generateSurvey('test', 'medium').boundary);
  const original = { x: 93.5, y: -158 };
  const screen = camera.worldToScreen(original);
  assert.ok(Math.abs(camera.screenToWorld(screen).x - original.x) < 1e-9);
  assert.ok(Math.abs(camera.screenToWorld(screen).y - original.y) < 1e-9);
  camera.zoomAt(1.4, screen);
  const next = camera.worldToScreen(original);
  assert.ok(Math.abs(next.x - screen.x) < 1e-9);
  assert.ok(Math.abs(next.y - screen.y) < 1e-9);
  camera.pan(25, -13);
  assert.ok(Math.abs(camera.worldToScreen(original).x - (screen.x + 25)) < 1e-9);
});


test('morphology is validated and persisted in reproducible projects', () => {
  for (const morphology of MORPHOLOGY_PRESETS) {
    const project = createProject({ seed: 'growth-123', size: 'medium', morphology });
    assert.equal(project.options.morphology, morphology);
    assert.equal(project.city.survey.morphology, morphology);
    assert.equal(project.generatorVersion, '0.1-dev.3c');
    assert.deepEqual(project, createProject({ seed: 'growth-123', size: 'medium', morphology }));
  }
  assert.equal(createProject({ morphology: 'unknown' }).options.morphology, 'radial');
  assert.equal(createProject().options.morphology, 'radial');
});
