// G4 acceptance: exercise the shipped desktop entrypoint, never the compact QA seam.
// Domain-specific split/merge/courtyard Apply tests remain in their permanent suites.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { createProjectDocument } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const compiled = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const html = observeBuildingApp(compiled, '', { legacy: false });
const origin = 'http://mappo-g4.test/';
const artifactDir = new URL('../artifacts/g4/', import.meta.url);
await mkdir(artifactDir, { recursive: true });
const small = createProject({ seed: 'c2-planned', size: 'small', morphology: 'planned' });
const hall = small.city.buildings.find(item => item.id === 'BLD-00061');
assert.ok(hall, 'Market Hall fixture building must exist');
hall.customName = 'Market Hall';
const large = createProject({ seed: 'c2-organic', size: 'large', morphology: 'organic' });
const oldSaveBytes = await readFile(new URL('../tests/fixtures/save-3b1-format1-schema2.json', import.meta.url));
const oldSave = JSON.parse(oldSaveBytes.toString('utf8'));
const sizes = [
  { label: 'laptop', width: 1366, height: 768 },
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'ultrawide', width: 5120, height: 1440 },
];
const engines = { chromium, firefox };
const requested = process.env.MAPPO_QA_ENGINE ? [process.env.MAPPO_QA_ENGINE] : Object.keys(engines);
const metrics = [];
const failures = [];
const round = n => Math.round(n * 10) / 10;

