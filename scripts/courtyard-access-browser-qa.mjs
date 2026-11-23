import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';
import { courtyardFixture } from '../tests/helpers/courtyard-fixture.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';
import { createProjectDocument } from '../src/data/project-format.js';

const fixture = courtyardFixture({skewed: true});
const directory = await mkdtemp(join(tmpdir(), 'mappo-s10c-'));
const instrument = async (source, name) => {
  const path = join(directory, name);
  await writeFile(path, observeBuildingApp(await readFile(new URL(source, import.meta.url), 'utf8'),
    '', {legacy: false}));
  return pathToFileURL(path).href;
};
const current = await instrument('../index.html', 'current.html');
const previous = await instrument('../dist/mappo-0.2.14-dev.html', 'previous.html');

try {
  for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
      await context.setOffline(true);
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
      page.setDefaultTimeout(20000);
      const el = id => page.locator('#' + id);
      const ready = () => page.waitForFunction(() => __buildingQA?.state().files.ready);
      const city = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
      const openMenu = async () => {
        if (!await el('projectMenu').isVisible()) await el('projectMenuButton').click();
      };
      const putFile = async content => {
        await openMenu();
        await el('projectFileInput').setInputFiles({
          name: 's10c-test.mappo.json', mimeType: 'application/json', buffer: content
        });
      };
      const openPreview = async () => {
        await el('loadPreview').waitFor({state:'visible'});
        await el('openProjectButton').click();
        await page.waitForFunction(() => !__buildingQA.state().files.busy &&
          document.getElementById('fileStatus').textContent.startsWith('Opened '));
      };
      await page.goto(current);
      await ready();
      await putFile(Buffer.from(JSON.stringify(createProjectDocument(fixture.project, fixture.workspace))));
      await openPreview();
      const initial = await city();
      const startPlacement = async () => {
        await page.evaluate(id => {
          const {workspaceShell} = __buildingQA.state();
          workspaceShell.navigate('city');
          workspaceShell.select({kind:'property', id}, {reveal:true});
        }, fixture.occupant.propertyId);
        await page.getByRole('button', {name:/^Add building(?: to this property)?$/}).click();
        await el('structureCourtyardHost').selectOption(fixture.host.id);
        await el('structurePortalInnerEdge').selectOption({label: 'C4'});
        await el('structurePortalOuterEdge').selectOption({label: 'E1'});
      };
      const enter = async (id, value) => {
        await el(id).fill(String(value));
        await el(id).press('Tab');
      };
      await startPlacement();
      await enter('structureU', fixture.occupant.spec.u.toFixed(2));
      await enter('structureV', fixture.occupant.spec.v.toFixed(2));
      await enter('structureWidth', 2.5);
      await enter('structureDepth', 3);
      await enter('structurePortalWidth', .1);
      assert.equal(await el('structureApply').isDisabled(), true);
      assert.match(await el('desktopPlaceStatus').innerText(), /opening/);
      await enter('structurePortalWidth', 1.5);
      await el('structurePortalOuterEdge').selectOption({label: 'E3'});
      assert.equal(await el('structureApply').isDisabled(), true);
      assert.match(await el('desktopPlaceStatus').innerText(), /one clear wall passage/);
      await el('structurePortalOuterEdge').selectOption({label: 'E1'});
      assert.equal(await el('structureApply').isEnabled(), true);
      assert.equal(await city(), initial, 'preview cannot change accepted city');
      await page.once('dialog', dialog => dialog.accept());
      await el('structureCancel').click();
      assert.equal(await city(), initial, 'cancel preserves the accepted city');
      await startPlacement();
      await enter('structureWidth', 2.5);
      await enter('structureDepth', 3);
      await el('structureApply').press('Enter');
      const accepted = await city();
      assert.notEqual(accepted, initial);
      const host = JSON.parse(accepted).buildings.find(b => b.id === fixture.host.id);
      assert.equal(host.geometry.version, 2);
      assert.equal(host.geometry.courtyardAccess.occupants.length, 1);
      const occupant = JSON.parse(accepted).buildings.find(b => b.id === host.geometry.courtyardAccess.occupants[0].buildingId);
      assert.ok(occupant.accessPath.length >= 5);

      await el('workspaceUndoButton').click();
      assert.equal(await city(), initial);
      await el('workspaceRedoButtonD01').click();
      assert.equal(await city(), accepted);
      await page.evaluate(() => __buildingQA.state().files.flush());
      await page.reload();
      await ready();
      await openMenu();
      await el('restoreRecoveryButton').click();
      await openPreview();
      assert.equal(await city(), accepted);

      await openMenu();
      const downloadEvent = page.waitForEvent('download');
      await el('saveProjectButton').click();
      const bytes = await readFile(await (await downloadEvent).path());
      await putFile(bytes);
      await openPreview();
      assert.equal(await city(), accepted);

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
      console.log('PASS S10-C ' + name + ' file:// skewed C4–E1 placement, blocker, cancel, Undo/Redo, recovery, save and old-reader rejection');
    } finally {
      await browser.close();
    }
  }
} finally {
  await rm(directory, {recursive: true, force: true});
}
