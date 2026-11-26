import test from 'node:test';
import { assertRoadUndoProject } from './helpers/road-undo-project.js';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareNeighborhoodReflowC2, prepareNeighborhoodReflowC3 } from '../src/core/neighborhood-reflow.js';
import { classifyRoadProvenance } from '../src/core/road-provenance.js';
import { roadReconciliationPreviewB3 } from '../src/core/road-inspection.js';
import { prepareRoadApplyC2 } from '../src/editor/road-application.js';
import { RoadGeometryHistoryB4 } from '../src/editor/road-history.js';
import { createProjectDocument, decodeProjectDocument, defaultWorkspace, encodeProjectDocument } from '../src/data/project-format.js';
import { buildingAppHarness } from './helpers/building-app.js';

const c2Fixtures = [
  ['organic', 'RD-0117', 3],
  ['planned', 'RD-0116', 5],
  ['radial', 'RD-0098', 5],
  ['linear', 'RD-0124', 5],
];

for (const [morphology, roadId, x] of c2Fixtures) {
  test('C2 reflows a developed ' + morphology + ' neighborhood through Apply, Undo, Redo and Save/Reload', () => {
    const project = createProject({ seed: 'c2-' + morphology, size: 'small', morphology });
    const before = structuredClone(project);
    const offset = { x, y: 0 };
    const preview = prepareNeighborhoodReflowC2(project, roadId, offset);
    assert.ok(preview.candidateProject, preview.unresolved[0]?.message);
    assert.ok(preview.ledger.some(row => row.kind === 'property' && row.disposition === 'reshaped'));
    assert.ok(preview.ledger.some(row => row.kind === 'plot' && row.disposition === 'reshaped'));
    const session = {
      current: () => true, project, city: project.city, selection: { kind: 'road', id: roadId },
      pending: true, revision: 4, settledRevision: 4, acceptedFingerprint: JSON.stringify(project),
      previewGeometry: roadReconciliationPreviewB3(project, preview),
      reconciliation: preview, roadIntentOffset: offset,
    };
    const workspace = defaultWorkspace(project);
    const receipt = prepareRoadApplyC2(project, workspace, session, 5, 5);
    assert.equal(receipt.ok, true, receipt.issues?.[0]?.message);
    assert.deepEqual(project, before);
    const candidate = receipt.candidate;
    const road = project.city.roads.find(record => record.id === roadId);
    for (const id of [road.a, road.b])
      assert.equal(candidate.city.nodes.find(node => node.id === id).x, project.city.nodes.find(node => node.id === id).x + x);
    const changed = new Set(preview.changed.filter(row => row.kind === 'property').map(row => row.id));
    assert.ok(changed.size < project.city.properties.length);
    for (const [index, property] of project.city.properties.entries()) {
      const next = candidate.city.properties[index];
      assert.equal(next.id, property.id);
      assert.deepEqual(next.plotIds, property.plotIds);
      if (!changed.has(property.id)) assert.deepEqual(next, property);
    }
    assert.deepEqual(candidate.city.buildings.map(b => b.footprint), project.city.buildings.map(b => b.footprint));
    const history = new RoadGeometryHistoryB4();
    assert.equal(history.record(project, candidate, roadId), true);
    const undo = history.prepare(candidate, workspace, 'undo');
    assert.equal(undo.ok, true, undo.reason);
    assert.deepEqual(undo.candidate, project);
    history.accept(undo.entry, 'undo');
    const redo = history.prepare(undo.candidate, workspace, 'redo');
    assert.equal(redo.ok, true, redo.reason);
    assert.deepEqual(redo.candidate, candidate);
    const portable = decodeProjectDocument(encodeProjectDocument(createProjectDocument(redo.candidate, workspace)));
    assert.deepEqual(portable.project, JSON.parse(JSON.stringify(candidate)));
    assert.equal(prepareRoadApplyC2(project, workspace, session, 5, 6).ok, false);
    session.reconciliation = { ...preview, ledger: [] };
    assert.equal(prepareRoadApplyC2(project, workspace, session, 5, 5).ok, false);
  });
}

