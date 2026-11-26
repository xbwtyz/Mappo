import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { buildRoadGraph } from '../src/core/road-graph.js';
import { inspectJunctionImpact } from '../src/core/road-impact.js';
import {
  roadInspectionDetails,
  hitRoadInspection,
  roadReportHighlights,
} from '../src/core/road-inspection.js';
import { RoadPreviewSession } from '../src/editor/road-preview.js';
import { buildingAppHarness } from './helpers/building-app.js';
import {
  createProjectDocument,
  encodeProjectDocument,
  decodeProjectDocument,
} from '../src/data/project-format.js';

const base = createProject({ seed: 'a4-session', size: 'small' });
const clone = (v) => JSON.parse(JSON.stringify(v));
function fixture() {
  let project = clone(base),
    calls = 0;
  const callbacks = [];
  const session = new RoadPreviewSession({
    getProject: () => project,
    schedule: (fn) => {
      callbacks.push(fn);
      return callbacks.length;
    },
    unschedule: () => {},
    analyze: (...args) => {
      calls++;
      return inspectJunctionImpact(args[0], args[1].junctionId, args[1].point);
    },
  });
  session.start();
  return {
    session,
    callbacks,
    get calls() {
      return calls;
    },
    replace: () => {
      project = clone(base);
    },
  };
}
test('A4 details use A1 protected classes, stable IDs and connected endpoint counts', () => {
  const graph = buildRoadGraph(base.city);
  for (const [id, node] of graph.nodesById) {
    const d = roadInspectionDetails(graph, { kind: 'junction', id });
    assert.deepEqual(d.record, node);
    assert.equal(d.roadIds.length, graph.incidentRoads.get(id).length);
    assert.equal(d.movable, !d.protected && graph.valid && d.roadIds.length > 0);
    assert.deepEqual(hitRoadInspection(graph, node, 12), { kind: 'junction', id });
  }
  for (const [id, road] of graph.roadsById) {
    const d = roadInspectionDetails(graph, { kind: 'road', id });
    assert.deepEqual(d.endpoints, [road.a, road.b]);
    assert.equal(d.movable, false);
  }
});
test('touch hit targets include 22 screen pixels and select roads away from junctions', () => {
  const graph = buildRoadGraph(base.city),
    node = [...graph.nodesById.values()][0];
  assert.ok(hitRoadInspection(graph, { x: node.x + 21 / 12, y: node.y }, 12, 'touch'));
  assert.equal(hitRoadInspection(graph, { x: node.x + 21 / 12, y: node.y }, 12, 'mouse'), null);
  const road = [...graph.roadsById.values()].find((r) => {
    const a = graph.nodesById.get(r.a),
      b = graph.nodesById.get(r.b);
    return Math.hypot(a.x - b.x, a.y - b.y) > 30;
  });
  const a = graph.nodesById.get(road.a),
    b = graph.nodesById.get(road.b);
  assert.deepEqual(hitRoadInspection(graph, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 12), {
    kind: 'road',
    id: road.id,
  });
});
test('coordinates, debounce and correction consume exactly the authoritative A3 report', () => {
  const f = fixture(),
    s = f.session,
    before = JSON.stringify(base),
    p = { ...s.point };
  s.update({ x: 200000, y: 200000 });
  assert.equal(s.checking, true);
  assert.equal(s.report, null);
  f.callbacks.at(-1)();
  assert.equal(s.report.status, 'invalid');
  s.update({ x: p.x + 0.01, y: p.y + 0.01 });
  assert.equal(s.report, null);
  f.callbacks.at(-1)();
  assert.deepEqual(s.report, inspectJunctionImpact(base, s.selection.id, s.point));
  assert.notEqual(s.report.status, 'invalid');
  assert.equal(s.report.canApplyIn02A, false);
  assert.equal(JSON.stringify(base), before);
  s.reset();
  assert.deepEqual(s.point, p);
  assert.equal(s.report, null);
  assert.equal(s.pending, false);
});
test('queued work is cancelled by reset, selection, exit and project replacement', () => {
  for (const action of ['reset', 'select', 'stop', 'replace']) {
    const f = fixture(),
      s = f.session;
    s.nudge(0.1, 0.1);
    const callback = f.callbacks.at(-1);
    if (action === 'select') s.select({ kind: 'road', id: s.graph.roadsById.keys().next().value });
    else if (action === 'replace') f.replace();
    else s[action]();
    callback();
    assert.equal(f.calls, 0, action);
    assert.equal(s.report, null, action);
  }
});
test('drag frames do not analyze; pointer cancellation restores the previous proposal', () => {
  const f = fixture(),
    s = f.session,
    p = { ...s.point };
  s.nudge(0.2, 0.2);
  f.callbacks.at(-1)();
  const previous = { ...s.point },
    calls = f.calls;
  assert.equal(s.begin(previous, 4, 'touch'), true);
  s.move({ x: previous.x + 5, y: previous.y + 8 });
  assert.equal(f.calls, calls);
  assert.equal(s.report, null);
  s.end(true);
  f.callbacks.at(-1)();
  assert.deepEqual(s.point, previous);
  assert.deepEqual(s.report, inspectJunctionImpact(base, s.selection.id, previous));
  s.reset();
  assert.deepEqual(s.point, p);
});
test('protected junctions and road selections cannot produce a move', () => {
  const { session: s } = fixture();
  const id = [...s.graph.nodesById.keys()].find(
    (id) => roadInspectionDetails(s.graph, { kind: 'junction', id }).protected,
  );
  s.select({ kind: 'junction', id });
  assert.equal(s.update({ x: 1, y: 1 }), false);
  s.select({ kind: 'road', id: s.graph.roadsById.keys().next().value });
  assert.equal(s.update({ x: 1, y: 1 }), false);
  assert.equal(s.report, null);
});
test('highlight IDs/severity come only from typed A3 rows, including incomplete reports', () => {
  const report = {
    affected: [
      { kind: 'block', id: 'same', severity: 'info' },
      { kind: 'block', id: 'same', severity: 'invalid' },
      { kind: 'road', id: 'same', severity: 'needs-review' },
    ],
    preservedObjects: [
      { kind: 'property', id: 'same' },
      { kind: 'block', id: 'same' },
    ],
  };
  assert.deepEqual(roadReportHighlights(report), {
    affected: [
      { kind: 'block', id: 'same', severity: 'invalid' },
      { kind: 'road', id: 'same', severity: 'needs-review' },
    ],
    preserved: [{ kind: 'property', id: 'same' }],
  });
  assert.deepEqual(roadReportHighlights(null), { affected: [], preserved: [] });
});
test('compiled A4 preview keeps save/recovery payload, accepted history and selection unchanged', async () => {
  const app = await buildingAppHarness(),
    state = app.state(),
    road = state.roadWorkspace;
  const property = state.project.city.properties[0];
  state.propertyWorkspace.select({ kind: 'property', id: property.id });
  const before = clone(app.capture()),
    revision = state.files.revision;
  const histories = [
    state.buildingHistory,
    state.buildingStructureHistory,
    state.propertyHistory,
    state.propertyDeletionHistory4A,
  ].map((h) => JSON.stringify(h));
  road.start();
  assert.equal(road.active, true);
  assert.equal(app.el('workspaceSection-city').inert, true);
  road.session.update({ x: 200000, y: 200000 }, { defer: false });
  assert.equal(road.session.report.status, 'invalid');
  state.camera.x += 30;
  state.camera.zoom *= 1.2;
  assert.deepEqual(clone(app.capture()), before);
  const portable = decodeProjectDocument(
    encodeProjectDocument(createProjectDocument(app.capture().project, app.capture().workspace)),
  );
  assert.deepEqual(clone(portable.project), before.project);
  assert.deepEqual(clone(portable.workspace), before.workspace);
  assert.equal(state.files.revision, revision);
  assert.deepEqual(
    histories,
    [
      state.buildingHistory,
      state.buildingStructureHistory,
      state.propertyHistory,
      state.propertyDeletionHistory4A,
    ].map((h) => JSON.stringify(h)),
  );
  app.el('roadPreviewCancel').handlers.click();
  assert.equal(road.active, false);
  assert.deepEqual(clone(app.capture()), before);
  assert.equal(state.files.revision, revision);
  assert.deepEqual(clone(state.workspaceShell.state.selection), { kind: 'property', id: property.id });
  assert.equal(app.el('workspaceSection-city').inert, false);
});
test('compiled keyboard, navigation, project replacement and pending timer exits cannot leak a preview', async () => {
  const app = await buildingAppHarness(),
    state = app.state(),
    road = state.roadWorkspace;
  const before = clone(app.capture());
  road.start();
  app.el('roadNudgeStep').value = '0.5';
  const original = clone(road.session.point);
  const key = (key, extra = {}) => {
    for (const fn of app.globalEvents.keydown ?? [])
      fn({ key, target: app.el('mapCanvas'), preventDefault() {}, ...extra });
  };
  app.el('mapCanvas').focus();
  key('ArrowRight');
  assert.equal(road.session.point.x, original.x + 0.5);
  key('Delete');
  assert.equal(JSON.stringify(state.project), JSON.stringify(before.project));
  key('z', { ctrlKey: true });
  assert.equal(road.session.pending, true, 'Accepted Undo leaves the uncommitted road preview intact.');
  key('z', { ctrlKey: true, shiftKey: true });
  assert.equal(road.session.pending, false, 'Reset Preview has a dedicated shortcut.');
  key('ArrowLeft');
  app.el('roadProposedX').tagName = 'INPUT';
  app.el('roadProposedX').focus();
  key('Escape', { target: app.el('roadProposedX') });
  assert.equal(road.active, false);
  assert.deepEqual(clone(app.capture()), before);
  road.start();
  road.session.nudge(0.5, 0);
  state.workspaceShell.navigate('landscape');
  assert.equal(road.active, false);
  state.workspaceShell.navigate('city');
  road.start();
  road.session.nudge(0.5, 0);
  app.applyPortable(encodeProjectDocument(createProjectDocument(before.project, before.workspace)));
  assert.equal(road.active, false);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(road.session.report, null);
  assert.deepEqual(clone(app.state().project), before.project);
});

