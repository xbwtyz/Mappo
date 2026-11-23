import assert from 'node:assert/strict';
import test from 'node:test';
import { planWholeCityPNG } from '../src/data/whole-city-png.js';

function exportCityFixture() {
  return {
    survey: { boundary: [{ x: -100, y: -200 }, { x: 100, y: 200 }] },
    nodes: [{ id: 'a', x: -60, y: 0 }, { id: 'b', x: 0, y: 0 }, { id: 'water', x: 0, y: 150 }],
    roads: [{ a: 'a', b: 'b', kind: 'primary' }, { a: 'b', b: 'water', waterBoundary: true }],
    plaza: { vertices: ['a', 'b'] },
    blocks: [],
    properties: [],
    plots: [],
    buildings: [],
    fortificationState: { status: 'built', enabled: true },
    walls: [],
    gates: [],
    towers: [{ center: { x: 30, y: 0 }, radius: 8 }]
  };
}

test('whole-city framing distinguishes development and survey and includes road and tower strokes', () => {
  const city = exportCityFixture();
  const developed = planWholeCityPNG(city, 'developed', 2048);
  assert.equal(developed.width, 2048);
  assert.ok(developed.height < 800, 'Water-only edge does not drive developed framing');
  assert.ok(developed.centerX + developed.spanX / 2 > 38, 'Tower fits including its radius');
  assert.ok(developed.centerX - developed.spanX / 2 < -60, 'Outlying road edge fits');

  const survey = planWholeCityPNG(city, 'survey', 4096);
  assert.equal(survey.height, 4096);
  assert.ok(survey.width < survey.height);
  assert.equal(survey.pixelScale, 2);
  assert.ok(survey.spanX > 200 && survey.spanY > 400);
  assert.deepEqual([survey.centerX, survey.centerY], [0, 0]);
});

test('whole-city export falls back to survey and rejects invalid dimensions before rendering', () => {
  const city = { ...exportCityFixture(), roads: [], plaza: { vertices: [] }, towers: [] };
  const survey = planWholeCityPNG(city, 'survey', 2048);
  assert.equal(survey.usedSurvey, true);
  assert.deepEqual(planWholeCityPNG(city, 'developed', 2048), survey);
  assert.throws(() => planWholeCityPNG(city, 'invalid', 2048), /framing/);
  assert.throws(() => planWholeCityPNG(city, 'survey', 8192), /resolution/);
  assert.throws(() => planWholeCityPNG({ ...city, survey: { boundary: [] } }, 'survey', 2048), /usable map bounds/);
});