test('C2 protects custom and legacy parcel geometry even when it prevents Apply', () => {
  const project = createProject({ seed: 'c2-planned', size: 'small', morphology: 'planned' });
  const roadId = 'RD-0116', offset = { x: 5, y: 0 };
  const preview = prepareNeighborhoodReflowC2(project, roadId, offset);
  const affected = preview.ledger.find(row => row.kind === 'property' && row.disposition === 'reshaped');
  const property = project.city.properties.find(record => record.id === affected.oldId);
  const plots = property.plotIds.map(id => project.city.plots.find(plot => plot.id === id));
  assert.equal(classifyRoadProvenance(property, plots), 'generated');
  property.customName = 'Market yard';
  assert.equal(classifyRoadProvenance(property, plots), 'custom');
  for (const provenance of ['custom', 'unknown']) {
    assert.equal(classifyRoadProvenance(property, plots), provenance);
    const before = structuredClone(project);
    const blocked = prepareNeighborhoodReflowC2(project, roadId, offset);
    assert.equal(blocked.candidateProject, null);
    assert.ok(blocked.unresolved.some(issue => issue.id === property.id && issue.code === 'parcel-decision-required'));
    assert.deepEqual(project, before);
    delete property.roadProvenance;
    delete property.customName;
  }
});

test('C2 standalone street Apply and Undo/Redo use the normal UI transaction', async () => {
  const app = await buildingAppHarness();
  const project = createProject({ seed: 'c2-planned', size: 'small', morphology: 'planned' });
  app.apply({ project, workspace: defaultWorkspace(project) });
  const state = app.state();
  const before = JSON.stringify(state.project), revision = state.files.revision;
  state.roadWorkspace.start();
  const session = state.roadWorkspace.session;
  session.select({ kind: 'road', id: 'RD-0116' });
  session.updateRoadIntent({ x: 5, y: 0 }, { defer: false });
  assert.equal(app.el('roadApplyB4').disabled, false, session.error || session.reconciliation?.unresolved[0]?.message);
  assert.equal(state.files.revision, revision);
  app.el('roadApplyB4').handlers.click();
  const applied = JSON.stringify(app.state().project);
  assert.notEqual(applied, before);
  assert.equal(state.files.revision, revision + 1);
  assert.equal(app.moveRoadHistory('undo'), true);
  assert.equal(JSON.stringify(app.state().project), before);
  assert.equal(state.files.revision, revision + 2);
  assert.equal(app.moveRoadHistory('redo'), true);
  assert.equal(JSON.stringify(app.state().project), applied);
  assert.equal(state.files.revision, revision + 3);
});

test('C3 automatically adapts generated buildings for a 12-unit street move through a developed block', async () => {
  const project = createProject({ seed: 'c2-planned', size: 'small', morphology: 'planned' });
  const roadId = 'RD-0113', offset = { x: 12, y: 0 };
  const old = prepareNeighborhoodReflowC2(project, roadId, offset);
  assert.equal(old.candidateProject, null);

  const app = await buildingAppHarness();
  app.apply({ project, workspace: defaultWorkspace(project) });
  const state = app.state();
  const before = JSON.stringify(state.project), revision = state.files.revision;
  state.roadWorkspace.start();
  const session = state.roadWorkspace.session;
  session.select({ kind: 'road', id: roadId });
  session.updateRoadIntent(offset, { defer: false });
  assert.equal(app.el('roadApplyB4').disabled, false, session.reconciliation?.unresolved[0]?.message);
  assert.ok(session.reconciliation.ledger.some(row => row.disposition === 'regenerated'));
  assert.ok(session.previewGeometry.rows.some(row => row.kind === 'building' && row.proposedPoints));
  assert.equal(JSON.stringify(app.state().project), before);
  app.el('roadApplyB4').handlers.click();
  const applied = JSON.stringify(app.state().project);
  assert.notEqual(applied, before);
  assert.equal(state.files.revision, revision + 1);
  assert.equal(app.moveRoadHistory('undo'), true);
  assertRoadUndoProject(JSON.stringify(app.state().project),before,applied);
  assert.equal(app.moveRoadHistory('redo'), true);
  assert.equal(JSON.stringify(app.state().project), applied);
  const saved = app.capture();
  const portable = decodeProjectDocument(encodeProjectDocument(createProjectDocument(saved.project, saved.workspace)));
  assert.equal(JSON.stringify(portable.project), applied);
});

test('C3 refuses to automatically replace a custom building', () => {
  const project = createProject({ seed: 'c2-planned', size: 'small', morphology: 'planned' });
  const roadId = 'RD-0113', offset = { x: 12, y: 0 };
  const preview = prepareNeighborhoodReflowC3(project, roadId, offset);
  const replacement = preview.ledger.find(row => row.disposition === 'replaced');
  assert.ok(replacement);
  project.city.buildings.find(building => building.id === replacement.oldId).customName = 'Market Hall';
  const before = structuredClone(project);
  const blocked = prepareNeighborhoodReflowC3(project, roadId, offset);
  assert.equal(blocked.candidateProject, null);
  assert.ok(blocked.unresolved.some(row => row.id===replacement.oldId && row.code==='building-decision-required'));
  assert.deepEqual(project, before);
});