async function measureDraw(page) {
  return page.evaluate(async () => {
    const samples = [];
    for (let n = 0; n < 5; n++) {
      const t = performance.now();
      __buildingQA.draw();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    return { medianMs: samples[2], maxMs: samples[4] };
  });
}

async function runCase(browser, engine, viewport) {
  const label = engine + '-' + viewport.label;
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true });
  page.setDefaultTimeout(20000);
  const errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().startsWith('http:') || request.url().startsWith('https:')) {
      if (request.url() !== origin) externalRequests.push(request.url());
    }
  });
  const el = id => page.locator('#' + id);
  const tab = name => el('desktopWorkspaceTabs').getByRole('tab', { name });
  const city = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
  const record = { browser: engine, viewport: viewport.label, width: viewport.width, height: viewport.height };
  try {
    await page.route('**/*', route => route.request().url() === origin
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    await page.evaluate(doc => __buildingQA.apply(doc), createProjectDocument(small));
    const baseline = await city();
    const tabs = await page.locator('#desktopWorkspaceTabs [role=tab]').allTextContents();
    assert.deepEqual(tabs, ['Generation','Add','Roads']);
    assert.equal(await el('desktopWorkspaceTabs').isVisible(), true);
    assert.equal(await page.locator('.legacy-workspace-tabs').isVisible(), false);
    assert.ok((await el('mapCanvas').boundingBox()).width > 250);
    assert.equal(await page.evaluate(() => __buildingQA.state().project.schemaVersion), 10);

    // Focused form keys never steer the map. The navigation test uses real input events.
    const oldCamera = await page.evaluate(() => ({
      x: __buildingQA.state().camera.x, y: __buildingQA.state().camera.y,
      zoom: __buildingQA.state().camera.zoom,
    }));
    await el('morphologyInput').focus();
    await page.keyboard.press('ArrowRight');
    const focusedCamera = await page.evaluate(() => ({
      x: __buildingQA.state().camera.x, y: __buildingQA.state().camera.y,
      zoom: __buildingQA.state().camera.zoom,
    }));
    assert.deepEqual(focusedCamera, oldCamera, 'Editing a form must not trigger map shortcuts');
    await el('morphologyInput').selectOption('planned');

    // Wheel/trackpad-style zoom and mouse+Space pan are actual input gestures.
    const canvas = await el('mapCanvas').boundingBox();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.wheel(0, -120);
    await page.waitForFunction(zoom => __buildingQA.state().camera.zoom !== zoom, oldCamera.zoom);
    const zoomed = await page.evaluate(() => __buildingQA.state().camera.zoom);
    const beforePan = await page.evaluate(() => ({
      x: __buildingQA.state().camera.x, y: __buildingQA.state().camera.y,
    }));
    await page.keyboard.down('Space');
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 45, canvas.y + canvas.height / 2 + 30, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const afterPan = await page.evaluate(() => ({
      x: __buildingQA.state().camera.x, y: __buildingQA.state().camera.y,
    }));
    assert.notDeepEqual(afterPan, beforePan, 'Mouse/Space drag should move the map');
    assert.ok(zoomed > 0);
    record.smallDraw = await measureDraw(page);
    assert.equal(await city(), baseline, 'Navigation may not alter the accepted city');

    // Exercise browser zoom without leaving the primary desktop workspace.
    await page.evaluate(() => { document.documentElement.style.zoom = '1.1'; });
    assert.equal(await el('desktopWorkspaceTabs').isVisible(), true);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });

    // Canonical Roads tab: A (edit) -> B (impact dock) -> C (comparison, ultrawide).
    await tab('Roads').click();
    assert.equal(await el('roadPreviewPanel').isVisible(), true);
    const details = el('roadMenuRecordDetails');
    if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
    await el('roadSelectionKind').selectOption('road');
    await el('roadSelectionId').selectOption('RD-0113');
    await details.locator('summary').click();
    const revision = await page.evaluate(() => __buildingQA.state().roadWorkspace.session.revision);
    const start = Date.now();
    await el('roadIntentDyC1').fill('18');
    await page.waitForFunction(() => {
      const s = __buildingQA.state().roadWorkspace.session;
      return s.pending && !s.checking && s.settledRevision === s.revision;
    });
    record.roadPreviewWallMs = Date.now() - start;
    assert.equal(await el('roadApplyB4').isDisabled(), true, 'Unresolved conflict must block Apply');
    assert.equal(await city(), baseline);
    await el('roadResolveConflictC6').click();
    const hallChoice = el('roadConflictC6-BLD-00061');
    assert.equal(await hallChoice.isVisible(), true);
    await el('roadImpactToggle').click();
    assert.equal(await el('desktopImpactDivider').isVisible(), true);
    assert.equal(await city(), baseline);
    await hallChoice.getByRole('button', { name: 'Suggest a new location', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('roadApplyB4').disabled);
    assert.equal(await city(), baseline);
    record.reviewDock = true;
    if (viewport.label === 'ultrawide') {
      assert.equal(await el('roadComparisonToggle').isEnabled(), true);
      await el('roadComparisonToggle').click();
      await page.waitForFunction(() => document.getElementById('roadComparisonProposed').width > 1);
      assert.equal(await el('roadComparisonProposed').isVisible(), true);
      assert.equal(await city(), baseline);
      record.comparison = true;
      await el('roadComparisonToggle').click();
    } else {
      assert.equal(await el('roadComparisonToggle').isDisabled(), true);
      record.comparison = false;
    }
    assert.ok((await page.evaluate(() => __buildingQA.state().roadWorkspace.session.revision)) >= revision);
    await el('roadPreviewCancel').click();
    assert.equal(await city(), baseline, 'Cancel leaves accepted geometry untouched');

    await tab('Generation').click();
    await el('projectMenuButton').click();
    assert.equal(await el('saveProjectButton').isVisible(), true);
    assert.equal(await el('loadProjectButton').isVisible(), true);
    await el('projectMenuClose').click();
    await el('layersMenuButton').click();
    assert.equal(await el('layersMenu').isVisible(), true);
    await el('layersMenuClose').click();

    if (viewport.label === 'desktop') {
      // Real Project -> Load -> preview -> Open on a historical native project.
      await el('projectMenuButton').click();
      await el('projectFileInput').setInputFiles({
        name: 'g4-old-project.mappo.json', mimeType: 'application/json', buffer: oldSaveBytes,
      });
      await el('loadPreview').waitFor({ state: 'visible' });
      await el('openProjectButton').click();
      await page.waitForFunction(() => {
        const files = __buildingQA.state().files;
        return !files.busy && !files.opening &&
          document.querySelector('#fileStatus')?.textContent?.startsWith('Opened ');
      });
      const migrated = await page.evaluate(() => ({
        schema: __buildingQA.state().project.schemaVersion,
        nodes: __buildingQA.state().project.city.nodes.map(n => [n.id, n.x, n.y]),
        roads: __buildingQA.state().project.city.roads.map(r => r.id),
      }));
      assert.equal(migrated.schema, 10, 'Historical project must migrate to schema 10');
      assert.deepEqual(migrated.nodes, oldSave.project.city.nodes.map(n => [n.id, n.x, n.y]),
        'Loading an older save may not regenerate street geometry');
      assert.deepEqual(migrated.roads, oldSave.project.city.roads.map(r => r.id));
      // Opening a project may leave the nonmodal Project menu open; don't
      // toggle it closed before requesting the current-project download.
      if (!await el('projectMenu').isVisible()) await el('projectMenuButton').click();
      assert.equal(await el('saveProjectButton').isVisible(), true);
      const downloadEvent = page.waitForEvent('download', { timeout: 12000 }).catch(() => null);
      await el('saveProjectButton').click();
      const download = await downloadEvent;
      const downloadStatus = await el('fileStatus').innerText();
      assert.ok(download, 'Historical save re-export produced no download. Status: ' + downloadStatus);
      const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
      assert.equal(exported.project.schemaVersion, 10);
      assert.equal(exported.formatVersion, 1);
      assert.equal(exported.project.city.nodes.length, migrated.nodes.length);
      record.legacySave = true;
    }

    if (viewport.label !== 'laptop') {
      await page.evaluate(doc => __buildingQA.apply(doc), createProjectDocument(large));
      const largeBefore = await city();
      record.largeDraw = await measureDraw(page);
      assert.equal(await city(), largeBefore);
    }
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
      mapWidth: document.querySelector('#mapCanvas').getBoundingClientRect().width,
    }));
    assert.ok(layout.documentWidth <= layout.windowWidth + 4, 'Desktop overflow');
    assert.ok(layout.mapWidth >= 200, 'Map must remain usable');
    assert.deepEqual(errors, [], 'Unexpected browser script errors');
    assert.deepEqual(externalRequests, [], 'No network dependencies should be requested');
    record.result = 'passed';
    console.log('PASS G4 ' + label + ' modern workspace, road review, navigation and compatibility');
    return record;
  } catch (error) {
    await page.screenshot({ path: new URL(label + '-failure.png', artifactDir).pathname }).catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
}

