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
  generateFortifications,
  FORTIFICATION_BUILDERS
} from '../src/generators/fortifications.js';
import {
  validateFortifications,
  setFortificationsEnabled,
  fortificationViewPoints
} from '../src/core/fortification-model.js';
import {
  measureWall,
  wallPoint,
  solidWallSegments,
  WALL_CLEARANCE,
  WALL_EDGE_WIDTH
} from '../src/core/fortification-geometry.js';
import {
  gatePosts
} from '../src/core/gate-geometry.js';
import {
  pointInPolygon,
  polygonSignedArea
} from '../src/core/geometry.js';
import {
  distanceToSegment,
  segmentCuts
} from '../src/core/boundary.js';
import {
  segmentDistance,
  STREET_WIDTHS,
  STREET_EDGE_WIDTH
} from '../src/core/placement.js';
import {
  FortificationEditor
} from '../src/editor/fortifications.js';
import {
  createProjectDocument,
  encodeProjectDocument,
  decodeProjectDocument,
  defaultWorkspace,
  copyJson
} from '../src/data/project-format.js';

function assertOriginalCity(before, after) {
  for (const key of Object.keys(before).filter(key => !['walls', 'gates', 'towers', 'fortificationState'].includes(key))) assert.deepEqual(after[key], before[key], `${key} was changed by fortifications`);
  for (const key of ['nodes', 'roads', 'blocks', 'properties', 'buildings', 'districts', 'plots']) assert.equal(after[key], before[key], `${key} was regenerated`);
}

function assertWallGeometry(city, context) {
  validateFortifications(city);
  assert.equal(city.walls.length, 1);
  assert.ok(city.gates.length > 0 && city.gates.length <= city.fortificationState.requestedGateCount);
  const wall = city.walls[0],
    measure = measureWall(wall.path),
    nodes = new Map(city.nodes.map(n => [n.id, n]));
  assert.ok(polygonSignedArea(wall.path) > 0);
  assert.ok(city.survey.boundary.every(p => pointInPolygon(p, wall.path)), `${context}: city not enclosed`);
  for (let i = 0; i < wall.path.length; i++)
    for (let j = i + 2; j < wall.path.length; j++) {
      if (i === 0 && j === wall.path.length - 1) continue;
      assert.equal(segmentCuts(wall.path[i], wall.path[(i + 1) % wall.path.length], wall.path[j], wall.path[(j + 1) % wall.path.length]).length, 0, `${context}: crossing walls`);
    }
  const sections = solidWallSegments(wall, city.gates);
  assert.ok(Math.abs(sections.reduce((sum, s) => sum + Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y), 0) - (measure.length - city.gates.reduce((s, g) => s + g.opening, 0))) < 1e-4, `${context}: gate cuts do not match the wall openings`);
  for (const section of sections)
    for (const road of city.roads) {
      const gap = segmentDistance(section.a, section.b, nodes.get(road.a), nodes.get(road.b));
      assert.ok(gap > (wall.width + WALL_EDGE_WIDTH + STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2, `${context}: wall blocks street`);
    }
  for (const gate of city.gates) {
    const start = nodes.get(gate.connection.cityNodeId);
    assert.deepEqual(gate.connection.points[0], {
      x: start.x,
      y: start.y
    });
    assert.ok(!pointInPolygon(gate.connection.points.at(-1), wall.path));
    const at = wallPoint(measure, gate.arc);
    assert.ok(Math.hypot(at.x - gate.center.x, at.y - gate.center.y) < 1e-5);
    for (let i = 0; i < gate.connection.points.length - 1; i++)
      for (const section of sections) assert.ok(segmentDistance(gate.connection.points[i], gate.connection.points[i + 1], section.a, section.b) > (gate.connection.width + STREET_EDGE_WIDTH + wall.width + WALL_EDGE_WIDTH) / 2, `${context}: gate is blocked`);
    for (const post of gatePosts(gate, measure)) assert.ok(!pointInPolygon(post, city.survey.boundary));
  }
  for (const tower of city.towers) {
    assert.ok(!pointInPolygon(tower.center, city.survey.boundary));
    for (const road of city.roads) assert.ok(distanceToSegment(tower.center, nodes.get(road.a), nodes.get(road.b)) > tower.radius + (STREET_WIDTHS[road.kind] + STREET_EDGE_WIDTH) / 2, `${context}: tower blocks street`);
  }
}

