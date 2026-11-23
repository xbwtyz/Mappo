import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject
} from '../src/core/city-model.js';
import {
  generateLayout
} from '../src/generators/layout.js';
import {
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  polygonSignedArea,
  pointInPolygon
} from '../src/core/geometry.js';
import {
  insideOrOn,
  distanceToSegment,
  segmentCuts
} from '../src/core/boundary.js';
import {
  STREET_WIDTHS,
  STREET_EDGE_WIDTH,
  PROPERTY_SETBACK,
  clipToConvexPolygon,
  rectanglesOverlap,
  propertyFits
} from '../src/core/placement.js';
import {
  validateDevelopment
} from '../src/core/validate-development.js';

function assertSimple(points, context) {
  assert.ok(polygonSignedArea(points) > 1, `${context}: nonpositive footprint`);
  for (let i = 0; i < points.length; i++)
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      assert.equal(segmentCuts(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length]).length, 0, `${context}: self intersection`);
    }
}

function assertDevelopment(city, context) {
  const nodes = new Map(city.nodes.map(n => [n.id, n])),
    plots = new Map(city.plots.map(p => [p.id, p]));
  const roads = new Map(city.roads.map(r => [r.id, r]));
  const blocks = new Map(city.blocks.map(b => [b.id, b]));
  const props = new Map(city.properties.map(p => [p.id, p]));
  const buildingIds = new Set(city.buildings.map(b => b.id));
  assert.equal(plots.size, city.plots.length);
  assert.equal(props.size, city.properties.length);
  assert.equal(buildingIds.size, city.buildings.length);
  const allocated = new Set(),
    grouped = new Map();
  for (const p of city.properties) {
    const block = blocks.get(p.blockId);
    assert.ok(block, context);
    assertSimple(p.boundary, context);
    assert.ok(roads.has(p.frontageRoadId));
    const polygon = block.vertices.map(id => nodes.get(id));
    assert.ok(p.boundary.every(v => pointInPolygon(v, polygon)), `${context}: property outside block`);
    let plotArea = 0;
    for (const id of p.plotIds) {
      const plot = plots.get(id);
      assert.ok(plot);
      assert.equal(plot.propertyId, p.id);
      assert.equal(plot.blockId, p.blockId);
      assert.ok(!allocated.has(id));
      allocated.add(id);
      assert.ok(plot.boundary.every(v => insideOrOn(v, p.boundary)));
      plotArea += polygonSignedArea(plot.boundary);
    }
    assert.ok(Math.abs(plotArea - p.area) < 1e-5, `${context}: property is not a union of its plots`);
    const neighbors = grouped.get(p.blockId) || [];
    for (const neighbor of neighbors) {
      const intersection = clipToConvexPolygon(p.boundary, neighbor.boundary);
      assert.ok(Math.abs(polygonSignedArea(intersection)) < 1e-5, `${context}: overlapping properties`);
    }
    neighbors.push(p);
    grouped.set(p.blockId, neighbors);
    for (let i = 0; i < block.vertices.length; i++) {
      const a = nodes.get(block.vertices[i]),
        b = nodes.get(block.vertices[(i + 1) % block.vertices.length]);
      const road = city.roads.find(r => (r.a === a.id && r.b === b.id) || (r.a === b.id && r.b === a.id));
      const required = (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2 + PROPERTY_SETBACK;
      for (let j = 0; j < p.boundary.length; j++) {
        const c = p.boundary[j],
          d = p.boundary[(j + 1) % p.boundary.length];
        assert.equal(segmentCuts(a, b, c, d).length, 0, `${context}: property crosses street`);
        const gap = Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
        assert.ok(gap >= required - 1e-5, `${context}: property encroaches on street width`);
      }
    }
    assert.ok(p.buildingIds.length > 0 && p.buildingIds.every(id => buildingIds.has(id)));
  }
  assert.equal(allocated.size, plots.size, `${context}: orphan plot`);
  for (const b of city.buildings) {
    const p = props.get(b.propertyId);
    assert.ok(p);
    assertSimple(b.footprint, context);
    assert.ok(b.footprint.every(v => insideOrOn(v, p.boundary)));
    assert.ok(b.plotIds.length);
    const actualPlotIds = p.plotIds.filter(id => {
      const plot = plots.get(id),
        area = Math.abs(polygonSignedArea(clipToConvexPolygon(b.footprint, plot.boundary))) - b.holes.reduce((s, h) => s + Math.abs(polygonSignedArea(clipToConvexPolygon(h, plot.boundary))), 0);
      return area > 1e-5;
    });
    if (b.shape === 'terrace-house') assert.equal(b.plotIds.length, 1, `${context}: attached house crosses its plot division`);
    assert.deepEqual(b.plotIds, actualPlotIds, `${context}: incorrect building-to-plot references`);
    let area = polygonSignedArea(b.footprint);
    for (const hole of b.holes) {
      assertSimple(hole, context);
      assert.ok(hole.every(v => pointInPolygon(v, b.footprint)));
      area -= polygonSignedArea(hole);
    }
    assert.ok(area > 1);
    assert.ok(Math.abs(area - b.area) < 1e-5);
    const road = roads.get(b.frontageRoadId),
      ra = nodes.get(road.a),
      rb = nodes.get(road.b);
    assert.ok(distanceToSegment(b.accessPath.at(-1), ra, rb) < 1e-6, `${context}: entrance path misses frontage street`);
    // A front entrance can be reached from the street without crossing another
    // building. Shared walls in attached rows are allowed; positive overlap isn't.
    for (const otherId of p.buildingIds) {
      const other = city.buildings.find(q => q.id === otherId);
      if (other.id === b.id) continue;
      const overlap = clipToConvexPolygon(b.footprint, other.footprint);
      assert.ok(Math.abs(polygonSignedArea(overlap)) < 1e-5, `${context}: compound buildings overlap`);
      const middle = {
        x: (b.accessPath[0].x + b.accessPath[1].x) / 2,
        y: (b.accessPath[0].y + b.accessPath[1].y) / 2
      };
      assert.ok(!pointInPolygon(middle, other.footprint), `${context}: entrance blocked`);
    }
  }
  const usedArea = city.properties.reduce((s, p) => s + p.area, 0),
    blockArea = city.blocks.reduce((s, b) => s + b.area, 0),
    open = city.openSpaces.reduce((s, p) => s + p.area, 0);
  assert.ok(Math.abs(blockArea - usedArea - open) < .02);
  assert.ok(open > blockArea * .1, `${context}: no open ground left`);
  assert.ok(city.districts.length > 0);
  assert.equal(city.walls.length, 0);
}

test('buildings fit their properties and streets across 96 outline, density and pattern combinations', () => {
  let count = 0;
  for (const preset of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const size of ['small', 'medium', 'large'])
      for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
        const city = createProject({
          seed: 'building-stress',
          boundary: makeStartingOutline(preset, 'building-stress', 'medium'),
          size,
          morphology
        }).city;
        assertDevelopment(city, `${preset}/${size}/${morphology}`);
        assert.ok(city.buildings.length > 20);
        count++;
      }
  assert.equal(count, 96);
});

