import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';
import { buildingComponentFixture } from '../tests/helpers/building-component-fixture.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';
import { createProjectDocument } from '../src/data/project-format.js';

const fixture = buildingComponentFixture();
const directory = await mkdtemp(join(tmpdir(), 'mappo-components-'));
const instrument = async (source, name) => {
  const path = join(directory, name);
  await writeFile(path, observeBuildingApp(await readFile(new URL(source, import.meta.url), 'utf8'), '', {legacy:false}));
  return pathToFileURL(path).href;
};
const current = await instrument('../index.html', 'current.html');
const previous = await instrument('../dist/mappo-0.2.15-dev.html', 'previous.html');

try {
  for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({viewport:{width:1440,height:900}, acceptDownloads:true});
      await context.setOffline(true);
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
      page.setDefaultTimeout(20000);
      const el = id => page.locator('#' + id);
      const ready = () => page.waitForFunction(() => __buildingQA.state().files.ready);
      const city = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
      const building = state => JSON.parse(state).buildings.find(b => b.id === fixture.original.id);
      const openMenu = async () => {
        if (!await el('projectMenu').isVisible()) await el('projectMenuButton').click();
      };
      const putFile = async content => {
        await openMenu();
        await el('projectFileInput').setInputFiles({
          name:'components.mappo.json', mimeType:'application/json', buffer:content
        });
      };
      const openPreview = async () => {
        await el('loadPreview').waitFor({state:'visible'});
        await el('openProjectButton').click();
        await page.waitForFunction(() => !__buildingQA.state().files.busy &&
          document.getElementById('fileStatus').textContent.startsWith('Opened '));
      };
      const openEditor = async () => {
        await page.evaluate(id => {
          const {workspaceShell} = __buildingQA.state();
          workspaceShell.navigate('city');
          workspaceShell.select({kind:'building', id}, {reveal:true});
        }, fixture.original.id);
        await page.getByRole('button', {name:/^Edit (building )?components$/}).click();
        await el('structureComponentEditor').waitFor({state:'visible'});
      };
      const enter = async (id, value) => {
        await el(id).fill(String(value));
        await el(id).press('Tab');
      };
      const addPart = async (part, parent = '') => {
        await openEditor();
        await el('componentTarget').selectOption(parent);
        await el('componentAction').selectOption('add');
        await enter('componentName', part.name);
        await enter('componentCenterX', part.x.toFixed(3));
        await enter('componentCenterY', part.y.toFixed(3));
        assert.equal(await el('structureApply').isEnabled(), true, await el('desktopPlaceStatus').innerText());
        await el('structureApply').click();
      };

      await page.goto(current);
      await ready();
      await putFile(Buffer.from(JSON.stringify(createProjectDocument(fixture.project, fixture.workspace))));
      await openPreview();
      const initial = await city();
      await addPart(fixture.first);
      const pair = await city();
      const tower = building(pair).components.find(c => c.name === fixture.first.name);
      await addPart(fixture.second, tower.id);
      const triple = await city();
      assert.equal(building(triple).components.length, 3);
      assert.equal(JSON.parse(triple).buildings.length, JSON.parse(initial).buildings.length);

      await openEditor();
      await el('componentTarget').selectOption(tower.id);
      await enter('componentOffsetY', '.5');
      assert.equal(await city(), triple);
      assert.equal(await el('structureApply').isEnabled(), true, await el('desktopPlaceStatus').innerText());
      await el('structureApply').press('Enter');
      const moved = await city();
      assert.notEqual(moved, triple);
      await el('workspaceUndoButton').click();
      assert.equal(await city(), triple);
      await el('workspaceRedoButtonD01').click();
      assert.equal(await city(), moved);

      await openMenu();
      const downloadEvent = page.waitForEvent('download');
      await el('saveProjectButton').click();
      const bytes = await readFile(await (await downloadEvent).path());
      await putFile(bytes);
      await openPreview();
      assert.equal(await city(), moved);
      await page.goto(previous);
      await ready();
      const previousCity = await city();
      await putFile(bytes);
      await page.waitForFunction(() => !__buildingQA.state().files.busy &&
        document.getElementById('fileStatus').textContent.startsWith('Could not open project:'));
      assert.equal(await el('loadPreview').isHidden(), true);
      assert.equal(await city(), previousCity);
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      console.log('PASS S10-D ' + name + ' file:// component creation, subtree transform, Undo/Redo, save and old-reader rejection');
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, {recursive:true, force:true});
}
