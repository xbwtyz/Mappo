import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingAppHarness } from './helpers/building-app.js';

const copyInspection = value => JSON.parse(JSON.stringify(value));
function inspectorFacts(app) {
  const { facts } = app.state().workspaceShell.descriptor().quickInspector;
  return Object.fromEntries(facts.flatMap(section => section.rows ?? []));
}
function expectedDistrict(app, record) {
  const district = app.state().project.city.districts.find(d => d.id === record.districtId);
  return district ? `${district.name} (${district.id})` : 'Unassigned';
}

test('compiled property/child Inspectors show accepted references and individual wing facts without changing project records', async () => {
  const app = await buildingAppHarness();
  const city = app.state().project.city;
  const property = city.properties.find(p => p.buildingIds.length > 1);
  assert.ok(property);
  const before = JSON.stringify(app.state().project);
  app.state().propertyWorkspace.select({ kind: 'property', id: property.id });
  const site = inspectorFacts(app);
  assert.equal(site.Plots, property.plotIds.length);
  assert.equal(site.Buildings, property.buildingIds.length);
  assert.equal(site.District, expectedDistrict(app, property));
  assert.equal(site.Block, property.blockId);
  assert.ok(site['Frontage street'].includes(property.frontageRoadId));
  assert.ok(site['Site area'].endsWith(' square survey units'));
  for (const id of property.plotIds) assert.ok(site['Plot IDs'].includes(id));
  for (const id of property.buildingIds) {
    assert.ok(site['Building IDs'].includes(id));
    assert.equal(app.state().propertyWorkspace.selectBuilding(property.id, id), true);
    const building = city.buildings.find(b => b.id === id), details = inspectorFacts(app);
    assert.equal(details['Occupied plots'], building.plotIds.length);
    assert.equal(details['Plot IDs'], building.plotIds.join(', '));
    assert.equal(details.Property, property.id);
    assert.equal(details.District, expectedDistrict(app, building));
    assert.ok(details['Frontage street'].includes(building.frontageRoadId));
    assert.ok(details['Footprint area'].endsWith(' square survey units'));
    const back = app.state().workspaceShell.descriptor().quickInspector.parent;
    assert.deepEqual(copyInspection(back.selection), { kind: 'property', id: property.id });
    back.run();
    assert.equal(app.state().workspaceShell.state.selection.id, property.id);
  }
  assert.equal(JSON.stringify(app.state().project), before);
});

test('actual district rebuild/undo refreshes property and building facts without stealing selection or replacing geometry', async () => {
  const app = await buildingAppHarness();
  const original = copyInspection(app.state().project.city);
  const propertyId = original.properties.find(p => p.buildingIds.length > 1).id;
  app.state().propertyWorkspace.select({ kind: 'property', id: propertyId });
  app.el('workspaceTab-districts').handlers.click();
  app.el('districtSeedInput').value = 'inspection-first-districts';
  assert.equal(app.el('generateDistrictButton').handlers.click(), true);
  assert.deepEqual(copyInspection(app.state().workspaceShell.state.selection), { kind: 'property', id: propertyId });
  let property = app.state().project.city.properties.find(p => p.id === propertyId);
  assert.equal(inspectorFacts(app).District, expectedDistrict(app, property));
  assert.equal(app.state().districtPanel.editor.selectedDistrictId, null);
  const first = copyInspection(app.state().project.city), firstLabel = inspectorFacts(app).District;
  const buildingId = property.buildingIds[0];
  app.state().propertyWorkspace.selectBuilding(propertyId, buildingId);
  app.el('districtSeedInput').value = 'inspection-second-districts';
  assert.equal(app.el('generateDistrictButton').handlers.click(), true);
  assert.deepEqual(copyInspection(app.state().workspaceShell.state.selection), { kind: 'building', id: buildingId });
  const building = app.state().project.city.buildings.find(b => b.id === buildingId);
  assert.equal(inspectorFacts(app).District, expectedDistrict(app, building));
  assert.notEqual(inspectorFacts(app).District, firstLabel, 'The fixture must actually change displayed district context');
  assert.equal(app.el('undoDistrictButton').handlers.click(), true);
  assert.equal(app.state().workspaceShell.state.selection.id, buildingId);
  assert.equal(inspectorFacts(app).District, firstLabel);
  assert.deepEqual(copyInspection(app.state().project.city), first);
  assert.equal(app.el('undoDistrictButton').handlers.click(), true);
  assert.equal(app.state().workspaceShell.state.selection.id, buildingId);
  assert.deepEqual(copyInspection(app.state().project.city), original, 'Undo restores exact accepted city records');
  property = app.state().project.city.properties.find(p => p.id === propertyId);
  app.el('districtSelect').value = property.districtId;
  app.el('districtSelect').handlers.change();
  assert.equal(app.state().workspaceShell.state.selection.kind, 'district', 'Explicit district selection still changes the Inspector');
});
