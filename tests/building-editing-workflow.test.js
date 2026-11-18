import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAppHarness } from './helpers/building-app.js';
import { hitBuilding } from '../src/core/building-selection.js';
import { createProjectDocument, encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';

const copy = value => JSON.parse(JSON.stringify(value));
const inspectorAction = (app, label) => app.el('workspaceSelectionSections').children
  .flatMap(section => section.children ?? []).find(button => button.textContent === label);
function pickRoof(app, id) {
  const { project, camera } = app.state();
  const building = project.city.buildings.find(b => b.id === id);
  const centroid = building.footprint.reduce((a, p) => ({ x: a.x + p.x / building.footprint.length, y: a.y + p.y / building.footprint.length }), { x: 0, y: 0 });
  for (let i = 0; i < building.footprint.length; i++) {
    const a = building.footprint[i], b = building.footprint[(i + 1) % building.footprint.length];
    const point = { x: .45 * (a.x + b.x) + .1 * centroid.x, y: .45 * (a.y + b.y) + .1 * centroid.y };
    if (hitBuilding(point, project.city.buildings, camera.zoom)?.id === id) return camera.worldToScreen(point);
  }
  assert.fail('Could not find a uniquely selectable roof ' + id);
}
function openEditing(app, property, id) {
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  const child = app.el('workspaceSelectionSections').children.flatMap(section => section.children ?? [])
    .find(button => button.attributes?.['data-inspector-kind'] === 'building' && button.attributes?.['data-inspector-id'] === id);
  assert.ok(child, 'Parent property provides a building navigation action');
  child.handlers.click();
  const edit = inspectorAction(app, 'Edit building footprint');
  assert.ok(edit, 'Building Inspector offers a dedicated editing action');
  edit.handlers.click();
  assert.ok(app.state().buildingEditSession.isEditing(id));
}
test('3G-A compiled Inspector enters and exits visual-only building context without changing the project', async () => {
  const app = await buildingAppHarness(), state = app.state();
  const property = state.project.city.properties.find(p => p.buildingIds.length > 1);
  assert.ok(property);
  const before = JSON.stringify(state.project.city);
  openEditing(app, property, property.buildingIds[0]);
  assert.equal(app.el('draftBadge').textContent, '● BUILDING EDIT MODE');
  assert.match(app.el('toolHint').textContent, /No geometry changes/);
  assert.equal(app.el('mapCanvas').classList.contains('building-edit-mode'), true);
  assert.equal(inspectorAction(app, 'Exit building editing')?.textContent, 'Exit building editing');
  const second = property.buildingIds[1];
  app.tap(pickRoof(app, second));
  assert.equal(state.buildingEditSession.buildingId, second);
  assert.deepEqual(copy(state.workspaceShell.state.selection), { kind: 'building', id: second });
  const outsider = state.project.city.buildings.find(b => b.propertyId !== property.id);
  app.tap(pickRoof(app, outsider.id));
  assert.equal(state.buildingEditSession.buildingId, second, 'Other property clicks must not steal edit mode');
  const capture = app.capture();
  const portable = decodeProjectDocument(encodeProjectDocument(createProjectDocument(capture.project, capture.workspace)));
  assert.equal(portable.project.schemaVersion, 9);
  assert.deepEqual(copy(portable.workspace.ui.selection), { kind: 'building', id: second });
  assert.ok(!JSON.stringify(portable.workspace).includes('buildingEditSession'));
  assert.equal(JSON.stringify(state.project.city), before);
  inspectorAction(app, 'Exit building editing').handlers.click();
  assert.equal(state.buildingEditSession.isActive, false);
  assert.equal(state.workspaceShell.state.selection.id, second);
  assert.equal(app.el('mapCanvas').classList.contains('building-edit-mode'), false);
  assert.equal(JSON.stringify(state.project.city), before);
});
test('3G-A edited context safely exits on Escape, property return, layer hiding and project load', async () => {
  const app = await buildingAppHarness(), state = app.state();
  const property = state.project.city.properties.find(p => p.buildingIds.length > 1);
  const id = property.buildingIds[0], before = JSON.stringify(state.project.city);
  openEditing(app, property, id);
  const keyboard = { key: 'Escape', code: 'Escape', target: { tagName: 'BODY' }, preventDefault() {} };
  for (const listener of app.globalEvents.keydown ?? []) listener(keyboard);
  assert.equal(state.buildingEditSession.isActive, false);
  openEditing(app, property, id);
  const returnToProperty = app.el('workspaceSelectionSections').children.flatMap(section => section.children ?? [])
    .find(button => button.textContent === 'Back to property');
  returnToProperty.handlers.click();
  assert.equal(state.buildingEditSession.isActive, false);
  openEditing(app, property, id);
  const toggle = app.el('buildingsLayer'); toggle.checked = false; toggle.handlers.change({ target: toggle });
  assert.equal(state.buildingEditSession.isActive, false);
  toggle.checked = true; toggle.handlers.change({ target: toggle });
  openEditing(app, property, id);
  const saved = app.capture();
  app.apply(decodeProjectDocument(encodeProjectDocument(createProjectDocument(saved.project, saved.workspace))));
  assert.equal(app.state().buildingEditSession.isActive, false);
  assert.equal(JSON.stringify(app.state().project.city), before);
});
test('3G-A retains panning, zooming and no building-selection on pointer drags', async () => {
  const app = await buildingAppHarness(), state = app.state();
  const property = state.project.city.properties.find(p => p.buildingIds.length > 1);
  const id = property.buildingIds[0], before = JSON.stringify(state.project.city);
  openEditing(app, property, id);
  const beforeX = state.camera.x, point = pickRoof(app, id);
  app.fire('pointerdown', point);
  app.fire('pointermove', { x: point.x + 22, y: point.y + 6 });
  app.fire('pointerup', { x: point.x + 22, y: point.y + 6 });
  assert.notEqual(state.camera.x, beforeX);
  assert.equal(state.buildingEditSession.buildingId, id);
  const beforeZoom = state.camera.zoom;
  app.el('mapCanvas').handlers.wheel({ deltaY: -120, clientX: point.x, clientY: point.y, preventDefault() {} });
  assert.ok(state.camera.zoom > beforeZoom);
  assert.equal(JSON.stringify(state.project.city), before);
  state.workspaceShell.navigate('landscape');
  assert.equal(state.buildingEditSession.isActive, false);
});
