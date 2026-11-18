import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAppHarness } from './helpers/building-app.js';
import { hitBuilding } from '../src/core/building-selection.js';
import { createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';
import { buildDistrictTopology } from '../src/core/district-topology.js';

function roofTarget(app) {
  const { project, camera } = app.state();
  for (const building of project.city.buildings) {
    const center = building.footprint.reduce((p, v) => ({ x: p.x + v.x / building.footprint.length, y: p.y + v.y / building.footprint.length }), { x: 0, y: 0 });
    for (let i = 0; i < building.footprint.length; i++) {
      const a = building.footprint[i], b = building.footprint[(i + 1) % building.footprint.length];
      const point = { x: .45 * (a.x + b.x) + .1 * center.x, y: .45 * (a.y + b.y) + .1 * center.y };
      if (hitBuilding(point, project.city.buildings, camera.zoom)?.id === building.id)
        return { id: building.id, propertyId: building.propertyId, point };
    }
  }
  assert.fail('Expected a selectable generated roof');
}
const copy = value => JSON.parse(JSON.stringify(value));
const action = (app, kind, id) => app.el('workspaceSelectionSections').children
  .flatMap(section => section.children ?? [])
  .find(button => button.attributes?.['data-inspector-kind'] === kind && button.attributes?.['data-inspector-id'] === id);

test('compiled property Inspector selects each compound wing and returns to its parent without modifying the city', async () => {
  const app = await buildingAppHarness(), state = app.state();
  const site = state.project.city.properties.find(p => p.buildingIds.length > 1);
  assert.ok(site, 'Generated city should include a multi-building property');
  const before = JSON.stringify(state.project);
  state.propertyWorkspace.select({ kind: 'property', id: site.id });
  for (const id of site.buildingIds) {
    action(app, 'building', id).handlers.click();
    assert.deepEqual(copy(state.workspaceShell.state.selection), { kind: 'building', id });
    assert.equal(app.el('workspaceSelectionType').textContent, 'Building');
    const captured = app.capture();
    assert.doesNotThrow(() => encodeProjectDocument(createProjectDocument(captured.project, captured.workspace)));
    assert.equal(captured.workspace.ui.selection, null);
    action(app, 'property', site.id).handlers.click();
    assert.deepEqual(copy(state.workspaceShell.state.selection), { kind: 'property', id: site.id });
  }
  assert.equal(JSON.stringify(state.project), before);
});

test('compiled courtyard and yard clicks select the property, not the district or an individual roof', async () => {
  const app = await buildingAppHarness(), state = app.state();
  const building = state.project.city.buildings.find(b => b.holes.length);
  assert.ok(building, 'Generated city should include a courtyard');
  const hole = building.holes[0];
  const courtyard = hole.reduce((p, v) => ({ x: p.x + v.x / hole.length, y: p.y + v.y / hole.length }), { x: 0, y: 0 });
  app.tap(state.camera.worldToScreen(courtyard));
  assert.deepEqual(copy(state.workspaceShell.state.selection), { kind: 'property', id: building.propertyId });
  const site = state.project.city.properties.find(p => p.id === building.propertyId);
  const center = site.boundary.reduce((p, v) => ({ x: p.x + v.x / site.boundary.length, y: p.y + v.y / site.boundary.length }), { x: 0, y: 0 });
  const yard = { x: .98 * site.boundary[0].x + .02 * center.x, y: .98 * site.boundary[0].y + .02 * center.y };
  assert.equal(hitBuilding(yard, state.project.city.buildings, 12), null);
  app.tap(state.camera.worldToScreen(yard));
  assert.equal(state.workspaceShell.state.selection.id, site.id);
});

test('compiled property click/hover reveals the correct inspector, preserves geometry and permits portable downloads', async () => {
  const app = await buildingAppHarness(), target = roofTarget(app);
  const before = JSON.stringify(app.state().project);
  const screen = () => app.state().camera.worldToScreen(target.point);
  app.fire('pointermove', screen());
  assert.equal(app.state().propertyWorkspace.hover.id, target.propertyId);
  app.tap(screen());
  assert.deepEqual(copy(app.state().workspaceShell.state.selection), { kind: 'property', id: target.propertyId });
  assert.equal(app.el('workspaceSelectionName').textContent, target.propertyId);
  assert.equal(app.el('workspaceSelectionType').textContent, 'Property');
  assert.equal(app.state().districtPanel.editor.selectedDistrictId, null);
  app.el('workspaceCloseInspector').handlers.click();
  assert.equal(app.el('workspaceInspector').hidden, true);
  app.tap(screen());
  assert.equal(app.el('workspaceInspector').hidden, false);
  assert.equal(JSON.stringify(app.state().project), before);
  const captured = app.capture();
  const portable = decodeProjectDocument(encodeProjectDocument(createProjectDocument(captured.project, captured.workspace)));
  assert.equal(portable.project.schemaVersion, 9);
  assert.equal(portable.workspace.ui.selection, null, '3F-Aa keeps property/building selection session-only');
  assert.equal(JSON.stringify(portable.project), before);
  app.apply(portable);
  assert.equal(app.state().workspaceShell.state.selection, null);
  assert.equal(app.state().buildingWorkspace.hover, null);
  assert.equal(JSON.stringify(app.state().project), before);
});

test('compiled property routing retains landscape priority, district fallback with hidden land layers, and clearing empty land', async () => {
  const app = await buildingAppHarness(), target = roofTarget(app);
  const state = app.state(), topology = buildDistrictTopology(state.project.city);
  const block = state.project.city.blocks.find(b => b.id === state.project.city.buildings.find(b => b.id === target.id).blockId);
  state.camera.zoom = 2;
  state.camera.x = target.point.x;
  state.camera.y = target.point.y;
  app.tap(state.camera.worldToScreen(target.point));
  assert.equal(state.workspaceShell.state.selection.kind, 'property');
  app.el('buildingsLayer').handlers.change({ target: { checked: false } });
  assert.equal(state.workspaceShell.state.selection, null);
  app.fire('pointermove', state.camera.worldToScreen(target.point));
  assert.equal(state.propertyWorkspace.hover, null);
  app.tap(state.camera.worldToScreen(topology.centers.get(block.id)));
  assert.equal(state.workspaceShell.state.selection.kind, 'district');
  app.el('buildingsLayer').handlers.change({ target: { checked: true } });
  app.tap(state.camera.worldToScreen(target.point));
  assert.equal(state.workspaceShell.state.selection.kind, 'property');
  // A draft mountain over the roof exercises actual landscape hit priority.
  const p = target.point;
  state.terrainPanel.editor.features.push({ id: 'qa-mountain', kind: 'mountain', name: 'QA range',
    path: [{ x: p.x - 20, y: p.y - 20 }, { x: p.x + 20, y: p.y - 20 }, { x: p.x + 20, y: p.y + 20 }, { x: p.x - 20, y: p.y + 20 }],
    ridge: [{ x: p.x - 10, y: p.y, height: 400 }, { x: p.x, y: p.y, height: 500 }, { x: p.x + 10, y: p.y, height: 400 }], center: p });
  app.fire('pointermove', state.camera.worldToScreen(p));
  assert.equal(state.propertyWorkspace.hover, null);
  app.tap(state.camera.worldToScreen(p));
  assert.equal(state.workspaceShell.state.selection.kind, 'terrain');
  app.tap(state.camera.worldToScreen({ x: 5000, y: 5000 }));
  assert.equal(state.workspaceShell.state.selection, null);
});

test('compiled drags, cancelled pointers, Space-pan and active drawing tools do not select buildings', async () => {
  const app = await buildingAppHarness(), target = roofTarget(app), state = app.state();
  const screen = () => state.camera.worldToScreen(target.point);
  let start = screen();
  app.fire('pointerdown', start);
  app.fire('pointermove', { x: start.x + 12, y: start.y });
  app.fire('pointerup', { x: start.x + 12, y: start.y });
  assert.equal(state.workspaceShell.state.selection, null);
  start = screen();
  app.fire('pointerdown', start);
  app.fire('pointercancel', start);
  assert.equal(state.workspaceShell.state.selection, null);
  for (const fn of app.globalEvents.keydown) fn({ code: 'Space', key: ' ', preventDefault() {} });
  app.tap(screen());
  assert.equal(state.workspaceShell.state.selection, null);
  for (const fn of app.globalEvents.keyup) fn({ code: 'Space', key: ' ' });
  app.fire('pointermove', screen());
  assert.ok(state.propertyWorkspace.hover);
  app.el('editButton').handlers.click();
  assert.equal(state.propertyWorkspace.hover, null, 'Changing tools clears a stale hover');
  app.tap(screen());
  assert.equal(state.workspaceShell.state.selection, null);
  app.el('panButton').handlers.click();
  app.tap(screen());
  assert.equal(state.workspaceShell.state.selection.kind, 'property');
});

test('compiled full regeneration clears a reused building ID; failed generation keeps accepted selection', async () => {
  const app = await buildingAppHarness(), target = roofTarget(app);
  app.tap(app.state().camera.worldToScreen(target.point));
  const oldProject = JSON.stringify(app.state().project);
  const oldBoundary = app.state().editor.boundary;
  app.state().editor.boundary = [];
  app.el('generateButton').handlers.click();
  assert.equal(JSON.stringify(app.state().project), oldProject);
  assert.equal(app.state().workspaceShell.state.selection.id, target.propertyId);
  app.state().editor.boundary = oldBoundary;
  app.el('generateButton').handlers.click();
  assert.ok(app.state().project.city.properties.some(p => p.id === target.propertyId));
  assert.equal(app.state().workspaceShell.state.selection, null);
  assert.equal(app.state().buildingWorkspace.hover, null);
});