test('safe exterior walls and connected gates work across 96 outline, density and street configurations', () => {
  let count = 0;
  for (const shape of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const size of ['small', 'medium', 'large'])
      for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
        const city = createProject({
          seed: 'wall-stress',
          size,
          morphology,
          boundary: makeStartingOutline(shape, 'wall-stress', 'medium')
        }).city;
        const next = generateFortifications(city, {
          seed: 'wall-stress',
          gateCount: 4,
          towerSpacing: 100
        });
        assertOriginalCity(city, next);
        assertWallGeometry(next, `${shape}/${size}/${morphology}`);
        count++;
      }
  assert.equal(count, 96);
});

test('fortification settings are deterministic, flexible and independently rebuildable', () => {
  const city = createProject({
    seed: 'wall-settings',
    morphology: 'planned'
  }).city;
  const a = generateFortifications(city, {
      seed: 'same',
      gateCount: 4,
      towerSpacing: 100
    }),
    b = generateFortifications(city, {
      seed: 'same',
      gateCount: 4,
      towerSpacing: 100
    });
  assert.deepEqual(a, b);
  const sparse = generateFortifications(city, {
      seed: 'same',
      gateCount: 4,
      towerSpacing: 180
    }),
    dense = generateFortifications(city, {
      seed: 'same',
      gateCount: 4,
      towerSpacing: 40
    });
  assert.ok(dense.towers.length > sparse.towers.length);
  const extra = generateFortifications(city, {
    seed: 'same',
    gateCount: 8
  });
  assert.equal(extra.fortificationState.requestedGateCount, 8);
  assert.ok(extra.gates.length <= 8);
  assert.ok(extra.gates.length >= a.gates.length);
  assert.notDeepEqual(generateFortifications(city, {
    seed: 'other'
  }).gates, a.gates);
  assert.ok(Object.hasOwn(FORTIFICATION_BUILDERS, 'outer-perimeter-v1'));
  assert.throws(() => generateFortifications(city, {
    gateCount: 9
  }), /1–8/);
  assert.throws(() => generateFortifications(city, {
    towerSpacing: 5
  }), /40–200/);
});

test('disabling and re-enabling retain fortification geometry, IDs and future metadata', () => {
  const city = generateFortifications(createProject({
    seed: 'wall-toggle'
  }).city, {
    seed: 'toggle'
  });
  city.walls[0].extensions.futureMaterial = 'stone';
  city.gates[0].name = 'Copper Gate';
  const off = setFortificationsEnabled(city, false);
  assert.equal(off.walls, city.walls);
  assert.equal(off.gates, city.gates);
  assert.equal(off.towers, city.towers);
  assert.equal(off.fortificationState.enabled, false);
  assert.equal(fortificationViewPoints(off), off.survey.boundary);
  const on = setFortificationsEnabled(off, true);
  assert.equal(on.walls, city.walls);
  assert.equal(on.gates[0].name, 'Copper Gate');
  assert.equal(on.walls[0].extensions.futureMaterial, 'stone');
  assert.ok(fortificationViewPoints(on).length > on.survey.boundary.length);
  const editor = new FortificationEditor();
  const disabled = editor.apply(city, {
    enabled: false,
    gateCount: '',
    towerSpacing: ''
  });
  assert.equal(disabled.fortificationState.enabled, false);
  assert.deepEqual(editor.undo(disabled), copyJson(city));
});

test('gate cuts wrap cleanly around the end of a closed wall', () => {
  const wall = {
    id: 'W',
    width: 6,
    path: [{
      x: 0,
      y: 0
    }, {
      x: 100,
      y: 0
    }, {
      x: 100,
      y: 100
    }, {
      x: 0,
      y: 100
    }]
  };
  const gates = [{
    wallId: 'W',
    arc: 0,
    opening: 30
  }, {
    wallId: 'W',
    arc: 200,
    opening: 20
  }];
  const sections = solidWallSegments(wall, gates);
  assert.ok(Math.abs(sections.reduce((s, p) => s + Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y), 0) - 350) < 1e-8);
  assert.deepEqual(wallPoint(measureWall(wall.path), -10), {
    x: 0,
    y: 10
  });
});

