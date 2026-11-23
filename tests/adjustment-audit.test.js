import assert from 'node:assert/strict';
import test from 'node:test';

import { buildingExteriorRingsS10 } from '../src/core/building-geometry-adapter-s10.js';
import { occupiedPlotAreaS10 } from '../src/core/building-occupancy-s10.js';
import { pointInPolygon } from '../src/core/geometry.js';
import { auditControls, createAdjustmentAudit } from './helpers/adjustment-audit.js';

const audit = createAdjustmentAudit();
const findBuilding = (project, id) => project.city.buildings.find(row => row.id === id);

test('adjustment audit accepts a clear courtyard move across a plot divider', () => {
  const spec = auditControls['courtyard-cross-plot'];
  const {project, hostId} = audit.fixture(spec.fixture);
  const {preview, apply} = audit.execute(spec);
  assert.ok(preview.ok && apply.ok, JSON.stringify(apply.issues));

  const before = findBuilding(project, spec.target);
  const after = findBuilding(apply.candidate, spec.target);
  const host = findBuilding(project, hostId);
  assert.deepEqual(findBuilding(apply.candidate, hostId), host);
  assert.ok(after.footprint.every(point => pointInPolygon(point, host.holes[0])));
  assert.equal(after.frontageRoadId, before.frontageRoadId);
  assert.notDeepEqual(after.plotIds, before.plotIds);
  const occupied = project.city.plots.filter(plot => plot.propertyId === after.propertyId &&
    occupiedPlotAreaS10(after.geometry, plot.boundary) > 1e-5).map(plot => plot.id);
  assert.deepEqual(after.plotIds, occupied);
});

test('adjustment audit blocks courtyard movement into the solid wall', () => {
  const spec = auditControls['courtyard-wall'];
  const {project, hostId} = audit.fixture(spec.fixture);
  const {preview, apply} = audit.execute(spec);
  const host = findBuilding(project, hostId);
  const source = findBuilding(project, spec.target);
  const translated = source.footprint.map(point => ({x: point.x, y: point.y + spec.input.dy}));
  assert.ok(translated.some(point => pointInPolygon(point, host.footprint) &&
    !pointInPolygon(point, host.holes[0])), 'a proposed corner is inside the solid wall');
  assert.equal(apply.ok, false);
  assert.ok(preview.issues.some(issue => issue.code === 'collision' && issue.targetId === hostId));
});

test('adjustment audit blocks a split that assigns one building to both parcels', () => {
  const spec = auditControls['multipart-split'];
  const {project, joinedId} = audit.fixture(spec.fixture);
  const {preview, apply} = audit.execute(spec);
  const [start, end] = preview.preview.cut;
  const side = point => (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x);
  const rings = buildingExteriorRingsS10(findBuilding(project, joinedId));
  assert.ok(rings.some(ring => ring.every(point => side(point) < -1e-5)));
  assert.ok(rings.some(ring => ring.every(point => side(point) > 1e-5)));
  assert.equal(apply.ok, false);
  assert.ok(preview.issues.some(issue => issue.code === 'building' && issue.targetId === joinedId));
});
