import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { pointInPolygon, polygonSignedArea } from '../src/core/geometry.js';

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function properCrossing(a, b, c, d) {
  return orient(a, b, c) * orient(a, b, d) < -1e-7 &&
    orient(c, d, a) * orient(c, d, b) < -1e-7;
}

function verifyCityGeometry(city, context, checkCrossings) {
  const { nodes, roads, blocks, plaza } = city;
  const byId = new Map(nodes.map(node => [node.id, node]));
  assert.equal(byId.size, nodes.length, `${context}: duplicate node id`);
  assert.equal(new Set(roads.map(road => road.id)).size, roads.length, `${context}: duplicate road id`);
  assert.equal(new Set(blocks.map(block => block.id)).size, blocks.length, `${context}: duplicate block id`);
  const graph = new Map(nodes.map(node => [node.id, []]));
  const roadPairs = new Set();
  for (const road of roads) {
    assert.ok(['primary', 'secondary', 'lane'].includes(road.kind), `${context}: road kind`);
    assert.ok(byId.has(road.a) && byId.has(road.b), `${context}: bad road endpoint`);
    assert.notEqual(road.a, road.b, `${context}: zero-length road`);
    const key = [road.a, road.b].sort().join(':');
    assert.ok(!roadPairs.has(key), `${context}: duplicate road segment ${key}`);
    roadPairs.add(key);
    graph.get(road.a).push(road.b);
    graph.get(road.b).push(road.a);
  }
  const reached = new Set([nodes[0].id]);
  const queue = [nodes[0].id];
  for (let i = 0; i < queue.length; i++) {
    for (const id of graph.get(queue[i])) {
      if (!reached.has(id)) { reached.add(id); queue.push(id); }
    }
  }
  assert.equal(reached.size, nodes.length, `${context}: disconnected road graph`);
  for (const node of nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${context}: invalid coordinate`);
    assert.ok(pointInPolygon(node, city.survey.boundary), `${context}: node outside survey`);
  }
  for (const block of blocks) {
    const polygon = block.vertices.map(id => byId.get(id));
    assert.ok(polygon.every(Boolean), `${context}: missing block vertices`);
    assert.ok(polygonSignedArea(polygon) > 1, `${context}: bad block winding`);
    assert.ok(Math.abs(block.area - polygonSignedArea(polygon)) < 0.006, `${context}: area mismatch`);
    assert.ok(new Set(block.vertices).size === block.vertices.length, `${context}: repeated vertex`);
    for (let i = 0; i < polygon.length; i++) {
      for (let j = i + 2; j < polygon.length; j++) {
        if (i === 0 && j === polygon.length - 1) continue;
        assert.ok(!properCrossing(polygon[i], polygon[(i + 1) % polygon.length],
          polygon[j], polygon[(j + 1) % polygon.length]), `${context}: self-crossing block`);
      }
    }
  }
  const plazaPolygon = plaza.vertices.map(id => byId.get(id));
  assert.ok(plazaPolygon.length >= 8 && polygonSignedArea(plazaPolygon) > 1, `${context}: bad civic plaza`);
  if (checkCrossings) {
    for (let i = 0; i < roads.length; i++) {
      const a = roads[i];
      for (let j = i + 1; j < roads.length; j++) {
        const b = roads[j];
        if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
        assert.ok(!properCrossing(byId.get(a.a), byId.get(a.b), byId.get(b.a), byId.get(b.b)),
          `${context}: non-junction road crossing (${a.id} / ${b.id})`);
      }
    }
  }
}

test('layout produces a connected planar road graph and real blocks for 360 diverse city seeds', () => {
  for (const size of ['small', 'medium', 'large']) {
    for (let n = 0; n < 120; n++) {
      const city = createProject({ seed: `street-${n}`, size }).city;
      assert.ok(city.roads.length > 45, `${size}/${n}: insufficient roads`);
      assert.ok(city.blocks.length > 15, `${size}/${n}: insufficient blocks`);
      assert.equal(city.buildings.length, 0);
      verifyCityGeometry(city, `${size}/${n}`, true);
    }
  }
});

test('layout has repeatable graph IDs and geometry and varies with different seeds', () => {
  for (const size of ['small', 'medium', 'large']) {
    const left = createProject({ seed: 'same-layout', size });
    const right = createProject({ seed: 'same-layout', size });
    assert.deepEqual(left, right);
    assert.notDeepEqual(left.city.nodes, createProject({ seed: 'changed-layout', size }).city.nodes);
    assert.equal(left.generatorVersion, '0.1-dev.2');
    assert.deepEqual(left.city.blocks[0].vertices.map(id => left.city.nodes.find(node => node.id === id)).every(Boolean), true);
  }
});
