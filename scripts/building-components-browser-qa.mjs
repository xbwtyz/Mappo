import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';
import { buildingComponentFixture } from '../tests/helpers/building-component-fixture.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';
import { prepareBuildingComponents } from '../src/editor/building-component-application.js';
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
const s10d = await instrument('../dist/mappo-0.2.16-dev.html', 's10d.html');

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

      const download = async () => {
        await openMenu();
        const event = page.waitForEvent('download');
        await el('saveProjectButton').click();
        return readFile(await (await event).path());
      };
      const recover = async expected => {
        await page.evaluate(() => __buildingQA.state().files.flush());
        await page.reload();
        await ready();
        await openMenu();
        await el('restoreRecoveryButton').click();
        await openPreview();
        assert.equal(await city(),expected);
      };
      const beginJoin = async (incomingId,x,y) => {
        await openEditor();
        await el('componentTarget').selectOption('BC-ROOT');
        await el('componentAction').selectOption('join');
        await el('componentIncoming').selectOption(incomingId);
        await enter('componentOffsetX',x);
        await enter('componentOffsetY',y);
        assert.equal(await el('structureApply').isDisabled(),true);
        assert.match(await el('desktopPlaceStatus').innerText(),/Confirm/);
      };
      const leaf = building(moved).components.find(c=>c.name===fixture.second.name);
      // Join the rear tower into the keep while keeping the north tower detached.
      // A slight sideways offset leaves a positive-width, separate gap from the north tower.
      await beginJoin(leaf.id,-4.5,5.5);
      await el('componentJoinConsent').check();
      assert.equal(await city(),moved);
      await el('structureApply').press('Enter');
      const multipartJoin = await city();
      assert.equal(building(multipartJoin).geometry.version,3);
      assert.equal(building(multipartJoin).components.length,2);
      await el('workspaceUndoButton').click();
      assert.equal(await city(),moved);
      await el('workspaceRedoButtonD01').click();
      assert.equal(await city(),multipartJoin);
      await recover(multipartJoin);
      const multipartBytes = await download();
      await putFile(multipartBytes);
      await openPreview();
      assert.equal(await city(),multipartJoin);

      // Reopen the two-part fixture and join its only detached wing.
      const fixturePair = prepareBuildingComponents(fixture.project,fixture.workspace,fixture.original.id,fixture.first);
      assert.equal(fixturePair.ok,true);
      await putFile(Buffer.from(JSON.stringify(createProjectDocument(fixturePair.candidate,fixture.workspace))));
      await openPreview();
      const prior = await city();
      await beginJoin(tower.id,0,5.5);
      await el('componentJoinConsent').check();
      const click = await page.evaluate(point => {
        const {camera} = __buildingQA.state();
        camera.zoom = 10;
        camera.x = point.x;
        camera.y = point.y + 8;
        __buildingQA.draw();
        const screen = camera.worldToScreen(point);
        const rect = document.getElementById('mapCanvas').getBoundingClientRect();
        return {x:rect.left+screen.x,y:rect.top+screen.y};
      },{x:fixture.first.x,y:fixture.first.y+5.75});
      await page.mouse.click(click.x,click.y);
      assert.ok(Math.abs(Number(await el('componentOffsetY').inputValue())-5.75)<.15);
      assert.equal(await el('componentJoinConsent').isChecked(),false);
      await el('componentJoinConsent').check();
      await enter('componentOffsetY',5.5);
      assert.equal(await el('componentJoinConsent').isChecked(),false);
      assert.equal(await el('structureApply').isDisabled(),true);
      await page.once('dialog', dialog=>dialog.accept());
      await el('structureCancel').click();
      assert.equal(await city(),prior);
      await beginJoin(tower.id,0,5.5);
      await el('componentJoinConsent').check();
      await el('structureApply').click();
      const single = await city();
      assert.equal(building(single).geometry.version,1);
      assert.equal(building(single).components.length,1);
      await recover(single);
      const singleBytes = await download();
      await putFile(singleBytes);
      await openPreview();
      assert.equal(await city(),single);
      await page.evaluate(id => {
        const {workspaceShell} = __buildingQA.state();
        workspaceShell.navigate('city');
        workspaceShell.select({kind:'building',id},{reveal:true});
      },fixture.original.id);
      await page.getByRole('button',{name:/^(Edit building footprint|Edit footprint)$/}).click();
      await enter('buildingOffsetX',.1);
      assert.equal(await el('buildingPreviewApply').isEnabled(),true);

      await page.goto(s10d);
      await ready();
      await putFile(multipartBytes);
      await openPreview();
      assert.equal(await city(),multipartJoin);
      await putFile(singleBytes);
      await openPreview();
      assert.equal(await city(),single);

      await page.goto(previous);
      await ready();
      const previousCity = await city();
      await putFile(multipartBytes);
      await page.waitForFunction(() => !__buildingQA.state().files.busy &&
        document.getElementById('fileStatus').textContent.startsWith('Could not open project:'));
      assert.equal(await el('loadPreview').isHidden(), true);
      assert.equal(await city(), previousCity);
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      console.log('PASS S10-D/E ' + name + ' file:// components, join preview and Cancel, Undo/Redo, recovery, and reader compatibility');
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, {recursive:true, force:true});
}
