import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';
import { findDirectFootprintFixture } from '../tests/helpers/building-footprint-fixture.js';
import { encodeProjectDocument } from '../src/data/project-format.js';

async function openInspectorFold(page, id) {
  const fold = page.locator('#' + id);
  if (await fold.isVisible() && !await fold.evaluate(node => node.open))
    await fold.locator(':scope > summary').click();
}
async function openIdentity(page) {
  if (await page.locator('#identityInspector').getAttribute('open') !== null) return;
  const action = page.getByRole('button', {name:'Name & use', exact:true});
  if (await action.isVisible()) await action.click();
  else await page.locator('#identityEditorTitle').click();
}

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const origin = 'http://mappo-f2.test/';
const readCity = page => page.evaluate(() => __buildingQA.state().project.city);
const editorPanel = '#buildingTransformPanel';

async function openBuildingEditor(page, building, tool) {
  await page.evaluate(propertyId => {
    __buildingQA.state().propertyWorkspace.select({ kind: 'property', id: propertyId });
  }, building.propertyId);
  await page.locator('[data-inspector-kind="building"][data-inspector-id="' + building.id + '"]').click();
  await page.getByRole('button', { name: /^(Edit building footprint|Edit footprint)$/ }).click();
  await page.locator('#buildingTool' + tool).click();
  assert.equal(await page.locator(editorPanel).isVisible(), true);
}

async function showOnMap(page, point) {
  return page.evaluate(point => {
    const { camera } = __buildingQA.state();
    camera.zoom = 11;
    camera.x = point.x;
    camera.y = point.y + 85 / camera.zoom;
    __buildingQA.draw();
    const rect = document.getElementById('mapCanvas').getBoundingClientRect();
    const screen = camera.worldToScreen(point);
    return { x: rect.left + screen.x, y: rect.top + screen.y };
  }, point);
}