for (const name of requested) {
  const engine = engines[name];
  assert.ok(engine, 'Unknown QA engine ' + name);
  const browser = await engine.launch();
  try {
    for (const viewport of sizes) {
      try { metrics.push(await runCase(browser, name, viewport)); }
      catch (error) { failures.push(name + '/' + viewport.label + ': ' + (error.stack ?? error.message)); }
    }
    // File URL without the test observer, HTTP server, CDN or other external assets.
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [], external = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('request', req => {
        if (/^https?:/.test(req.url())) external.push(req.url());
      });
      try {
        await page.goto(new URL('../index.html', import.meta.url).href, { waitUntil: 'domcontentloaded' });
        await page.locator('#desktopWorkspaceTabs').waitFor({ state: 'visible' });
        assert.deepEqual(await page.locator('#desktopWorkspaceTabs [role=tab]').allTextContents(),
          ['Generation','Add','Roads']);
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        console.log('PASS G4 offline file ' + name);
      } finally { await page.close(); }
    } catch (error) { failures.push('offline/' + name + ': ' + (error.stack ?? error.message)); }
  } finally { await browser.close(); }
}
const report = {
  milestone: 'G4', source: 'index.html', browsers: requested,
  machine: { platform: os.platform(), cpus: os.cpus().length, model: os.cpus()[0]?.model },
  methodology: 'Playwright browser acceptance: wall-clock road preview, five double-frame draw samples, same-run Small/Large fixtures. Timings are diagnostic, not an input-latency guarantee.',
  metrics, failures,
};
await writeFile(new URL('desktop-acceptance.json', artifactDir), JSON.stringify(report, null, 2) + '\n');
const rows = metrics.map(m => '| ' + [m.browser,m.viewport,
  round(m.smallDraw.medianMs),m.largeDraw ? round(m.largeDraw.medianMs) : 'not sampled',
  m.roadPreviewWallMs,m.reviewDock ? 'Yes' : 'No',m.comparison ? 'Yes' : 'N/A',
  m.legacySave ? 'Yes' : 'N/A'].join(' | ') + ' |');
await writeFile(new URL('desktop-acceptance.md', artifactDir), [
  '# G4 browser acceptance', '',
  'No pass/fail millisecond threshold: compare runs on comparable hardware; frame timings include Playwright and browser scheduling.',
  '',
  '| Browser | Viewport | Small draw median ms | Large draw median ms | Road preview wall ms | Impact dock | Comparison | Old save |',
  '| --- | --- | ---: | ---: | ---: | --- | --- | --- |',
  ...rows, '',
  failures.length ? 'Failures:\n' + failures.join('\n') : 'All exercised scenarios passed.',
].join('\n') + '\n');
if (failures.length) {
  for (const error of failures) console.error('FAIL G4 ' + error);
  throw new Error('G4 desktop acceptance failed: ' + failures.length + ' case(s)');
}
console.log('G4 desktop acceptance complete: ' + metrics.length + ' browser/viewport cases; offline on ' + requested.length + ' engines.');