test('wall, gate and tower corruption is rejected before it can block or detach from the city', () => {
  const city = generateFortifications(createProject({
    seed: 'wall-invalid'
  }).city, {
    seed: 'invalid'
  });
  let bad = copyJson(city);
  bad.walls[0].path[0] = {
    ...bad.survey.boundary[0]
  };
  assert.throws(() => validateFortifications(bad), /wall|Wall/);
  bad = copyJson(city);
  bad.gates[0].connection.cityNodeId = 'missing';
  assert.throws(() => validateFortifications(bad), /street graph/);
  bad = copyJson(city);
  bad.towers[0].arc = bad.gates[0].arc;
  bad.towers[0].center = {
    ...bad.gates[0].center
  };
  assert.throws(() => validateFortifications(bad), /gate|Gate/);
  bad = copyJson(city);
  bad.gates[0].connection.points[2] = {
    ...bad.gates[0].center
  };
  assert.throws(() => validateFortifications(bad), /exit|blocked/);
  bad = copyJson(city);
  bad.walls[0].path.splice(1, 0, {
    ...bad.walls[0].path[0]
  });
  assert.throws(() => validateFortifications(bad), /simple|cross/);
  bad = copyJson(city);
  bad.towers[0].kind = 'future-square';
  assert.throws(() => validateFortifications(bad), /Unsupported/);
});

test('fortifications and their undo history round-trip through native project files', () => {
  const project = createProject({
      seed: 'wall-save'
    }),
    editor = new FortificationEditor();
  project.city = editor.apply(project.city, {
    seed: 'save',
    gateCount: 3,
    towerSpacing: 80
  });
  const first = project.city;
  project.city = editor.apply(project.city, {
    seed: 'save',
    gateCount: 5,
    towerSpacing: 140
  });
  const workspace = defaultWorkspace(project);
  workspace.fortificationEditor = {
    ...editor.snapshot(),
    controls: {
      enabled: true,
      gateCount: '5',
      towerSpacing: '140',
      seed: 'save'
    }
  };
  const document = createProjectDocument(project, workspace),
    loaded = decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(loaded, document);
  const restored = new FortificationEditor();
  restored.load(loaded.workspace.fortificationEditor);
  assert.deepEqual(restored.undo(loaded.project.city), copyJson(first));
});

test('native 3C projects migrate without adding defenses or changing district and city data', async () => {
  const raw = JSON.parse(await readFile(new URL('./fixtures/save-3c-format1-schema3.json', import.meta.url), 'utf8'));
  const loaded = decodeProjectDocument(JSON.stringify(raw));
  assert.equal(loaded.project.schemaVersion, 8);
  assert.deepEqual(loaded.project.city.fortificationState, {
    version: 1,
    status: 'unbuilt',
    enabled: false
  });
  const {
    waterState,
    waterFeatures,
    waterFaces,
    bridges,
    fortificationState,
    gates,
    towers,
    ...city
  } = loaded.project.city;
  assert.deepEqual(city, raw.project.city);
  assert.deepEqual(loaded.workspace, raw.workspace);
  assert.equal(loaded.documentId, raw.documentId);
  const built = generateFortifications(loaded.project.city, {
    seed: 'legacy'
  });
  assertOriginalCity(loaded.project.city, built);
});

test('tight necks, closing inlets and rotated concave drawings remain safely enclosed', () => {
  const shapes = [
    [
      [-300, -120],
      [-60, -120],
      [-60, -10],
      [60, -10],
      [60, -120],
      [300, -120],
      [300, 120],
      [60, 120],
      [60, 10],
      [-60, 10],
      [-60, 120],
      [-300, 120]
    ],
    [
      [-300, -250],
      [300, -250],
      [300, 250],
      [10, 250],
      [10, -100],
      [-10, -100],
      [-10, 250],
      [-300, 250]
    ]
  ];
  for (const [index, shape] of shapes.entries())
    for (const angle of [0, .37, .9, 1.8]) {
      const boundary = shape.map(([x, y]) => ({
        x: x * Math.cos(angle) - y * Math.sin(angle) + 65,
        y: x * Math.sin(angle) + y * Math.cos(angle) - 110
      }));
      const city = createProject({
          seed: `tight-${index}`,
          boundary,
          morphology: 'organic'
        }).city,
        next = generateFortifications(city, {
          seed: 'tight',
          gateCount: 8,
          towerSpacing: 60
        });
      assertOriginalCity(city, next);
      assertWallGeometry(next, `${index}/${angle}`);
    }
});
