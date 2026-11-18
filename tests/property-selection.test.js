import test from 'node:test';
import assert from 'node:assert/strict';
import { hitProperty, propertySelectionVisible, buildingsOnProperty } from '../src/core/property-selection.js';
import { drawPropertySelection } from '../src/renderer/property-selection.js';

const rectangle = (x = 0, width = 100) => [
  { x, y: 0 }, { x: x + width, y: 0 }, { x: x + width, y: 100 }, { x, y: 100 }
];
const property = (id, x = 0) => ({ id, boundary: rectangle(x), buildingIds: ['west', 'east'] });

test('property hits include roofs, yards and open courtyards, preserving all accepted records', () => {
  const properties = [property('site')], before = JSON.stringify(properties);
  for (const point of [{ x: 5, y: 5 }, { x: 15, y: 70 }, { x: 50, y: 50 }, { x: 0, y: 50 }])
    assert.deepEqual(hitProperty(point, properties), { kind: 'property', id: 'site' });
  assert.equal(hitProperty(null, properties), null);
  assert.equal(hitProperty({ x: 200, y: 200 }, properties), null);
  assert.equal(JSON.stringify(properties), before);
});

test('property hit tolerance is screen-sized; interiors outrank adjacent edges and ties follow paint order', () => {
  const properties = [property('west'), property('east', 102)];
  for (const zoom of [.18, .5, 1, 4, 12]) {
    assert.equal(hitProperty({ x: -2.9 / zoom, y: 50 }, properties, zoom).id, 'west');
    assert.equal(hitProperty({ x: -3.1 / zoom, y: 50 }, properties, zoom), null);
  }
  assert.equal(hitProperty({ x: 99.5, y: 50 }, properties).id, 'west');
  assert.equal(hitProperty({ x: 102.5, y: 50 }, properties).id, 'east');
  assert.equal(hitProperty({ x: 100.5, y: 50 }, properties).id, 'west');
  assert.equal(hitProperty({ x: 101, y: 50 }, properties).id, 'east');
  assert.equal(hitProperty({ x: 50, y: 50 }, [property('bottom'), property('top')]).id, 'top');
});

test('property selection follows visible development layers and rejects concave bounding-box gaps', () => {
  const point = { x: 10, y: 10 }, properties = [property('site')];
  for (const layers of [{}, { buildings: false, properties: true }, { buildings: false, properties: false, plots: true }]) {
    assert.equal(propertySelectionVisible(layers), true);
    assert.equal(hitProperty(point, properties, 1, layers).id, 'site');
  }
  const hidden = { buildings: false, properties: false, plots: false };
  assert.equal(propertySelectionVisible(hidden), false);
  assert.equal(hitProperty(point, properties, 1, hidden), null);
  const concave = { id: 'L', boundary: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 },
    { x: 10, y: 10 }, { x: 10, y: 40 }, { x: 0, y: 40 }] };
  assert.equal(hitProperty({ x: 30, y: 30 }, [concave]), null);
});

test('property building lists resolve only matching two-way references, retaining separate wings', () => {
  const site = property('site');
  const city = { buildings: [{ id: 'west', propertyId: 'site' }, { id: 'east', propertyId: 'site' },
    { id: 'unlisted', propertyId: 'site' }, { id: 'wrong-site', propertyId: 'other' }] };
  site.buildingIds.push('missing', 'wrong-site');
  const before = JSON.stringify({ city, site });
  assert.deepEqual(buildingsOnProperty(city, site).map(b => b.id), ['west', 'east']);
  assert.equal(JSON.stringify({ city, site }), before);
  assert.deepEqual(buildingsOnProperty(city, { id: 'empty', buildingIds: [] }), []);
});

test('property overlays show outer land boundaries and dashed parent context without filling or changing geometry', () => {
  const city = { properties: [property('site')], buildings: [{ id: 'west', propertyId: 'site' }] };
  const before = JSON.stringify(city), strokes = [], dashes = [];
  let paths = 0, saves = 0, restores = 0;
  const ctx = { save() { saves++; }, restore() { restores++; }, beginPath() { paths++; },
    moveTo() {}, lineTo() {}, closePath() {}, setLineDash(dash) { dashes.push(dash); },
    stroke() { strokes.push(this.strokeStyle); }, fill() { assert.fail('Selection must not fill land'); } };
  const camera = { worldToScreen: p => p };
  drawPropertySelection(ctx, camera, city, {}, { kind: 'property', id: 'site' }, { kind: 'property', id: 'site' });
  assert.equal(paths, 1, 'No duplicate selected/hover outline');
  assert.deepEqual(strokes, ['#fff9e5', '#b35f24']);
  drawPropertySelection(ctx, camera, city, {}, { kind: 'building', id: 'west' });
  assert.deepEqual(dashes.at(-1), [6, 4]);
  drawPropertySelection(ctx, camera, city, { buildings: false, properties: false, plots: false }, { kind: 'property', id: 'site' });
  assert.equal(paths, 2);
  assert.equal(saves, restores);
  assert.equal(JSON.stringify(city), before);
});