test('default cities include real multi-plot buildings, courtyard sites, compounds, L shapes, attached rows and open ground', () => {
  for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
    const city = createProject({
      seed: 'mappo-001',
      morphology
    }).city;
    assert.ok(city.properties.some(p => p.plotIds.length >= 3));
    assert.ok(city.buildings.some(b => b.plotIds.length >= 2));
    for (const shape of ['rectangle', 'L', 'courtyard', 'compound-wing', 'terrace-house']) assert.ok(city.buildings.some(b => b.shape === shape), `${morphology}: missing ${shape}`);
    const areas = city.buildings.map(b => b.area);
    assert.ok(Math.max(...areas) > Math.min(...areas) * 5);
    assert.ok(city.properties.some(p => p.buildingIds.length > 1));
    assertDevelopment(city, morphology);
  }
});

test('development is deterministic, data is independent of rendering, and streets are unchanged by population', () => {
  const options = {
    seed: 'stable-buildings',
    morphology: 'organic',
    boundary: makeStartingOutline('twin', 'stable-buildings', 'medium')
  };
  const a = createProject(options),
    b = createProject(options);
  assert.deepEqual(a, b);
  const layout = generateLayout(a.seed, a.options.size, a.city.survey, a.options.morphology);
  for (const key of ['nodes', 'roads', 'plaza']) assert.deepEqual(a.city[key], layout[key]);
  assert.deepEqual(a.city.blocks.map(({
    districtId,
    ...block
  }) => block), layout.blocks);
  assert.deepEqual(a, createProject({
    ...a.options,
    seed: a.seed
  }));
  assert.notDeepEqual(a.city.buildings, createProject({
    ...options,
    seed: 'another-buildings-seed'
  }).city.buildings);
});

