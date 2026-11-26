import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
// H2: native archived save files still open, export and reject unsupported
// data through the real canonical Project menu in Chromium and Firefox.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProjectDocument } from '../src/data/project-format.js';
import { createProject } from '../src/core/city-model.js';
import { projectSimpleBuildingS10 } from '../src/core/building-geometry-adapter-s10.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const original = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const html = observeBuildingApp(original, '', { legacy: false });
const fixtures = [
  ['schema1', 'legacy-3b-schema1.json', 1],
  ['schema4', 'save-3d-format1-schema4.json', 4],
  ['schema8', 'save-3e5-format1-schema8.json', 8],
];
const origin = 'http://mappo-h2.test/';
const artifacts = new URL('../artifacts/h2/', import.meta.url);
await mkdir(artifacts, {recursive:true});
const failures = [];
for (const [name, engine] of [['chromium',chromium],['firefox',firefox]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(20000);
  const errors = [], outbound = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', req => { if (/^https?:/.test(req.url()) && req.url() !== origin) outbound.push(req.url()); });
  const el = id => page.locator('#'+id);
  try {
    await page.route('**/*', route => route.request().url() === origin
      ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
    await page.goto(origin, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    assert.equal(await el('desktopWorkspaceTabs').isVisible(), true);
    await el('projectMenuButton').click();
    for (const [label, filename, schema] of fixtures) {
      const bytes = await readFile(new URL('../tests/fixtures/'+filename, import.meta.url));
      const raw = JSON.parse(bytes.toString('utf8'));
      const project = raw.format === 'mappo-project' ? raw.project : raw;
      assert.equal(project.schemaVersion, schema);
      await el('projectFileInput').setInputFiles({
        name:filename, mimeType:'application/json', buffer:bytes,
      });
      await el('loadPreview').waitFor({state:'visible'});
      assert.match(await el('loadSummary').innerText(),/buildings/);
      await el('openProjectButton').click();
      await page.waitForFunction(() => {
        const state = __buildingQA.state().files;
        return !state.busy && !state.opening && document.getElementById('fileStatus')?.textContent?.startsWith('Opened ');
      });
      const migrated = await page.evaluate(() => __buildingQA.state().project);
      assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
      for (const key of ['nodes','roads','blocks','plots','properties']) {
        if (Object.hasOwn(project.city,key)) assert.deepEqual(migrated.city[key],project.city[key],
          label+': original '+key+' records cannot be regenerated');
      }
      const originals=project.city.buildings??[],converted=migrated.city.buildings;
      assert.equal(converted.length, originals.length);
      for (let i=0;i<originals.length;i++) {
        const before=originals[i],after=converted[i];
        const view=projectSimpleBuildingS10(after.geometry,after.components);
        assert.equal(view.ok,true, label+': migrated building must retain its geometry');
        assert.deepEqual(view.footprint,before.footprint);
        assert.deepEqual(view.holes,before.holes);
        const authored={...before},metadata={...after};
        delete authored.footprint;delete authored.holes;
        delete metadata.geometry;delete metadata.components;
        assert.deepEqual(metadata,authored);
      }
      assert.equal(await el('loadPreview').isVisible(), false);
      console.log('PASS H2 '+name+' '+label+' native project migrated without geometry changes');
    }
    // A future save must fail closed without changing the project being edited.
    const before = await page.evaluate(() => JSON.stringify(__buildingQA.state().project));
    const future = createProjectDocument(createProject({seed:'h2-future',size:'small',morphology:'planned'}));
    future.project.schemaVersion = PROJECT_SCHEMA_VERSION + 1;
    await el('projectFileInput').setInputFiles({
      name:'h2-unsupported.mappo.json', mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(future)),
    });
    await page.waitForFunction(() => !__buildingQA.state().files.busy &&
      document.getElementById('fileStatus')?.textContent?.startsWith('Could not open project:'));
    assert.equal(await el('loadPreview').isVisible(), false);
    assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project)), before);
    // Download the migrated city as a modern schema-10 document, then reopen it.
    if (!await el('projectMenu').isVisible()) await el('projectMenuButton').click();
    const pendingDownload = page.waitForEvent('download',{timeout:20000});
    await el('saveProjectButton').click();
    const file = await pendingDownload;
    const exportedText = await readFile(await file.path(),'utf8');
    const exported = JSON.parse(exportedText);
    assert.equal(exported.formatVersion,1);
    assert.equal(exported.project.schemaVersion,PROJECT_SCHEMA_VERSION);
    assert.deepEqual(exported.project, JSON.parse(before));
    await el('projectFileInput').setInputFiles({
      name:'h2-roundtrip.mappo.json', mimeType:'application/json',
      buffer:Buffer.from(exportedText),
    });
    await el('loadPreview').waitFor({state:'visible'});
    await el('openProjectButton').click();
    await page.waitForFunction(() => {
      const state = __buildingQA.state().files;
      return !state.busy && !state.opening && document.getElementById('fileStatus')?.textContent?.startsWith('Opened ');
    });
    assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project)), before);
    assert.deepEqual(errors,[]);
    assert.deepEqual(outbound,[]);
    console.log('PASS H2 '+name+' unsupported future schema preserves city; exported schema-10 file reopens');
  } catch (e) {
    failures.push(name+': '+(e.stack??e.message));
    await page.screenshot({path:new URL(name+'-failure.png',artifacts).pathname}).catch(()=>{});
  } finally {
    await page.close();
    await browser.close();
  }
}
if(failures.length){for(const message of failures)console.error(message);throw new Error('H2 browser compatibility failed: '+failures.length+' engine(s)');}
