import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAppHarness } from './helpers/building-app.js';
import { encodeProjectDocument, decodeProjectDocument } from '../src/data/project-format.js';

const copyIdentity = value => JSON.parse(JSON.stringify(value));
function editIdentity(app, name, use = '') {
  app.el('identityNameInput').value = name;
  app.el('identityUseInput').value = use;
  app.el('identityNameInput').handlers.input();
}
test('out-of-scope accepted district edits preserve identity but clear unified Undo safely', async () => {
  const app = await buildingAppHarness(), property = app.state().project.city.properties[0];
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  editIdentity(app, 'Local landmark', 'Guildhall');
  app.el('identityApplyButton').handlers.click();
  app.el('districtSeedInput').value = 'identity-local-districts';
  assert.equal(app.el('generateDistrictButton').handlers.click(), true);
  const districtId = app.state().project.city.properties.find(p => p.id === property.id).districtId;
  assert.equal(app.state().project.city.properties.find(p => p.id === property.id).customName, 'Local landmark');
  assert.equal(app.state().identityWorkspace.editor.history.length, 0,
    'No second actionable accepted-identity cursor is retained.');
  assert.equal(app.state().acceptedHistoryD01.length, 0,
    'District Apply is an explicit out-of-scope accepted history barrier.');
  assert.equal(app.el('identityUndoButton').handlers.click(), false);
  assert.equal(app.state().project.city.properties.find(p => p.id === property.id).districtId, districtId);
  assert.equal(app.state().districtPanel.editor.history.length, 1);
  assert.equal(app.el('undoDistrictButton').handlers.click(), true);
  assert.equal(app.state().project.city.properties.find(p => p.id === property.id).customName, 'Local landmark');
});
test('compiled identity forms apply explicitly, keep independent property/wing drafts, and undo only identity metadata', async () => {
  const app = await buildingAppHarness(), initial = copyIdentity(app.state().project);
  const property = app.state().project.city.properties.find(p => p.buildingIds.length > 1), buildingId = property.buildingIds[0];
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  editIdentity(app, 'The Silver Stag', 'Inn / Tavern');
  assert.equal(app.state().project.city.properties.find(p => p.id === property.id).customName, undefined);
  assert.match(app.el('identityDraftState').textContent, /Unapplied/);
  assert.equal(app.el('identityApplyButton').handlers.click(), true);
  assert.match(app.el('workspaceSelectionName').textContent, /The Silver Stag/);
  assert.match(app.el('workspaceUndoButton').textContent, /Undo .*Rename property/);
  app.state().propertyWorkspace.selectBuilding(property.id, buildingId);
  assert.equal(app.el('identityNameInput').value, '', 'Parent identity is never silently copied to a wing');
  editIdentity(app, 'West Wing', 'other');
  assert.equal(app.el('identityApplyButton').handlers.click(), false, 'Other needs an explicit description');
  app.el('identityOtherUseInput').value = 'Apothecary';
  assert.equal(app.el('identityApplyButton').handlers.click(), true);
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  editIdentity(app, 'Pending name');
  app.state().propertyWorkspace.selectBuilding(property.id, buildingId);
  assert.equal(app.el('identityNameInput').value, 'West Wing');
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  assert.equal(app.el('identityNameInput').value, 'Pending name');
  app.el('identityDiscardButton').handlers.click();
  assert.equal(app.el('identityNameInput').value, 'The Silver Stag');
  assert.equal(app.el('identityUndoButton').handlers.click(), true);
  assert.equal(app.state().project.city.buildings.find(b => b.id === buildingId).customName, undefined);
  assert.equal(app.el('identityNameInput').value, 'The Silver Stag');
  app.el('workspaceUndoButton').handlers.click();
  assert.deepEqual(copyIdentity(app.state().project), initial);
});
test('compiled identity save/load is valid and clears only session history/drafts; invalid apply cannot corrupt accepted metadata', async () => {
  const app = await buildingAppHarness(), property = app.state().project.city.properties[0];
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  editIdentity(app, 'Saved place', 'Temple');
  assert.equal(app.el('identityApplyButton').handlers.click(), true);
  const accepted = copyIdentity(app.state().project);
  editIdentity(app, 'x'.repeat(81));
  assert.equal(app.el('identityApplyButton').handlers.click(), false);
  assert.deepEqual(copyIdentity(app.state().project), accepted);
  const document = app.state().files.captureDocument();
  const loaded = decodeProjectDocument(encodeProjectDocument(document));
  app.apply(loaded);
  assert.deepEqual(copyIdentity(app.state().project), accepted);
  assert.equal(app.state().identityWorkspace.editor.history.length, 0);
  assert.equal(app.state().identityWorkspace.drafts.size, 0);
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  assert.equal(app.el('identityNameInput').value, 'Saved place');
});
test('compiled rebuilding warns before identity loss, cancels safely, preserves failed rebuilds and never reattaches identities by reused ID', async () => {
  const app = await buildingAppHarness(), property = app.state().project.city.properties[0];
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  editIdentity(app, 'Keep this');
  app.el('identityApplyButton').handlers.click();
  const accepted = copyIdentity(app.state().project), oldSeed = app.el('seedInput').value;
  app.el('newSeedButton').handlers.click();
  assert.equal(app.el('identityRebuildWarning').hidden, false);
  assert.equal(app.el('seedInput').value, oldSeed, 'New-seed generation is deferred until confirmation');
  app.el('identityCancelRebuildButton').handlers.click();
  assert.deepEqual(copyIdentity(app.state().project), accepted);
  const boundary = app.state().editor.boundary;
  app.state().editor.boundary = [];
  app.el('generateButton').handlers.click();
  app.el('identityConfirmRebuildButton').handlers.click();
  assert.deepEqual(copyIdentity(app.state().project), accepted);
  assert.equal(app.state().identityWorkspace.editor.history.length, 0);
  assert.equal(app.state().acceptedHistoryD01.length, 1,
    'Failed rebuild must preserve the accepted identity transaction.');
  app.state().editor.boundary = boundary;
  app.el('generateButton').handlers.click();
  assert.match(app.el('identityRebuildMessage').textContent, /customized properties \(1\)/);
  app.el('identityConfirmRebuildButton').handlers.click();
  const reused = app.state().project.city.properties.find(p => p.id === property.id);
  assert.ok(reused);
  assert.equal(reused.customName, undefined);
  assert.equal(app.state().identityWorkspace.editor.history.length, 0);
  assert.equal(app.state().acceptedHistoryD01.length, 0,
    'Successful city rebuild must clear session history.');
  assert.equal(app.state().workspaceShell.state.selection, null);
});