test('Safe preview and analysis errors remain read-only and never become Apply', () => {
  const empty = clone(base);
  empty.city.properties = [];
  empty.city.plots = [];
  empty.city.buildings = [];
  empty.city.openSpaces = empty.city.blocks.map((b) => ({
    id: `OPEN-${b.id}`,
    blockId: b.id,
    kind: 'undeveloped',
    area: b.area,
  }));
  const s = new RoadPreviewSession({ getProject: () => empty });
  s.start();
  const before = JSON.stringify(empty);
  s.update({ x: s.point.x + 0.01, y: s.point.y + 0.01 }, { defer: false });
  assert.equal(s.report.status, 'safe');
  assert.equal(s.report.canApplyIn02A, false);
  assert.equal(JSON.stringify(empty), before);
  s.analyze = () => {
    throw new Error('test analysis failure');
  };
  s.nudge(0.01, 0);
  s.update(s.point, { defer: false });
  assert.equal(s.report, null);
  assert.equal(s.checking, false);
  assert.match(s.error, /Report unavailable/);
  s.stop();
});

test('compiled mode refuses an unfinished tool and paginates report text without losing IDs or injecting HTML', async () => {
  const app = await buildingAppHarness(),
    s = app.state(),
    road = s.roadWorkspace;
  s.editor.setMode('edit');
  const before = JSON.stringify(app.capture());
  road.start();
  assert.equal(road.active, false);
  assert.match(app.el('roadModeNotice').textContent, /Finish or cancel/);
  assert.equal(JSON.stringify(app.capture()), before);
  s.editor.setMode('pan');
  road.start();
  road.session.update({ x: 200000, y: 200000 }, { defer: false });
  const report = road.session.report;
  road.session.report = {
    ...report,
    affected: Array.from({ length: 73 }, (_, i) => ({
      kind: 'property',
      id: `<P-${i}>`,
      code: 'test-code',
      severity: 'needs-review',
      message: `Keep property ${i} unchanged <script>`,
      relatedIds: ['RD-test'],
    })),
  };
  road.render();
  // A5 groups 73 repeated issues into one cause without losing any exact IDs.
  assert.equal(app.el('roadReportList').children.length, 1);
  assert.equal(app.el('roadShowMore').hidden, true);
  const group = app.el('roadReportList').children[0].children[0];
  assert.match(group.children[0].textContent, /73 affected objects/);
  const details = group.children[2].children;
  assert.equal(details.length, 73);
  assert.match(details[0].children[0].textContent, /property <P-0>/);
  assert.match(details[72].children[0].textContent, /72.*<script>/);
  assert.match(details[72].children[1].textContent, /test-code/);
  assert.equal(details[72].children[2].textContent, 'Locate property <P-72>');
  road.reset();
  assert.equal(app.el('roadReportList').children.length, 0);
  road.exit();
});
