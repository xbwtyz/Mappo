import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildingFrame } from '../src/core/building-transform.js';
import { projectSimpleBuildingS10 } from '../src/core/building-geometry-adapter-s10.js';
import { lerpPoint } from '../src/core/boundary.js';
import { IdentityEditor } from '../src/core/identity.js';
import { prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { classifyRoadProvenance } from '../src/core/road-provenance.js';
import { createProjectDocument, decodeProjectDocument, defaultWorkspace, encodeProjectDocument } from '../src/data/project-format.js';
import { BuildingEditSession } from '../src/editor/building.js';
import { deriveOccupiedPlots, prepareBuildingApply } from '../src/editor/building-application.js';
import { BuildingGeometryHistory } from '../src/editor/building-history.js';
import { BuildingStructureHistory3H } from '../src/editor/building-structure-history.js';
import { buildingLocalPoint3H, defaultBuildingSpec3H, prepareBuildingStructure3H } from '../src/editor/building-structures.js';
import { preparePropertyCreationE1 } from '../src/editor/property-creation-e1.js';
import { preparePropertyApply3I } from '../src/editor/property-application.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { PropertyGeometryHistory3I } from '../src/editor/property-history.js';
import { findSplitAndMerge } from './helpers/property-split-merge-fixture.js';
import { vacant } from './helpers/vacant-frontage.js';

const propertyIn = (project, id) => project.city.properties.find(item => item.id === id);
const buildingIn = (project, id) => project.city.buildings.find(item => item.id === id);
const layers = { buildings: true };
const assertGood = result => assert.ok(result.ok, JSON.stringify(result.issues ?? result.reason));

function assertUnrelatedCity(previous, next, targetId) {
  const unrelated = ({ city }) => ({
    ...city, buildings: city.buildings.filter(building => building.id !== targetId)
  });
  assert.equal(JSON.stringify(unrelated(next)), JSON.stringify(unrelated(previous)));
}

function applyGeometry(project, buildingId, tool, operation, options, handle = 0) {
  const session = new BuildingEditSession();
  assert.ok(session.start(project.city, layers, buildingId));
  assert.ok(session.setTool(tool));
  if (tool === 'vertices' || tool === 'edges') assert.ok(session.selectDirectHandle(project.city, handle));
  const accepted = JSON.stringify(project);
  assert.ok(session.editDirectGeometry(project.city, operation, options), session.operationError);
  const result = prepareBuildingApply(project, defaultWorkspace(project), buildingId, session.transform, session.draft);
  assertGood(result);
  assert.equal(JSON.stringify(project), accepted);
  assertUnrelatedCity(project, result.candidate, buildingId);
  return result.candidate;
}

function placeRectangle(project, property, id, overrides = {}) {
  const spec = { ...defaultBuildingSpec3H(property), width: 3, depth: 3, ...overrides };
  return prepareBuildingStructure3H(project, defaultWorkspace(project), {
    operation: 'add', propertyId: property.id, buildingId: id, spec
  });
}

function findRedividedBuilding(project, propertyId, buildingId) {
  const property = propertyIn(project, propertyId);
  for (const [index] of property.plotIds.entries()) {
    const session = new PropertyEditSession3I();
    if (!session.start(project.city, propertyId) || !session.addDivider(project.city, index)) continue;
    const redivided = preparePropertyApply3I(project, defaultWorkspace(project), session);
    if (!redivided.ok) continue;
    const site = propertyIn(redivided.candidate, propertyId);
    const plots = redivided.candidate.city.plots;
    // A point midway along the added divider is inside the parent and
    // places the footprint on both new plots.
    const left = plots.find(plot => plot.id === site.plotIds[index]);
    const center = lerpPoint(left.boundary[1], left.boundary[2], .5);
    const spec = buildingLocalPoint3H(site, center);
    const placed = placeRectangle(redivided.candidate, site, buildingId, spec);
    if (placed.ok && buildingIn(placed.candidate, buildingId).plotIds.length >= 2) return { redivided, placed, site, spec };
  }
  throw Error('No accepted building spanning both plots of an E4 divider.');
}

test('F4 direct footprints apply on properties created by E1, split by E2, and merged by E3', () => {
  const { project, workspace, draft } = vacant();
  const created = preparePropertyCreationE1(project, workspace, draft);
  assertGood(created);
  const { split, merged, propertyId } = findSplitAndMerge();
  const sites = [
    ['E1', created.candidate, created.propertyId],
    ['E2', split.candidate, split.newPropertyId],
    ['E3', merged.candidate, propertyId]
  ];
  for (const [stage, accepted, id] of sites) {
    const buildingId = 'BLD-MAN-F4-' + stage;
    const placement = placeRectangle(accepted, propertyIn(accepted, id), buildingId);
    assertGood(placement);
    const original = buildingIn(placement.candidate, buildingId);
    const edited = applyGeometry(placement.candidate, buildingId, 'edges', 'insert', undefined, 1);
    const building = buildingIn(edited, buildingId);
    assert.equal(building.footprint.length, original.footprint.length + 1, stage);
    assert.deepEqual(building.plotIds, original.plotIds, stage);
    assert.deepEqual(building.accessPath, original.accessPath, stage);
  }
});

test('F4 on E4 land composes replacement, wing, courtyard, use, exact scoped history, and portable reopen', () => {
  const { merged, propertyId } = findSplitAndMerge();
  const buildingId = 'BLD-MAN-F4-E4';
  const { redivided, placed, site, spec } = findRedividedBuilding(merged.candidate, propertyId, buildingId);
  assert.equal(site.plotCountHistoryE4.at(-1).operation, 'split');
  const plotUndo = new PropertyGeometryHistory3I();
  assert.ok(plotUndo.record(merged.candidate, redivided.candidate, propertyId));

  const placedBuilding = buildingIn(placed.candidate, buildingId);
  placedBuilding.customName = 'Copper Court';
  placedBuilding.customUse = 'Guild meeting room';
  placedBuilding.customDescription = 'A ward landmark.';
  placedBuilding.futureDetail = { detail: ['authored', 1] };
  const replaced = prepareBuildingStructure3H(placed.candidate, defaultWorkspace(placed.candidate), {
    operation: 'replace', propertyId, buildingId,
    spec: { ...defaultBuildingSpec3H(site, placedBuilding), ...spec, width: 2.8, depth: 2.8 }
  });
  assertGood(replaced);
  const structures = new BuildingStructureHistory3H();
  assert.ok(structures.record(placed.candidate, replaced.candidate, propertyId, 'replace'));
  assert.ok(structures.can('undo', replaced.candidate, propertyId));
  const wing = applyGeometry(replaced.candidate, buildingId, 'edges', 'wing',
    { start: .3, end: .7, depth: .12 }, 1);
  const frame = buildingFrame(buildingIn(replaced.candidate, buildingId));
  const courtyard = applyGeometry(wing, buildingId, 'courtyard', 'add courtyard',
    { center: { x: frame.x, y: frame.y }, width: .4, depth: .4 });

  const geometryHistory = new BuildingGeometryHistory();
  assert.ok(geometryHistory.record(replaced.candidate, wing, buildingId));
  assert.ok(geometryHistory.record(wing, courtyard, buildingId));
  const identity = new IdentityEditor();
  const ref = { kind: 'building', id: buildingId };
  const classified = { ...courtyard, city: identity.apply(courtyard.city, ref, { buildingType: 'inn' }) };
  const accepted = buildingIn(classified, buildingId);
  assert.deepEqual(accepted, { ...buildingIn(courtyard, buildingId), type: 'inn' });
  assert.deepEqual(accepted.futureDetail, placedBuilding.futureDetail);
  assert.equal(accepted.customDescription, placedBuilding.customDescription);
  assert.equal(accepted.customName, placedBuilding.customName);
  assert.equal(accepted.customUse, placedBuilding.customUse);
  assert.equal(projectSimpleBuildingS10(accepted.geometry,accepted.components).holes.length, 1);
  assert.ok(accepted.plotIds.length >= 2);
  assert.deepEqual(accepted.plotIds, deriveOccupiedPlots(classified.city, site, accepted));
  assert.equal(structures.prepare(classified, defaultWorkspace(classified), propertyId, 'undo').ok, false);
  assert.equal(plotUndo.prepare(classified, defaultWorkspace(classified), propertyId, 'undo').ok, false);

  const undo = geometryHistory.prepare(classified, defaultWorkspace(classified), buildingId, 'undo');
  assertGood(undo);
  assert.deepEqual(buildingIn(undo.candidate, buildingId), { ...buildingIn(wing, buildingId), type: 'inn' });
  geometryHistory.accept(undo.entry, 'undo');
  const redo = geometryHistory.prepare(undo.candidate, defaultWorkspace(undo.candidate), buildingId, 'redo');
  assertGood(redo);
  assert.equal(JSON.stringify(redo.candidate), JSON.stringify(classified));
  assert.deepEqual(identity.undo(redo.candidate.city), courtyard.city);

  const document = createProjectDocument(redo.candidate);
  const reopened = decodeProjectDocument(encodeProjectDocument(document));
  assert.equal(reopened.formatVersion, 1);
  assert.equal(reopened.project.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(JSON.stringify(reopened.project), JSON.stringify(classified));
});

test('F4 road reflow preserves authored fields and blocks unknown dependencies on directly edited outlines', () => {
  const base = createProject({ seed: 'c2-planned', size: 'small', morphology: 'planned' });
  const buildingId = 'BLD-00061';
  const building = buildingIn(base, buildingId);
  assert.ok(building);
  const edited = applyGeometry(base, buildingId, 'edges', 'insert', undefined, 1);
  assert.equal(classifyRoadProvenance(buildingIn(edited, buildingId)), 'custom');
  const custom = buildingIn(edited, buildingId);
  custom.customName = 'Copper Market';
  custom.customUse = 'Covered market';
  const ref = { kind: 'building', id: buildingId };
  const project = { ...edited, city: new IdentityEditor().apply(edited.city, ref, { buildingType: 'inn' }) };
  const before = JSON.stringify(project);
  const move = (decision, source = project) => prepareNeighborhoodReflowC3(source, 'RD-0113', { x: 0, y: 18 }, undefined,
    decision ? new Map([[buildingId, { kind: decision }]]) : undefined);
  for (const [choice, code] of [[undefined, 'building-decision-required'], ['fixed', 'building-placement-blocked']]) {
    const result = move(choice);
    assert.ok(result.unresolved.some(issue => issue.code === code), JSON.stringify(result.unresolved));
    assert.ok(!result.candidateProject);
    assert.equal(JSON.stringify(project), before);
  }
  const relocated = move('auto');
  assert.ok(relocated.candidateProject, JSON.stringify(relocated.unresolved));
  const next = buildingIn(relocated.candidateProject, buildingId);
  assert.equal(next.type, 'inn');
  assert.equal(next.customUse, 'Covered market');
  assert.equal(next.customName, 'Copper Market');
  assert.equal(projectSimpleBuildingS10(next.geometry,next.components).footprint.length, custom.footprint.length);
  assert.equal(projectSimpleBuildingS10(next.geometry,next.components).holes.length, custom.holes.length);
  assert.ok(Math.abs(next.area - custom.area) < 1e-6);
  assert.deepEqual(next.plotIds, deriveOccupiedPlots(relocated.candidateProject.city,
    propertyIn(relocated.candidateProject, next.propertyId), next));
  assert.equal(JSON.stringify(project), before);
  const unknown = structuredClone(project);
  buildingIn(unknown, buildingId).futureDetail = { attribution: 'survey record' };
  const beforeUnknown = JSON.stringify(unknown);
  const blocked = move('auto', unknown);
  assert.ok(blocked.unresolved.some(issue => issue.code === 'unrecognized-dependency'
    && issue.id === buildingId && issue.message.includes('buildings.futureDetail')), JSON.stringify(blocked.unresolved));
  assert.ok(!blocked.candidateProject);
  assert.equal(JSON.stringify(unknown), beforeUnknown);
});