async function exerciseF2(browserName, browserType) {
  const browser = await browserType.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  page.setDefaultTimeout(15000);
  try {
    await page.route('**/*', request => request.request().url() === origin
      ? request.fulfill({ contentType: 'text/html', body: html })
      : request.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    const project = await page.evaluate(() => __buildingQA.state().project);
    const { building, wing, courtyard, vertex, moved } = findDirectFootprintFixture(project);
    const appliedBuilding = async () => (await readCity(page)).buildings.find(item => item.id === building.id);

    await openBuildingEditor(page, building, 'Vertices');
    const point = await showOnMap(page, vertex);
    const opposite = building.footprint[0];
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + (opposite.x - vertex.x) * 11,
      point.y + (opposite.y - vertex.y) * 11, { steps: 5 });
    assert.equal(await page.locator('#buildingPreviewApply').isDisabled(), true);
    assert.match(await page.locator('#buildingPreviewStatus').innerText(), /INVALID/);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(await page.locator('#buildingDirectHandle').evaluate(node => document.activeElement === node), true);
    assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.isPending), false);
    const dragTarget = { x: point.x + (moved.x - vertex.x) * 11, y: point.y + (moved.y - vertex.y) * 11 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(dragTarget.x, dragTarget.y, { steps: 3 });
    await page.mouse.up();
    assert.equal(await page.locator('#buildingPreviewApply').isEnabled(), true);
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#buildingPreviewReset').click();
    // Select by keyboard, and enter the vertex coordinate to preview a change.
    const handle = page.locator('#buildingDirectHandle');
    await handle.focus();
    await handle.press('Home');
    await handle.press('ArrowDown');
    await handle.press('ArrowDown');
    assert.equal(await handle.inputValue(), '2');
    const x = page.locator('#buildingVertexX');
    await x.fill(String(moved.x));
    await x.press('Tab');
    assert.ok(await page.evaluate(() => __buildingQA.state().buildingEditSession.isPending));
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#buildingPreviewReset').click();

    await page.locator('#buildingToolEdges').click();
    const edge = { x: (building.footprint[1].x + vertex.x) / 2, y: (building.footprint[1].y + vertex.y) / 2 };
    const edgeScreen = await showOnMap(page, edge);
    await page.mouse.click(edgeScreen.x, edgeScreen.y);
    assert.equal(await handle.inputValue(), '1');
    await page.locator('#buildingWingDepth').fill(String(wing.depth));
    await page.locator('#buildingAddWing').click();
    assert.equal(await page.locator('#buildingInsertVertex').isDisabled(), true);
    assert.equal(await page.locator('#buildingPreviewApply').isEnabled(), true);
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    await page.locator('#buildingPreviewApply').click();
    assert.equal((await appliedBuilding()).footprint.length, 8);
    const withWing = await readCity(page);
    await page.locator('#buildingHistoryUndo').click();
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(project.city), 'Accepted city should match the expected snapshot');
    await page.locator('#buildingHistoryRedo').click();
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(withWing), 'Accepted city should match the expected snapshot');

    await page.locator('#buildingToolCourtyard').click();
    for (const [suffix, value] of Object.entries({
      X: courtyard.center.x, Y: courtyard.center.y, Width: courtyard.width, Depth: courtyard.depth
    })) await page.locator('#buildingCourtyard' + suffix).fill(String(value));
    await page.locator('#buildingSetCourtyard').click();
    await page.locator('#desktopPlaceReview').click();
    const footprintDetails = page.locator('#buildingFootprintDetails');
    assert.equal(await footprintDetails.isVisible(), true);
    assert.match(await footprintDetails.innerText(), /Occupied.*Plots/);
    await page.locator('#buildingPreviewApply').click();
    const withCourtyard = await readCity(page);
    assert.equal((await appliedBuilding()).holes.length, 1);

    await page.locator('#buildingPreviewCancel').click();
    await openInspectorFold(page, 'workspaceInspectorMore');
    await page.getByRole('button', { name: /^(Replace building \(preview\)|Preview replacement)$/ }).click();
    assert.equal(await page.locator('#structurePreset').inputValue(), '');
    assert.equal(await page.locator('#structureApply').isDisabled(), true);
    await page.locator('#structurePreset').selectOption('rectangle');
    const reviewChoice = page.locator('#desktopPlaceReviewChoice');
    await reviewChoice.click();
    const replaceGeometry = page.locator('#structureReplaceGeometry');
    assert.equal(await replaceGeometry.isVisible(), true);
    assert.equal(await page.locator('#structureApply').isDisabled(), true);
    await replaceGeometry.check();
    await page.locator('#desktopPlaceEdit').click();
    await page.locator('#structurePreset').selectOption('L');
    await reviewChoice.click();
    assert.equal(await replaceGeometry.isChecked(), false);
    assert.ok(JSON.stringify(await readCity(page)) === JSON.stringify(withCourtyard), 'Accepted city should match the expected snapshot');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#structureCancel').click();

    // F4 keeps classification, geometry history, and portable save in one workflow.
    await openIdentity(page);
    const beforeUse = await appliedBuilding();
    const type = beforeUse.type === 'inn' ? 'shop' : 'inn';
    await page.locator('#identityBuildingType').selectOption(type);
    await page.locator('#identityApplyButton').click();
    assert.deepEqual(await appliedBuilding(), { ...beforeUse, type });
    const classified = await readCity(page);
    await page.getByRole('button', { name: /^(Edit building footprint|Edit footprint)$/ }).click();
    await page.locator('#buildingHistoryUndo').click();
    assert.equal((await appliedBuilding()).type, type);
    assert.equal((await appliedBuilding()).holes.length, 0);
    await page.locator('#buildingHistoryRedo').click();
    assert.equal(JSON.stringify(await readCity(page)), JSON.stringify(classified));
    await page.locator('#buildingPreviewCancel').click();

    const saved = await page.evaluate(() => __buildingQA.state().files.captureDocument());
    await page.locator('#projectFileInput').setInputFiles({
      name: 'f2.mappo.json', mimeType: 'application/json', buffer: Buffer.from(encodeProjectDocument(saved))
    });
    await page.locator('#loadPreview').waitFor({ state: 'visible' });
    await page.locator('#openProjectButton').click();
    await page.waitForFunction(() => document.querySelector('#fileStatus').textContent.startsWith('Opened '));
    assert.equal(JSON.stringify(await readCity(page)), JSON.stringify(classified));
    assert.equal(await page.evaluate(() => __buildingQA.state().buildingEditSession.isActive), false);
    assert.deepEqual(errors, []);
    console.log('PASS F2/F4 ' + browserName + ' ' + 'desktop');
  } finally {
    await browser.close();
  }
}

for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  await exerciseF2(name, engine);
}