test('placement primitives reject street encroachment, concave notches and overlapping property envelopes', () => {
  const outer = [{
    x: 0,
    y: 0
  }, {
    x: 100,
    y: 0
  }, {
    x: 100,
    y: 100
  }, {
    x: 60,
    y: 100
  }, {
    x: 60,
    y: 40
  }, {
    x: 40,
    y: 40
  }, {
    x: 40,
    y: 100
  }, {
    x: 0,
    y: 100
  }];
  const edges = outer.map((a, i) => ({
    a,
    b: outer[(i + 1) % outer.length],
    road: {
      kind: 'primary'
    }
  }));
  assert.equal(propertyFits([{
    x: 10,
    y: 10
  }, {
    x: 30,
    y: 10
  }, {
    x: 30,
    y: 30
  }, {
    x: 10,
    y: 30
  }], outer, edges), true);
  assert.equal(propertyFits([{
    x: 10,
    y: 50
  }, {
    x: 90,
    y: 50
  }, {
    x: 90,
    y: 70
  }, {
    x: 10,
    y: 70
  }], outer, edges), false);
  assert.equal(propertyFits([{
    x: 1,
    y: 1
  }, {
    x: 30,
    y: 1
  }, {
    x: 30,
    y: 30
  }, {
    x: 1,
    y: 30
  }], outer, edges), false);
  const square = [{
      x: 0,
      y: 0
    }, {
      x: 10,
      y: 0
    }, {
      x: 10,
      y: 10
    }, {
      x: 0,
      y: 10
    }],
    adjacent = square.map(p => ({
      x: p.x + 10,
      y: p.y
    }));
  assert.equal(rectanglesOverlap(square, adjacent), false);
  assert.equal(rectanglesOverlap(square, adjacent, 1), true);
  assert.equal(polygonSignedArea(clipToConvexPolygon(square, square)), 100);
});

test('runtime development validation rejects overlapping properties and broken plot or footprint references', () => {
  const city = createProject({
    seed: 'validation-development',
    morphology: 'planned'
  }).city;
  const clone = () => structuredClone(city);
  const overlapping = clone(),
    [a, b] = overlapping.properties.filter(p => p.blockId === overlapping.properties[0].blockId);
  assert.ok(a && b);
  b.boundary = a.boundary.map(p => ({
    ...p
  }));
  assert.throws(() => validateDevelopment(overlapping, overlapping), /overlap/);
  const broken = clone();
  broken.buildings[0].plotIds = ['unknown'];
  assert.throws(() => validateDevelopment(broken, broken), /invalid property or plot/);
  const escaped = clone();
  escaped.buildings[0].geometry.regions[0].ring[0] = {
    x: 9000,
    y: 9000
  };
  assert.throws(() => validateDevelopment(escaped, escaped), /outside its property/);
});
