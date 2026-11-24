import assert from 'node:assert/strict';
import test from 'node:test';
import { mixedCityFixtureS10 } from './helpers/schema10-mixed-city.js';
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

test('developed framing includes every exterior of a valid Schema 10 mixed city', () => {
  const { project, joinedId } = mixedCityFixtureS10();
  const city = project.city;
  const multipart = city.buildings.find(building => building.id === joinedId);
  assert.ok(!Array.isArray(multipart.footprint));
  const roots = multipart.geometry.regions.filter(region => region.parentId === null);
  assert.ok(roots.length > 1);
  const before = JSON.stringify(city);
  for (const resolution of [2048, 4096]) {
    for (const framing of ['developed', 'survey']) {
      const plan = planWholeCityPNG(city, framing, resolution);
      assert.equal(Math.max(plan.width, plan.height), resolution);
      if (framing === 'developed') {
        for (const building of city.buildings)
          for (const region of building.geometry.regions.filter(row => row.parentId === null))
            for (const point of region.ring) {
              assert.ok(point.x > plan.centerX - plan.spanX / 2 && point.x < plan.centerX + plan.spanX / 2);
              assert.ok(point.y > plan.centerY - plan.spanY / 2 && point.y < plan.centerY + plan.spanY / 2);
            }
      }
    }
  }
  assert.equal(JSON.stringify(city), before);
});

test('multipart bounds include a distant exterior and preserve simple-footprint framing', () => {
  const city = exportCityFixture();
  const rectangle = (x, y) => [{x, y}, {x:x+10, y}, {x:x+10, y:y+10}, {x, y:y+10}];
  const first = rectangle(45, 15);
  const second = rectangle(140, 100);
  city.buildings = [{footprint:first}];
  const legacy = planWholeCityPNG(city, 'developed', 2048);
  city.buildings = [{footprint:null, geometry:{regions:[{parentId:null, ring:first}]}}];
  assert.deepEqual(planWholeCityPNG(city, 'developed', 2048), legacy);
  city.buildings[0].geometry.regions.push({parentId:null, ring:second});
  const multipart = planWholeCityPNG(city, 'developed', 2048);
  assert.ok(multipart.centerX + multipart.spanX / 2 > 150);
  assert.ok(multipart.centerY + multipart.spanY / 2 > 110);
  assert.ok(multipart.spanX > legacy.spanX);
});
