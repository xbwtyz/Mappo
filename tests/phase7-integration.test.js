import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { workspaceInitialState, workspaceTransition } from '../src/core/workspace-state.js';
import { describeUndoContext } from '../src/core/undo-context.js';
import { describePendingChanges } from '../src/core/pending-changes.js';
import {
  copyJson, defaultWorkspace, createProjectDocument,
  encodeProjectDocument, decodeProjectDocument
} from '../src/data/project-format.js';
import { RecoveryStore } from '../src/data/recovery-store.js';

const stamp = '2026-11-18T00:00:00.000Z';

function fixture() {
  const project = createProject({ seed: 'phase-7-portability', size: 'small', morphology: 'organic' });
  const workspace = defaultWorkspace(project);
  workspace.ui = {
    section: 'landscape',
    toolsCollapsed: false,
    inspectorCollapsed: false,
    inspectorPinned: true,
    selection: { kind: 'landscape-add', id: 'lake' },
    sectionScroll: { city: 32, landscape: 225, defenses: 41 },
    inspectorScroll: 44,
    disclosures: { cityGenerationSettings: false, lakeGenerationSettings: true },
    landscape: {
      filter: 'water',
      formCache: [{ key: 'landscape-add:lake', controls: { lakeSeedInput: 'draft-lake', lakeRadiusInput: '125' } }]
    },
    districts: { formCache: [] },
    futureCompatible: { keep: 'opaque' }
  };
  const document = createProjectDocument(project, workspace, null, stamp);
  return { project, workspace, document };
}

test('7B: schema-9 project geometry and in-progress workspace inputs survive save/open/save exactly', () => {
  const { document, project } = fixture();
  const beforeGeometry = JSON.stringify(project.city);
  const loaded = decodeProjectDocument(encodeProjectDocument(document));
  assert.equal(loaded.project.schemaVersion, 9);
  assert.equal(loaded.workspace.schemaVersion, 1);
  assert.equal(JSON.stringify(loaded.project.city), beforeGeometry);
  assert.deepEqual(loaded.workspace.ui.selection, { kind: 'landscape-add', id: 'lake' });
  assert.equal(loaded.workspace.ui.sectionScroll.landscape, 225);
  assert.equal(loaded.workspace.ui.landscape.formCache[0].controls.lakeSeedInput, 'draft-lake');
  const nextWorkspace = copyJson(loaded.workspace);
  nextWorkspace.ui.section = 'defenses';
  nextWorkspace.ui.landscape.filter = 'all';
  const resaved = decodeProjectDocument(encodeProjectDocument(
    createProjectDocument(loaded.project, nextWorkspace, loaded, '2026-11-18T00:01:00.000Z')
  ));
  assert.equal(JSON.stringify(resaved.project.city), beforeGeometry);
  assert.equal(resaved.workspace.ui.section, 'defenses');
  assert.equal(resaved.workspace.ui.landscape.filter, 'all');
  assert.equal(resaved.workspace.ui.futureCompatible.keep, 'opaque');
  assert.equal(resaved.workspace.ui.landscape.formCache[0].controls.lakeSeedInput, 'draft-lake');
  assert.equal(JSON.stringify(document.project.city), beforeGeometry, 'Saving must not mutate its source');
});

test('7B: recovery backs up the previous complete document on a UI-only change', async () => {
  const { document, project } = fixture();
  let state = null;
  const adapter = {
    async read() { return copyJson(state); },
    async update(transform) {
      state = copyJson(transform(copyJson(state)));
      return copyJson(state);
    }
  };
  const store = new RecoveryStore(adapter);
  await store.read();
  await store.save(encodeProjectDocument(document));
  const secondWorkspace = copyJson(document.workspace);
  secondWorkspace.ui.section = 'districts';
  secondWorkspace.ui.selection = null;
  const second = createProjectDocument(project, secondWorkspace, document, '2026-11-18T00:02:00.000Z');
  await store.save(encodeProjectDocument(second));
  const snapshots = await store.read();
  const current = decodeProjectDocument(snapshots.current);
  const previous = decodeProjectDocument(snapshots.backup);
  assert.equal(current.workspace.ui.section, 'districts');
  assert.equal(previous.workspace.ui.section, 'landscape');
  assert.deepEqual(current.project.city, project.city);
  assert.deepEqual(previous.project.city, project.city);
});

test('7B: navigation, scoped undo and pending drafts never mutate accepted geometry', () => {
  const { project } = fixture();
  const original = JSON.stringify(project.city);
  const h = (count, mode = 'pan') => ({ mode, history: Array(count).fill({}) });
  const editors = {
    outline: h(1), water: h(2), terrain: h(3), district: h(4), defense: h(5)
  };
  let ui = workspaceInitialState();
  for (const [section, selection, expected] of [
    ['city', null, 'undoButton'],
    ['landscape', { kind: 'water', id: 'river-1' }, 'undoWaterButton'],
    ['landscape', { kind: 'terrain', id: 'range-1' }, 'undoTerrainButton'],
    ['districts', { kind: 'district', id: 'district-1' }, 'undoDistrictButton'],
    ['defenses', null, 'undoFortificationButton']
  ]) {
    ui = workspaceTransition(ui, { type: 'navigate', section });
    ui = workspaceTransition(ui, { type: 'select', selection });
    const route = describeUndoContext({ ...editors, ...ui });
    assert.equal(route.controlId, expected);
    assert.equal(route.available, true);
  }
  const context = {
    project,
    outline: { boundary: copyJson(project.city.survey.boundary), center: copyJson(project.options.center) },
    water: { dirty: true },
    terrain: { dirty: true },
    controls: { seed: project.seed, size: project.options.size, morphology: project.options.morphology },
    districtControls: {},
    defensePreview: { pending: true, invalid: false }
  };
  const summary = describePendingChanges(context);
  assert.ok(summary.city.includes('Water or crossings'));
  assert.ok(summary.city.includes('Mountains or passes'));
  assert.ok(summary.local.includes('Defense update'));
  assert.equal(JSON.stringify(project.city), original);
  assert.deepEqual([editors.outline.history.length, editors.water.history.length, editors.terrain.history.length, editors.district.history.length, editors.defense.history.length], [1,2,3,4,5]);
});
