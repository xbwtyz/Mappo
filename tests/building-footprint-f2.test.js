import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { BuildingEditSession, buildingDirectHandles } from '../src/editor/building.js';
import { BuildingGeometryHistory } from '../src/editor/building-history.js';
import { prepareBuildingApply, inspectBuildingPreview } from '../src/editor/building-application.js';
import { BuildingPlacementSession3H } from '../src/editor/building-structures.js';
import { findDirectFootprintFixture } from './helpers/building-footprint-fixture.js';

const layers = { buildings: true };
const getBuilding = (project, id) => project.city.buildings.find(item => item.id === id);

test('F2 wing and courtyard use one atomic Apply each, preserve identity, and round trip with history', () => {
  let project = createProject({ seed: 'f2-shapes', size: 'small', morphology: 'organic' });
  const { building, wing, courtyard } = findDirectFootprintFixture(project);
  building.customName = 'Maple Hall';
  building.customUse = 'Meeting space';
  const accepted = JSON.stringify(project.city);
  const session = new BuildingEditSession();
  const history = new BuildingGeometryHistory();
  session.start(project.city, layers, building.id);
  session.setTool('edges');
  assert.ok(session.selectDirectHandle(project.city, 1));
  assert.ok(session.editDirectGeometry(project.city, 'wing', wing));
  assert.equal(session.previewFor(project.city).footprint.length, 8);
  assert.equal(session.editDirectGeometry(project.city, 'insert'), false);
  assert.equal(JSON.stringify(project.city), accepted);
  const apply = () => {
    const result = prepareBuildingApply(project, defaultWorkspace(project), building.id, session.transform, session.draft);
    assert.ok(result.ok, JSON.stringify(result.issues));
    assert.ok(history.record(project, result.candidate, building.id));
    project = result.candidate;
    session.reset(project.city);
    return result;
  };
  const wingReceipt = apply();
  assert.equal(wingReceipt.accessChanged, false);
  const extended = getBuilding(project, building.id);
  assert.deepEqual(extended.entrance, building.entrance);
  assert.deepEqual(extended.accessPath, building.accessPath);
  session.setTool('courtyard');
  assert.ok(session.editDirectGeometry(project.city, 'add courtyard', courtyard));
  assert.ok(session.editDirectGeometry(project.city, 'adjust courtyard', { ...courtyard, width: courtyard.width * 2 }));
  apply();
  const edited = getBuilding(project, building.id);
  assert.equal(edited.holes.length, 1);
  assert.ok(edited.area < extended.area);
  for (const key of ['id', 'propertyId', 'type', 'shape', 'customName', 'customUse', 'frontageRoadId'])
    assert.equal(edited[key], building[key]);
  assert.equal(history.count('undo', building.id), 2);
  const undo = history.prepare(project, defaultWorkspace(project), building.id, 'undo');
  assert.ok(undo.ok, undo.reason);
  assert.deepEqual(getBuilding(undo.candidate, building.id), extended);
  history.accept(undo.entry, 'undo');
  const redo = history.prepare(undo.candidate, defaultWorkspace(undo.candidate), building.id, 'redo');
  assert.ok(redo.ok, redo.reason);
  assert.deepEqual(redo.candidate.city, project.city);
});

test('F2 pointer cancellation and stale city references never commit an invalid vertex draft', () => {
  const project = createProject({ seed: 'f2-vertex', size: 'small', morphology: 'linear' });
  const { building, vertex } = findDirectFootprintFixture(project);
  const accepted = JSON.stringify(project.city);
  const session = new BuildingEditSession();
  session.start(project.city, layers, building.id);
  session.setTool('vertices');
  assert.ok(session.beginGesture(project.city, layers, vertex, 10, 'touch'));
  assert.ok(session.moveGesture(building.footprint[0]));
  const invalid = inspectBuildingPreview(project, building.id, session.transform, true, session.draft);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some(issue => issue.code === 'shape'));
  assert.equal(JSON.stringify(project.city), accepted);
  assert.ok(session.endGesture(true));
  assert.equal(session.isPending, false);
  assert.equal(session.handleIndex, 2);
  const replacementCity = structuredClone(project.city);
  assert.equal(session.beginGesture(replacementCity, layers, vertex, 10), false);
  assert.equal(session.reconcile(replacementCity, layers, { kind: 'building', id: building.id }), false);
  assert.equal(session.isActive, false);
});

test('F2 editing a courtyard vertex and inserting or deleting vertices use the selected ring', () => {
  const project = createProject({ seed: 'f2-rings', size: 'small', morphology: 'organic' });
  const { building, courtyard } = findDirectFootprintFixture(project);
  const session = new BuildingEditSession();
  session.start(project.city, layers, building.id);
  session.setTool('courtyard');
  assert.ok(session.editDirectGeometry(project.city, 'add courtyard', courtyard));
  const result = prepareBuildingApply(project, defaultWorkspace(project), building.id, session.transform, session.draft);
  assert.ok(result.ok, JSON.stringify(result.issues));
  const city = result.candidate.city;
  session.reset(city);
  session.setTool('edges');
  assert.ok(session.selectDirectRing(city, 0));
  assert.ok(session.editDirectGeometry(city, 'insert'));
  assert.equal(session.previewFor(city).holes[0].length, 5);
  assert.equal(session.previewFor(city).footprint.length, 4);
  session.setTool('vertices');
  const midpoint = buildingDirectHandles(session.previewFor(city), 'vertices', 0)[1];
  assert.ok(session.selectDirectHandle(city, 1));
  assert.ok(session.editDirectGeometry(city, 'move', { x: midpoint.x, y: midpoint.y + .01 }));
  const inserted = prepareBuildingApply(result.candidate, defaultWorkspace(result.candidate),
    building.id, session.transform, session.draft);
  assert.ok(inserted.ok, JSON.stringify(inserted.issues));
  const editedCity = inserted.candidate.city;
  session.reset(editedCity);
  assert.ok(session.selectDirectRing(editedCity, 0));
  assert.ok(session.selectDirectHandle(editedCity, 1));
  assert.ok(session.editDirectGeometry(editedCity, 'delete'));
  assert.equal(session.previewFor(editedCity).holes[0].length, 4);
});

test('F2 replacement starts without a preset and clears consent when the draft changes', () => {
  const project = createProject({ seed: 'f2-replace', size: 'small', morphology: 'organic' });
  const { building } = findDirectFootprintFixture(project);
  building.shape = 'custom-legacy-outline';
  const placement = new BuildingPlacementSession3H();
  assert.ok(placement.start(project.city, building.propertyId, building.id));
  assert.equal(placement.spec.preset, '');
  assert.equal(placement.previewFor(project.city), null);
  assert.ok(placement.update({ preset: 'L' }));
  assert.ok(placement.previewFor(project.city));
  placement.active.replaceGeometry = true;
  placement.update({ depth: placement.spec.depth + .1 });
  assert.equal(placement.active.replaceGeometry, false);
});
