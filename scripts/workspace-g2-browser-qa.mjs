import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { createProjectDocument } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const source = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const artifacts = new URL('../artifacts/workspace-g2/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const fixture = createProject({ seed: 'c2-planned', size: 'small', morphology: 'planned' });
fixture.city.buildings.find(building => building.id === 'BLD-00061').customName = 'Market Hall';
const saved = createProjectDocument(fixture);
const sizes = [
  ['laptop', 1366, 768],
  ['desktop', 1440, 900],
  ['ultrawide', 5120, 1440],
];

async function exercise(browser, engine, name, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  const entry = page.locator('#roadDesktopPreviewG2');
  const panel = page.locator('#roadPreviewPanel');
  const map = page.locator('#mapCanvas');
  const divider = page.locator('#desktopEditDivider');
  const apply = page.locator('#roadApplyB4');
  const impacts = page.locator('#roadImpactRows').getByRole('button');
  const dock = page.locator('#roadImpactToggle');
  const dockDivider = page.locator('#desktopImpactDivider');
  const activeImpact = page.locator('#roadImpactRows [aria-pressed="true"]');
  const offset = page.locator('#roadIntentDyC1');
  const hall = page.locator('#roadConflictC6-BLD-00061');
  const choice = label => hall.getByRole('button', { name: label, exact: true });
  const accepted = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
  const focus = () => page.evaluate(() => document.activeElement.id);
  const screenshot = state => page.screenshot({ path: new URL(`${engine}-${name}-${state}.png`, artifacts).pathname });
  const awaitPreview = () => page.waitForFunction(() => {
    const s = __buildingQA.state().roadWorkspace.session;
    return s.pending && !s.checking && s.settledRevision === s.revision;
  });
  const openConflict = async () => {
    await entry.click();
    assert.equal(await focus(), 'roadPreviewHeading');
    await page.locator('#roadSelectionKind').selectOption('road');
    await page.locator('#roadSelectionId').selectOption('RD-0113');
    await offset.fill('18');
    await awaitPreview();
    assert.equal(await apply.isDisabled(), true);
    assert.equal(await hall.isVisible(), true);
  };

  try {
    await page.route('**/*', route => route.request().url() === 'http://mappo.test/index.html'
      ? route.fulfill({ contentType: 'text/html', body: source })
      : route.abort());
    await page.goto('http://mappo.test/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    await page.evaluate(document => __buildingQA.apply(document), saved);
    const baseline = await accepted();

    // The original entry point still opens the existing layout.
    await page.locator('#roadModeButton').click();
    assert.equal(await divider.isVisible(), false);
    await page.locator('#roadPreviewCancel').click();

    await openConflict();
    const beforeSize = await panel.boundingBox();
    const beforeMap = await map.boundingBox();
    assert.ok(beforeSize.x >= beforeMap.x + beforeMap.width);
    assert.ok(beforeMap.width >= width * .6);
    await divider.press('ArrowLeft');
    const wider = await panel.boundingBox();
    assert.ok(wider.width >= beforeSize.width + 15);
    await page.waitForFunction(() => Math.abs(__buildingQA.state().camera.width -
      document.getElementById('mapCanvas').getBoundingClientRect().width) <= 1);
    assert.equal(await focus(), 'desktopEditDivider');

    await dock.press('Enter');
    assert.equal(await focus(), 'roadImpactToggle');
    assert.equal(await divider.isVisible(), false);
    const dockMap = await map.boundingBox();
    const dockBounds = await panel.boundingBox();
    assert.ok(dockBounds.y >= dockMap.y + dockMap.height);
    assert.ok(dockMap.width > beforeMap.width);
    assert.ok(dockMap.height >= 240);
    assert.ok(await impacts.count() > 1);
    await dockDivider.press('ArrowDown');
    assert.ok((await map.boundingBox()).height >= dockMap.height + 15);
    await page.waitForFunction(() => Math.abs(__buildingQA.state().camera.height -
      document.getElementById('mapCanvas').getBoundingClientRect().height) <= 1);
    const other = impacts.filter({ hasNotText: 'Market Hall' }).first();
    await other.press('Enter');
    assert.equal(await hall.isVisible(), false);
    assert.equal(await activeImpact.innerText(), await other.innerText());
    const key = await other.getAttribute('data-impact-key');
    assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.focusKey), key);
    await dock.click();
    assert.equal(await divider.isVisible(), true);
    assert.equal(await offset.inputValue(), '18');
    assert.equal(await accepted(), baseline);
    await dock.click();
    assert.equal(await activeImpact.getAttribute('data-impact-key'), key);

    await page.locator('#roadResolveConflictC6').click();
    assert.equal(await page.evaluate(() => document.activeElement.closest('article')?.id), 'roadConflictC6-BLD-00061');
    await choice('Keep it here').click();
    await awaitPreview();
    assert.equal(await apply.isDisabled(), true);
    assert.equal(await accepted(), baseline);
    await screenshot('blocked');

    await choice('Suggest a new location').click();
    await page.waitForFunction(() => !document.getElementById('roadApplyB4').disabled);
    assert.equal(await accepted(), baseline);
    assert.equal(await activeImpact.innerText(), 'Market Hall');
    await screenshot('dock-ready');
    await dock.click();
    // A later numeric edit immediately invalidates the earlier Apply state.
    await offset.fill('');
    assert.equal(await apply.isDisabled(), true);
    await offset.fill('18');
    await awaitPreview();
    assert.equal(await apply.isDisabled(), true);
    await choice('Suggest a new location').click();
    await page.waitForFunction(() => !document.getElementById('roadApplyB4').disabled);
    await page.keyboard.press('Escape');
    assert.equal(await panel.isVisible(), false);
    assert.equal(await focus(), 'roadDesktopPreviewG2');
    assert.equal(await accepted(), baseline);

    await openConflict();
    await choice('Suggest a new location').click();
    await page.waitForFunction(() => !document.getElementById('roadApplyB4').disabled);
    await dock.click();
    await page.setViewportSize({ width, height: 600 });
    await dockDivider.waitFor({ state: 'hidden' });
    assert.equal(await focus(), 'roadPreviewHeading');
    assert.equal(await apply.isEnabled(), true);
    await page.setViewportSize({ width, height });
    await dock.click();
    await screenshot('ready');
    await apply.click();
    await page.waitForFunction(() => !__buildingQA.state().roadWorkspace.active);
    assert.equal(await focus(), 'roadDesktopPreviewG2');
    const relocated = await page.evaluate(() => __buildingQA.state().project.city.buildings.find(b => b.id === 'BLD-00061'));
    assert.equal(relocated.customName, 'Market Hall');
    assert.notEqual(await accepted(), baseline);
    assert.equal(await page.locator('#workspaceUndoButton').innerText(), 'Undo road');
    await page.locator('#workspaceUndoButton').click();
    assert.equal(await accepted(), baseline);
    assert.deepEqual(errors, []);
    console.log('PASS G2/G3A ' + engine + ' ' + name);
  } catch (error) {
    await screenshot('failure').catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
}

for (const [engine, launcher] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await launcher.launch();
  try {
    for (const [name, width, height] of sizes) await exercise(browser, engine, name, width, height);
  } finally {
    await browser.close();
  }
}
