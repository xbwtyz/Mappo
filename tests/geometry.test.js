import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject
} from '../src/core/city-model.js';
import {
  insideOrOn
} from '../src/core/boundary.js';
import {
  pointInPolygon,
  polygonSignedArea
} from '../src/core/geometry.js';

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function properCrossing(a, b, c, d) {
  return orient(a, b, c) * orient(a, b, d) < -1e-7 &&
    orient(c, d, a) * orient(c, d, b) < -1e-7;
}

function verifyCityGeometry(city, context) {
  const {
    nodes,
    roads,
    blocks,
    plaza
  } = city;
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
      if (!reached.has(id)) {
        reached.add(id);
        queue.push(id);
      }
    }
  }
  assert.equal(reached.size, nodes.length, `${context}: disconnected road graph`);
  for (const node of nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${context}: invalid coordinate`);
    assert.ok(insideOrOn(node, city.survey.boundary), `${context}: node outside survey`);
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
  assert.ok(plazaPolygon.length >= 4 && polygonSignedArea(plazaPolygon) > 1, `${context}: bad civic plaza`);
  {
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
      const city = createProject({
        seed: `street-${n}`,
        size
      }).city;
      assert.ok(city.roads.length > 45, `${size}/${n}: insufficient roads`);
      assert.ok(city.blocks.length > 15, `${size}/${n}: insufficient blocks`);
      assert.ok(city.buildings.length > 0);
      verifyCityGeometry(city, `${size}/${n}`);
    }
  }
});

test('layout has repeatable graph IDs and geometry and varies with different seeds', () => {
  for (const size of ['small', 'medium', 'large']) {
    const left = createProject({
      seed: 'same-layout',
      size
    });
    const right = createProject({
      seed: 'same-layout',
      size
    });
    assert.deepEqual(left, right);
    assert.notDeepEqual(left.city.nodes, createProject({
      seed: 'changed-layout',
      size
    }).city.nodes);
    assert.equal(left.generatorVersion, '0.1-dev.ui1');
    assert.ok(left.city.blocks[0].vertices.map(id => left.city.nodes.find(node => node.id === id)).every(Boolean));
  }
});

test('all four layouts preserve planar road connectivity and block integrity across 480 varied cities', () => {
  for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
    for (const size of ['small', 'medium', 'large']) {
      for (let n = 0; n < 40; n++) {
        const city = createProject({
          seed: `morph-${n}`,
          size,
          morphology
        }).city;
        assert.ok(city.roads.length > 45, `${morphology}/${size}/${n}: too few streets`);
        assert.ok(city.blocks.length > 15, `${morphology}/${size}/${n}: too few blocks`);
        verifyCityGeometry(city, `${morphology}/${size}/${n}`);
      }
    }
  }
});

test('four distinct city patterns differ in street geometry and external footprint', () => {
  const sample = Object.fromEntries(['radial', 'organic', 'linear', 'planned'].map(morphology => [morphology, createProject({
    seed: 'identity',
    size: 'medium',
    morphology
  }).city]));
  for (const morphology of Object.keys(sample)) {
    const nodes = sample[morphology].nodes;
    const xs = nodes.map(n => n.x),
      ys = nodes.map(n => n.y);
    const ratio = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    if (morphology === 'linear') assert.ok(ratio > 3, `linear layout not elongated: ${ratio}`);
    if (morphology === 'planned') {
      const byId = new Map(nodes.map(n => [n.id, n]));
      const surfaceRoads = sample.planned.roads.filter(r => r.kind !== 'lane' && !r.boundary);
      const axial = surfaceRoads.filter(r => {
        const a = byId.get(r.a),
          b = byId.get(r.b);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        return Math.min(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle))) < 0.17;
      });
      assert.ok(axial.length > surfaceRoads.length * 0.88, 'planned roads not orderly');
    }
  }
  assert.notDeepEqual(sample.radial.nodes, sample.organic.nodes);
  assert.notDeepEqual(sample.linear.nodes, sample.planned.nodes);
  assert.notDeepEqual(sample.radial.survey.boundary, sample.organic.survey.boundary);
});

// Drawn silhouettes deliberately include regions not visible from a single
// center: the regression suite must not rely on star-shaped boundaries.
import {
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  cleanOutline,
  validateBoundary,
  findCityCenter,
  checkNarrowSections,
  segmentCuts,
  clearance
} from '../src/core/boundary.js';

function verifyCoverage(city, context) {
  const byId = new Map(city.nodes.map(n => [n.id, n]));
  const regionArea = Math.abs(polygonSignedArea(city.survey.boundary));
  const faceArea = [...city.blocks, city.plaza].reduce((sum, f) => sum + polygonSignedArea(f.vertices.map(id => byId.get(id))), 0);
  assert.ok(Math.abs(faceArea - regionArea) < .01, `${context}: incomplete or overlapping city coverage: ${faceArea} / ${regionArea}`);
  const roads = new Set(city.roads.map(r => [r.a, r.b].sort().join(':')));
  for (const face of [...city.blocks, city.plaza]) {
    face.vertices.forEach((id, i) => assert.ok(roads.has([id, face.vertices[(i + 1) % face.vertices.length]].sort().join(':')), `${context}: face edge is not a road`));
  }
  for (const road of city.roads) {
    const a = byId.get(road.a),
      b = byId.get(road.b);
    // All edge-boundary intersection intervals, not just endpoint containment.
    const cuts = [0, 1];
    const boundary = city.survey.boundary;
    boundary.forEach((p, i) => cuts.push(...segmentCuts(a, b, p, boundary[(i + 1) % boundary.length])));
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const t = (cuts[i - 1] + cuts[i]) / 2;
      assert.ok(insideOrOn({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      }, boundary), `${context}: road leaves boundary`);
    }
  }
  for (let i = 0; i < city.roads.length; i++)
    for (let j = i + 1; j < city.roads.length; j++) {
      const a = city.roads[i],
        b = city.roads[j];
      if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
      assert.equal(segmentCuts(byId.get(a.a), byId.get(a.b), byId.get(b.a), byId.get(b.b)).length, 0, `${context}: unshared junction or overlapping streets`);
    }
}

test('drawn concave, branching, twin, wedge and horseshoe cities stay planar and cover their exact outline across 96 configurations', () => {
  let count = 0;
  for (const preset of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const size of ['small', 'medium', 'large'])
      for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
        const boundary = makeStartingOutline(preset, 'drawn-shape', 'medium');
        const city = createProject({
          boundary,
          morphology,
          size,
          seed: 'drawn-shape'
        }).city;
        assert.deepEqual(city.survey.boundary, cleanOutline(boundary, 0), 'Outline changed during generation');
        verifyCityGeometry(city, `${preset}/${size}/${morphology}`);
        verifyCoverage(city, `${preset}/${size}/${morphology}`);
        count++;
      }
  assert.equal(count, 96);
});

test('custom boundary and chosen center survive density, pattern and seed changes', () => {
  const boundary = makeStartingOutline('crescent', 'custom', 'medium'),
    center = {
      x: -280,
      y: 120
    };
  const base = {
    boundary,
    center,
    seed: 'kept',
    morphology: 'organic',
    size: 'medium'
  };
  const a = createProject(base),
    b = createProject({
      ...base,
      seed: 'new'
    }),
    c = createProject({
      ...base,
      size: 'large'
    }),
    d = createProject({
      ...base,
      morphology: 'radial'
    });
  for (const project of [a, b, c, d]) {
    assert.deepEqual(project.options.boundary, boundary);
    assert.deepEqual(project.options.center, center);
    assert.deepEqual(project.city.plaza.center, center);
    const nodes = new Map(project.city.nodes.map(n => [n.id, n]));
    assert.ok(pointInPolygon(center, project.city.plaza.vertices.map(id => nodes.get(id))));
  }
  assert.notDeepEqual(a.city.nodes, b.city.nodes);
  assert.ok(c.city.blocks.length > a.city.blocks.length);
  assert.notDeepEqual(a.city.roads, d.city.roads);
  assert.deepEqual(a, createProject(base));
  assert.deepEqual(a, createProject(a.options.seed ? {
    ...a.options,
    seed: a.seed
  } : base));
});

test('invalid outlines and unsuitable town centers fail with actionable messages', () => {
  assert.throws(() => validateBoundary([{
    x: 0,
    y: 0
  }, {
    x: 200,
    y: 200
  }, {
    x: 0,
    y: 200
  }, {
    x: 200,
    y: 0
  }]), /crosses|touches/);
  assert.throws(() => validateBoundary([{
    x: 0,
    y: 0
  }, {
    x: 10,
    y: 0
  }, {
    x: 10,
    y: 10
  }]), /larger/);
  assert.throws(() => validateBoundary([{
    x: 0,
    y: 0
  }, {
    x: NaN,
    y: 0
  }, {
    x: 100,
    y: 100
  }]), /invalid coordinates/);
  const boundary = makeStartingOutline('twin', 'center', 'medium');
  assert.throws(() => createProject({
    boundary,
    center: {
      x: 900,
      y: 900
    }
  }), /inside the outline/);
  assert.throws(() => createProject({
    boundary,
    center: {
      x: -525,
      y: 0
    }
  }), /18 units/);
  const thin = [
    [-300, -100],
    [-50, -100],
    [-50, -5],
    [50, -5],
    [50, -100],
    [300, -100],
    [300, 100],
    [50, 100],
    [50, 5],
    [-50, 5],
    [-50, 100],
    [-300, 100]
  ].map(([x, y]) => ({
    x,
    y
  }));
  assert.throws(() => checkNarrowSections(thin), /too narrow/);
  const clockwise = makeStartingOutline('wedge', 'reverse', 'medium').reverse();
  assert.ok(polygonSignedArea(cleanOutline(clockwise, 0)) > 0);
  assert.ok(clearance(findCityCenter(boundary), boundary) > 18);
});

test('all former profile extremes have proper junctions, coverage and valid blocks', () => {
  for (const morphology of ['radial', 'organic', 'linear', 'planned'])
    for (const profile of ['balanced', 'wedge', 'crescent', 'twin', 'branching'])
      for (const extremes of [0, 100]) {
        const city = createProject({
          seed: 'profile-crossing-regression',
          morphology,
          shapeOptions: {
            profile,
            stretch: extremes,
            asymmetry: extremes,
            bend: extremes
          }
        }).city;
        verifyCityGeometry(city, `${morphology}/${profile}/${extremes}`);
        verifyCoverage(city, `${morphology}/${profile}/${extremes}`);
      }
});

test('rotated, translated and perturbed user outlines retain valid topology across 48 additional configurations', () => {
  for (const preset of ['twin', 'branching', 'crescent'])
    for (let n = 0; n < 16; n++) {
      const angle = n * .39,
        ca = Math.cos(angle),
        sa = Math.sin(angle);
      const boundary = makeStartingOutline(preset, 'transforms', 'medium').map((p, i) => {
        const x = p.x + Math.sin(i * 7 + n) * 4,
          y = p.y + Math.cos(i * 5 + n) * 4;
        return {
          x: x * ca - y * sa + 230,
          y: x * sa + y * ca - 170
        };
      });
      const morphology = ['radial', 'organic', 'linear', 'planned'][n % 4];
      const city = createProject({
        boundary,
        morphology,
        seed: `drawn-${n}`,
        size: ['small', 'medium', 'large'][n % 3]
      }).city;
      verifyCityGeometry(city, `${preset}/transformed/${n}`);
      verifyCoverage(city, `${preset}/transformed/${n}`);
    }
});
