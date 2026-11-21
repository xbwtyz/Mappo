// G4 cross-editor acceptance on the canonical >=1000px desktop workspace.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { preparePropertyBuildingClear4E } from '../src/editor/property-building-clear-4e.js';
import { PropertySplitSessionE2, inspectPropertySplitE2, preparePropertySplitE2 } from '../src/editor/property-split-e2.js';
import { PropertyMergeSessionE3, inspectPropertyMergeE3 } from '../src/editor/property-merge-e3.js';
import { findDirectFootprintFixture } from '../tests/helpers/building-footprint-fixture.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

function buildFixture() {
  const base = createProject({ seed: 'e3-browser-qa', size: 'small', morphology: 'planned' });
  for (const property of base.city.properties) {
    if (property.boundary.length !== 4) continue;
    const cleared = property.buildingIds.length
      ? preparePropertyBuildingClear4E(base, defaultWorkspace(base), property.id)
      : { ok: true, candidate: base };
    if (!cleared.ok) continue;
    const project = cleared.candidate;
    const split = new PropertySplitSessionE2();
    if (!split.start(project.city, property.id) || !inspectPropertySplitE2(project, split).ok) continue;
    const result = preparePropertySplitE2(project, defaultWorkspace(project), split);
    if (!result.ok) continue;
    const merge = new PropertyMergeSessionE3();
    merge.start(result.candidate.city, result.sourcePropertyId);
    merge.choose(result.candidate.city, result.newPropertyId);
    if (!inspectPropertyMergeE3(result.candidate, merge).ok) continue;
    try {
      const building = findDirectFootprintFixture(project);
      return { project, propertyId: property.id, building };
    } catch {
      // Continue to a safe parcel that also retains an editable building elsewhere.
    }
  }
  throw Error('No integrated split/merge/courtyard fixture found');
}
const fixture = buildFixture();
const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'), '', { legacy: false });
const screenshots = new URL('../artifacts/g4-cross-editor/', import.meta.url);
await mkdir(screenshots, { recursive: true });
const errors = [];
const engines = { chromium, firefox };
const names = process.env.MAPPO_QA_ENGINE ? [process.env.MAPPO_QA_ENGINE] : Object.keys(engines);
for (const name of names) {
  const browser = await engines[name].launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const el = id => page.locator('#' + id);
  const city = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
  try {
    await page.route('**/*', route => route.request().url() === 'http://mappo-g4-cross.test/'
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto('http://mappo-g4-cross.test/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    assert.equal(await el('desktopWorkspaceTabs').isVisible(), true);
    await page.evaluate(doc => __buildingQA.apply(doc), {
      project: fixture.project, workspace: defaultWorkspace(fixture.project),
    });
    const baseline = await city();
    const originalCount = fixture.project.city.properties.length;
    const originalRoads = fixture.project.city.roads.map(r => [r.id, r.a, r.b]);

    // Start a real split through the selected-property Inspector.
    await page.evaluate(id => __buildingQA.state().workspaceShell.select({ kind: 'property', id }), fixture.propertyId);
    await page.getByRole('button', { name: 'Split property', exact: true }).click();
    assert.equal(await el('propertySplitPanelE2').isVisible(), true);
    assert.equal(await el('propertySplitApplyE2').isEnabled(), true);
    assert.equal(await city(), baseline, 'Split draft cannot mutate the accepted city');
    await el('propertySplitApplyE2').click();
    await page.waitForFunction(() => !__buildingQA.state().propertySplitE2.active);
    const splitProps = await page.evaluate(() => __buildingQA.state().project.city.properties.map(p => p.id));
    assert.equal(splitProps.length, originalCount + 1);
    const successor = splitProps.find(id => !fixture.project.city.properties.some(p => p.id === id));
    assert.ok(successor, 'Split must create an explicit successor property');

    // Merge siblings via another real Inspector action, preserving the street graph.
    await page.evaluate(id => __buildingQA.state().workspaceShell.select({ kind: 'property', id }), fixture.propertyId);
    await page.getByRole('button', { name: 'Merge properties', exact: true }).click();
    await el('propertyMergeNeighborE3').selectOption(successor);
    assert.equal(await el('propertyMergeApplyE3').isEnabled(), true);
    await el('propertyMergeApplyE3').click();
    await page.waitForFunction(() => !__buildingQA.state().propertyMergeE3.active);
    const merged = await page.evaluate(() => ({
      properties: __buildingQA.state().project.city.properties.length,
      roads: __buildingQA.state().project.city.roads.map(r => [r.id, r.a, r.b]),
    }));
    assert.equal(merged.properties, originalCount);
    assert.deepEqual(merged.roads, originalRoads, 'Property edits must preserve roads');

    // Select another real building through its parent and edit both wing and courtyard.
    const { building, wing, courtyard } = fixture.building;
    await page.evaluate(id => __buildingQA.state().workspaceShell.select({ kind: 'property', id }), building.propertyId);
    await page.locator('[data-inspector-kind="building"][data-inspector-id="' + building.id + '"]').click();
    await page.getByRole('button', { name: /^(Edit building footprint|Edit footprint)$/ }).click();
    await el('buildingToolEdges').click();
    const edge = {
      x: (building.footprint[1].x + building.footprint[2].x) / 2,
      y: (building.footprint[1].y + building.footprint[2].y) / 2,
    };
    const screen = await page.evaluate(point => {
      const camera = __buildingQA.state().camera;
      camera.zoom = 11; camera.x = point.x; camera.y = point.y + 85 / camera.zoom;
      __buildingQA.draw();
      const rect = document.getElementById('mapCanvas').getBoundingClientRect();
      const s = camera.worldToScreen(point);
      return { x: rect.left + s.x, y: rect.top + s.y };
    }, edge);
    await page.mouse.click(screen.x, screen.y);
    await el('buildingWingDepth').fill(String(wing.depth));
    await el('buildingAddWing').click();
    assert.equal(await el('buildingPreviewApply').isEnabled(), true);
    await el('buildingPreviewApply').click();
    const withWing = await page.evaluate(id => __buildingQA.state().project.city.buildings.find(b => b.id === id), building.id);
    assert.ok(withWing.footprint.length > building.footprint.length);

    await el('buildingToolCourtyard').click();
    for (const [suffix, value] of Object.entries({
      X: courtyard.center.x, Y: courtyard.center.y,
      Width: courtyard.width, Depth: courtyard.depth,
    })) await el('buildingCourtyard' + suffix).fill(String(value));
    assert.equal(await el('buildingPreviewApply').isEnabled(), true);
    await el('buildingPreviewApply').click();
    const accepted = await city();
    assert.equal(await page.evaluate(id => __buildingQA.state().project.city.buildings.find(b => b.id === id).holes.length, building.id), 1);
    await el('buildingHistoryUndo').click();
    assert.equal(await page.evaluate(id => __buildingQA.state().project.city.buildings.find(b => b.id === id).holes.length, building.id), 0);
    await el('buildingHistoryRedo').click();
    assert.equal(await city(), accepted);
    const captured = await page.evaluate(() => __buildingQA.capture());
    await page.evaluate(doc => __buildingQA.apply(doc), captured);
    assert.equal(await city(), accepted, 'Accepted cross-editor changes survive portable round-trip');
    assert.deepEqual(pageErrors, []);
    console.log('PASS G4 cross-editor ' + name + ' split/merge/wing/courtyard/Undo/Redo/portable reopen');
  } catch (error) {
    errors.push(name + ': ' + (error.stack ?? error.message));
    await page.screenshot({ path: new URL(name + '-failure.png', screenshots).pathname }).catch(() => {});
  } finally {
    await page.close();
    await browser.close();
  }
}
if (errors.length) throw new Error('G4 cross-editor failures:\n' + errors.join('\n'));
