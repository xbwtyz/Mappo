import test from 'node:test';
import assert from 'node:assert/strict';
import { hitBuilding } from '../src/core/building-selection.js';
import { drawBuildingSelection } from '../src/renderer/building-selection.js';

const rectangle = (x, y, width, height = width) => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }
];
const roof = (id, x = 0, width = 20) => ({ id, footprint: rectangle(x, 0, width), holes: [] });

test('building hits respect roof boundaries, courtyard interiors and independently selectable compound wings', () => {
  const courtyard = { ...roof('court', 0, 100), holes: [rectangle(20, 20, 60)] };
  const wings = [roof('west', 120), roof('east', 150)];
  const buildings = [courtyard, ...wings];
  const original = JSON.stringify(buildings);
  for (const point of [{ x: 10, y: 10 }, { x: 0, y: 50 }, { x: 20, y: 50 }])
    assert.equal(hitBuilding(point, buildings).id, 'court');
  for (const zoom of [.18, .5, 1, 4, 12]) {
    assert.equal(hitBuilding({ x: 50, y: 50 }, buildings, zoom), null);
    assert.equal(hitBuilding({ x: 20.01, y: 50 }, buildings, zoom), null, 'Tolerance never fills a courtyard');
  }
  assert.equal(hitBuilding({ x: 130, y: 10 }, buildings).id, 'west');
  assert.equal(hitBuilding({ x: 160, y: 10 }, buildings).id, 'east');
  assert.equal(hitBuilding(null, buildings), null);
  assert.equal(hitBuilding({ x: 10, y: 10 }, buildings, 1, { buildings: false }), null);
  assert.equal(JSON.stringify(buildings), original);
});

test('roof interiors beat nearby outlines; closest edges and renderer paint order break ties', () => {
  const buildings = [roof('west'), roof('east', 22)];
  assert.equal(hitBuilding({ x: 19.5, y: 10 }, buildings).id, 'west');
  assert.equal(hitBuilding({ x: 22.5, y: 10 }, buildings).id, 'east');
  assert.equal(hitBuilding({ x: 20.5, y: 10 }, buildings).id, 'west');
  assert.equal(hitBuilding({ x: 21.5, y: 10 }, buildings).id, 'east');
  assert.equal(hitBuilding({ x: 21, y: 10 }, buildings).id, 'east');
  assert.equal(hitBuilding({ x: 10, y: 10 }, [...buildings, roof('topmost')]).id, 'topmost');
});

test('three screen-pixel tolerance stays consistent through the supported zoom range', () => {
  for (const zoom of [.18, .5, 1, 4, 12]) {
    assert.equal(hitBuilding({ x: -2.9 / zoom, y: 10 }, [roof('one')], zoom).id, 'one');
    assert.equal(hitBuilding({ x: -3.1 / zoom, y: 10 }, [roof('one')], zoom), null);
  }
});

test('hit testing uses the actual concave or rotated footprint rather than its bounding box', () => {
  const concave = { id: 'L', holes: [], footprint: [
    { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 },
    { x: 10, y: 10 }, { x: 10, y: 40 }, { x: 0, y: 40 }
  ] };
  assert.equal(hitBuilding({ x: 30, y: 30 }, [concave]), null);
  assert.equal(hitBuilding({ x: 5, y: 30 }, [concave]).id, 'L');
  const diamond = { id: 'diamond', holes: [], footprint: [
    { x: 0, y: -20 }, { x: 20, y: 0 }, { x: 0, y: 20 }, { x: -20, y: 0 }
  ] };
  assert.equal(hitBuilding({ x: 0, y: 0 }, [diamond]).id, 'diamond');
  assert.equal(hitBuilding({ x: 18, y: 18 }, [diamond]), null);
});

test('building overlays trace holes, distinguish hover and selection, and never fill or mutate roofs', () => {
  const courtyard = { ...roof('court'), holes: [rectangle(5, 5, 10)] };
  const buildings = [courtyard, roof('other', 30)];
  const before = JSON.stringify(buildings), strokes = [], paths = [];
  let closes = 0, saves = 0, restores = 0;
  const ctx = {
    save() { saves++; }, restore() { restores++; }, beginPath() {},
    moveTo(x, y) { paths.push([x, y]); }, lineTo() {}, closePath() { closes++; },
    setLineDash() {}, stroke() { strokes.push([this.strokeStyle, this.lineWidth]); },
    fill() { assert.fail('Selection must never fill the footprint'); }
  };
  const camera = { worldToScreen: p => ({ x: p.x * 2, y: p.y * 2 }) };
  drawBuildingSelection(ctx, camera, buildings, {}, { kind: 'building', id: 'court' }, { kind: 'building', id: 'other' });
  assert.equal(closes, 3);
  assert.equal(saves, restores);
  assert.deepEqual(strokes.map(s => s[0]), ['#fff9e5', '#297a87', '#fff9e5', '#b35f24']);
  assert.deepEqual(paths, [[60, 0], [0, 0], [10, 10]]);
  const count = strokes.length;
  drawBuildingSelection(ctx, camera, buildings, { buildings: false }, { kind: 'building', id: 'court' });
  drawBuildingSelection(ctx, camera, buildings, {}, { kind: 'building', id: 'missing' });
  assert.equal(strokes.length, count);
  drawBuildingSelection(ctx, camera, buildings, {}, { kind: 'building', id: 'court' }, { kind: 'building', id: 'court' });
  assert.equal(strokes.length, count + 2, 'Selected roof does not get a duplicate hover outline');
  assert.equal(JSON.stringify(buildings), before);
});
