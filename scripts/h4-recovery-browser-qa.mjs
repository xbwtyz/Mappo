// H4 desktop release acceptance: actual recovery storage survives a reload,
// exposes current and previous snapshots, and restores authored geometry on
// explicit user choice. This is not a mock RecoveryStore or compact UI.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { createProjectDocument } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'), '', { legacy: false });
const artifactDir = new URL('../artifacts/h4/', import.meta.url);
await mkdir(artifactDir, { recursive: true });
const origin = 'http://mappo-h4.test/';
const failures = [];
const evidence = [];

function namedProject(seed, name, morphology) {
  const project = createProject({ seed, size: 'small', morphology });
  project.city.name = name;
  // Real authored identity must not disappear during an IndexedDB reload.
  project.city.buildings[0].customName = name + ' - preserved building';
  return project;
}
const archive = namedProject('h4-archive-a', 'H4 Archive A', 'planned');
const latest = namedProject('h4-archive-b', 'H4 Archive B', 'organic');

for (const [engineName, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [], external = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('request', req => {
    if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url());
  });
  const el = id => page.locator('#' + id);
  const currentCity = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
  async function menu() {
    if (!await el('projectMenu').isVisible()) await el('projectMenuButton').click();
    assert.equal(await el('projectMenu').isVisible(), true);
  }
  async function loaded() {
    await page.waitForFunction(() => {
      const files = __buildingQA.state().files;
      return files.ready && !files.busy && !files.opening &&
        document.getElementById('fileStatus')?.textContent?.startsWith('Opened ');
    });
  }
  async function openDocument(project, name) {
    await menu();
    await el('projectFileInput').setInputFiles({
      name: name + '.mappo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(createProjectDocument(project))),
    });
    await el('loadPreview').waitFor({ state: 'visible' });
    await el('openProjectButton').click();
    await loaded();
    assert.equal(await currentCity(), JSON.stringify(project.city), 'Accepted geometry and authored building identity must match imported city');
    await page.evaluate(() => __buildingQA.state().files.flush());
  }
  async function recovered(kind, expectedProject) {
    await menu();
    const button = el(kind === 'latest' ? 'restoreRecoveryButton' : 'restoreBackupButton');
    assert.equal(await button.isEnabled(), true, kind + ' recovery must be available');
    await button.click();
    await el('loadPreview').waitFor({ state: 'visible' });
    assert.equal(await el('openProjectButton').isEnabled(), true);
    await el('openProjectButton').click();
    await loaded();
    assert.equal(await currentCity(), JSON.stringify(expectedProject.city), kind + ' snapshot must restore accepted geometry and authored metadata');
    assert.equal(await el('recoveryChoice').isHidden(), true);
    await page.evaluate(() => __buildingQA.state().files.flush());
  }
  try {
    await page.route('**/*', route => route.request().url() === origin
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    assert.equal(await el('desktopWorkspaceTabs').isVisible(), true);
    // Two real Project-menu imports create both current and backup snapshots.
    await openDocument(archive, 'h4-archive-a');
    await openDocument(latest, 'h4-archive-b');

    // The app must not auto-replace accepted data until the user chooses Restore.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready && !document.getElementById('recoveryChoice').hidden);
    assert.equal(await page.evaluate(() => __buildingQA.state().files.suspended), true);
    await menu();
    assert.match(await el('restoreRecoveryButton').innerText(), /H4 Archive B/);
    assert.match(await el('restoreBackupButton').innerText(), /H4 Archive A/);
    assert.equal(await el('loadPreview').isHidden(), true);
    await recovered('latest', latest);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready && !document.getElementById('recoveryChoice').hidden);
    await menu();
    assert.match(await el('restoreBackupButton').innerText(), /H4 Archive A/);
    await recovered('previous', archive);

    // A recovery is not enough for portability: a real download must reopen.
    await menu();
    const downloadEvent = page.waitForEvent('download', { timeout: 15000 });
    await el('saveProjectButton').click();
    const downloaded = await downloadEvent;
    const raw = await readFile(await downloaded.path(), 'utf8');
    const document = JSON.parse(raw);
    assert.equal(document.formatVersion, 1);
    assert.equal(document.project.schemaVersion, 10);
    assert.equal(JSON.stringify(document.project.city), JSON.stringify(archive.city));
    await el('projectFileInput').setInputFiles({
      name: 'h4-recovery-reopened.mappo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(raw),
    });
    await el('loadPreview').waitFor({ state: 'visible' });
    await el('openProjectButton').click();
    await loaded();
    assert.equal(await currentCity(), JSON.stringify(archive.city));
    assert.deepEqual(pageErrors, [], 'Unexpected browser errors');
    assert.deepEqual(external, [], 'Standalone runtime must not require external network');
    evidence.push({ browser: engineName, viewport: '1440x900', latest: 'passed', backup: 'passed', downloadReopen: 'passed', externalRequests: 0 });
    console.log('PASS H4 ' + engineName + ' persisted current+previous recovery, explicit restore, portable reopen');
  } catch (error) {
    failures.push(engineName + ': ' + (error.stack ?? error.message));
    await page.screenshot({ path: new URL(engineName + '-failure.png', artifactDir).pathname }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }
}
await writeFile(new URL('recovery-acceptance.json', artifactDir), JSON.stringify({ evidence, failures }, null, 2) + '\n');
if (failures.length) {
  for (const error of failures) console.error('FAIL H4 ' + error);
  throw Error('H4 browser recovery acceptance failed: ' + failures.length + ' browser(s)');
}
console.log('H4 complete: real IndexedDB-backed recovery and portable re-open in both desktop browsers.');
