// Phase 7C browser smoke checks. Only a test-time Playwright dependency;
// the distributed HTML remains free of external scripts and styles.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const url = new URL('../index.html', import.meta.url).href;
const output = new URL('../artifacts/browser-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 5120, height: 1440 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 }
];
const failures = [];

for (const [browserName, browserType] of [['chromium', chromium], ['firefox', firefox]]) {
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
  } catch (error) {
    failures.push(`${browserName} launch: ${error.message}`);
    continue;
  }
  for (const viewport of viewports) {
    const label = `${browserName}-${viewport.name}`;
    const errors = [];
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('#mapCanvas').waitFor({ state: 'visible', timeout: 30000 });
      const mapBefore = await page.locator('#mapCanvas').boundingBox();
      assert.ok(mapBefore && mapBefore.width > 150 && mapBefore.height > 150, `${label}: usable map canvas`);
      await page.screenshot({ path: new URL(`${label}.png`, output).pathname, animations: 'disabled' });

      await page.locator('#projectMenuButton').click();
      assert.equal(await page.locator('#projectMenu').isVisible(), true, `${label}: project menu opens`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#projectMenu').isHidden(), true, `${label}: Escape closes project menu`);
      if (viewport.width <= 670) {
        // On phones the Tools drawer intentionally overlays the map header.
        // Close it before interacting with map controls instead of clicking through it.
        await page.locator('#workspaceCollapseTools').click();
        assert.equal(await page.locator('#workspaceTools').isHidden(), true);
      }
      await page.locator('#layersMenuButton').click();
      assert.equal(await page.locator('#layersMenu').isVisible(), true, `${label}: layers menu opens`);
      // Dev 4f: presets change the existing layer checkboxes; manual edits
      // become Custom, and switching back restores exactly that preset.
      await page.locator('#layerPreset4F').selectOption('planning');
      assert.equal(await page.locator('#propertiesLayer').isChecked(), true);
      assert.equal(await page.locator('#plotsLayer').isChecked(), true);
      assert.equal(await page.locator('#districtColorsLayer').isChecked(), false);
      await page.locator('#propertiesLayer').uncheck();
      assert.equal(await page.locator('#layerPreset4F').inputValue(), 'custom');
      await page.locator('#layerPreset4F').selectOption('presentation');
      assert.equal(await page.locator('#propertiesLayer').isChecked(), false);
      assert.equal(await page.locator('#districtColorsLayer').isChecked(), true);
      assert.equal(await page.locator('#buildingsLayer').isChecked(), true);
      await page.keyboard.press('Escape');

      for (const name of ['landscape','districts','defenses','city']) {
        await page.locator(`#workspaceTab-${name}`).click();
        assert.equal(await page.locator(`#workspaceTab-${name}`).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator(`#workspaceSection-${name}`).isVisible(), true);
      }
      await page.locator('#workspaceCollapseTools').click();
      assert.equal(await page.locator('#workspaceTools').isHidden(), true, `${label}: tools collapse`);
      const mapAfter = await page.locator('#mapCanvas').boundingBox();
      assert.ok(mapAfter && mapAfter.width + 2 >= mapBefore.width, `${label}: map remains usable on panel collapse`);
      await page.locator('#workspaceOpenTools').click();
      assert.equal(await page.locator('#workspaceTools').isVisible(), true, `${label}: tools reopen`);

      if (viewport.width <= 670) {
        await page.locator('#workspaceCollapseTools').click();
        assert.equal(await page.locator('#workspaceTools').isHidden(), true);
      }
      await page.locator('#workspaceOpenInspector').click();
      assert.equal(await page.locator('#workspaceInspector').isVisible(), true, `${label}: inspector opens`);
      await page.locator('#workspaceCloseInspector').click();
      assert.equal(await page.locator('#workspaceInspector').isHidden(), true, `${label}: inspector closes`);

      if (viewport.name === 'desktop') {
        await page.locator('#workspaceTab-landscape').click();
        await page.locator('#landscapeAddButton').click();
        assert.equal(await page.locator('#landscapeTypeInput').isVisible(), true, `${label}: Add feature opens form`);
        for (const [kind, action] of [['lake','addLakeButton'], ['terrain','addTerrainButton'], ['river','generateRiverButton'], ['coast','generateCoastButton']]) {
          await page.locator('#landscapeTypeInput').selectOption(kind);
          assert.equal(await page.locator(`#${action}`).isVisible(), true, `${label}: ${kind} controls visible`);
        }
      }
      if (viewport.name === 'desktop') {
        // Exercise the real standalone file workflow, not merely controller stubs.
        await page.locator('#projectMenuButton').click();
        await page.locator('#exportFilename4F').fill('River / Archive: 4F');
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 20000 }),
          page.locator('#saveProjectButton').click()
        ]);
        assert.equal(download.suggestedFilename(),'River-Archive-4F.mappo.json','Sanitized custom project filename');
        const [pngDownload] = await Promise.all([
          page.waitForEvent('download',{timeout:20000}),
          page.locator('#downloadMapPNG4F').click()
        ]);
        assert.equal(pngDownload.suggestedFilename(),'River-Archive-4F.png');
        const pngChunks=[];
        for await(const chunk of await pngDownload.createReadStream())pngChunks.push(chunk);
        const png=Buffer.concat(pngChunks);
        assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature');
        assert.ok(png.readUInt32BE(16)>150 && png.readUInt32BE(20)>150,'Export has map pixels');
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        const portable = Buffer.concat(chunks);
        const document = JSON.parse(portable.toString('utf8'));
        assert.equal(document.format, 'mappo-project');
        assert.equal(document.project.schemaVersion, 9);
        assert.equal(document.workspace.schemaVersion, 1);
        const geometry = JSON.stringify(document.project.city);
        await page.locator('#projectFileInput').setInputFiles({
          name: 'roundtrip.mappo.json',
          mimeType: 'application/json',
          buffer: portable
        });
        await page.locator('#loadPreview').waitFor({ state: 'visible', timeout: 20000 });
        assert.match(await page.locator('#loadSummary').innerText(), /buildings/);
        await page.locator('#openProjectButton').click();
        await page.waitForFunction(() => document.querySelector('#fileStatus')?.textContent?.startsWith('Opened '), { timeout: 20000 });
        const roundtrip = await page.locator('#mapCanvas').boundingBox();
        assert.ok(roundtrip && roundtrip.width > 150, 'Loaded project still displays the map');
        assert.ok(geometry.length > 200, 'Downloaded project contains full city geometry');
        await page.locator('#projectMenuClose').click();
      }
      const metrics = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        map: document.querySelector('#mapCanvas').getBoundingClientRect().width
      }));
      assert.ok(metrics.width <= metrics.viewport + 3, `${label}: horizontal overflow ${metrics.width}px > ${metrics.viewport}px`);
      assert.equal(errors.length, 0, `${label}: uncaught browser errors: ${errors.join('; ')}`);
      console.log(`PASS ${label}: navigation, menus, panels, inspector, viewport ${metrics.width}/${metrics.viewport}`);
    } catch (error) {
      const message = `${label}: ${error.message}`;
      failures.push(message);
      console.error(`FAIL ${message}`);
      try { await page.screenshot({ path: new URL(`${label}-failure.png`, output).pathname }); } catch {}
    } finally {
      await page.close();
    }
  }
  await browser.close();
}
if (failures.length) {
  console.error(`Phase 7 browser QA: ${failures.length} failures across ${viewports.length * 2} viewports.\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Phase 7 browser QA: 8/8 browser-viewport smoke checks passed.');
}
