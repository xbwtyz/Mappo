import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

const standalone = new URL('../index.html', import.meta.url).href;

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => route.abort());
    // Time the same canvas render/encode path as production without replacing the download.
    await page.addInitScript(() => {
      let started;
      document.addEventListener('click', event => {
        if (event.target.id === 'downloadWholeCityPNG') started = performance.now();
      }, true);
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...options) {
        if (this.isConnected) return toBlob.call(this, callback, ...options);
        const encoding = performance.now();
        return toBlob.call(this, blob => {
          window.wholeCityTiming = { renderMs: encoding - started, encodeMs: performance.now() - encoding };
          callback(blob);
        }, ...options);
      };
    });
    await page.goto(standalone);
    const el = id => page.locator('#' + id);
    await el('cityGenerationSettings').locator('summary').click();
    await el('sizeInput').selectOption('large');
    await el('desktopGenerationPreview').click();
    assert.equal(await el('desktopGenerationApply').isEnabled(), true);
    await el('desktopGenerationApply').click();
    await page.waitForFunction(() => document.querySelector('#mapCanvas')?.width > 150);

    const getDownload = async action => {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), action()]);
      return { filename: download.suggestedFilename(), bytes: await readFile(await download.path()) };
    };
    const project = async () => JSON.parse((await getDownload(() => el('saveProjectButton').click())).bytes);
    const exportWholeCity = async (longestSide, action = () => el('downloadWholeCityPNG').click()) => {
      const dimensions = (await el('wholeCityPNGDimensions').innerText()).match(/(\d+) × (\d+) pixels/);
      assert.ok(dimensions, 'Exact output dimensions are displayed');
      const png = await getDownload(action);
      assert.equal(png.filename, 'City-archive.png');
      assert.equal(png.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      const actual = [png.bytes.readUInt32BE(16), png.bytes.readUInt32BE(20)];
      assert.deepEqual(actual, dimensions.slice(1).map(Number));
      assert.equal(Math.max(...actual), longestSide);
      await page.waitForFunction(() => document.querySelector('#mapExportStatus4F').textContent.includes('PNG download requested'));
      return png.bytes;
    };

    await el('projectMenuButton').click();
    await el('exportFilename4F').fill('City / archive');
    await el('wholeCityPNGOptions').locator('summary').press('Enter');
    assert.equal(await el('wholeCityPNGFraming').inputValue(), 'developed');
    assert.equal(await el('wholeCityPNGSize').inputValue(), '2048');
    await page.waitForFunction(() => document.querySelector('#wholeCityPNGDimensions').textContent.includes('2048'));
    const original = await exportWholeCity(2048, () => el('downloadWholeCityPNG').press('Enter'));
    await el('projectMenuClose').click();

    const map = await el('mapCanvas').boundingBox();
    await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
    await page.mouse.wheel(0, -500);
    await page.getByRole('tab', { name: 'Add', exact: true }).click();
    await page.locator('[data-add=lake]').click();
    await el('lakeRadiusInput').fill('18');
    await el('addLakeButton').click();
    assert.match(await el('landscapeDraftStatus').innerText(), /Draft changes to water/);
    await el('projectMenuButton').click();
    const before = await project();
    assert.equal(before.project.options.size, 'large');
    assert.equal(before.workspace.waterEditor.dirty, true);
    const history = await el('workspaceHistoryListD01').textContent();
    assert.deepEqual(await exportWholeCity(2048), original, 'Camera, selection and water draft do not affect export');

    await el('wholeCityPNGFraming').selectOption('survey');
    await el('wholeCityPNGSize').selectOption('4096');
    await exportWholeCity(4096);
    const timing = await page.evaluate(() => window.wholeCityTiming);
    assert.ok(Number.isFinite(timing.renderMs) && timing.renderMs >= 0 && timing.encodeMs >= 0);
    const dimensions = await el('wholeCityPNGDimensions').innerText();
    console.log(`PASS ${name} Large ${before.project.options.morphology}: ${before.project.city.buildings.length} buildings, ${dimensions} survey, render ${Math.round(timing.renderMs)}ms, PNG encoding ${Math.round(timing.encodeMs)}ms`);
    const after = await project();
    assert.deepEqual(after.project, before.project);
    assert.deepEqual(after.workspace, before.workspace);
    assert.equal(await el('workspaceHistoryListD01').textContent(), history);

    const visible = await getDownload(() => el('downloadMapPNG4F').click());
    assert.deepEqual([visible.bytes.readUInt32BE(16), visible.bytes.readUInt32BE(20)],
      await el('mapCanvas').evaluate(canvas => [canvas.width, canvas.height]));

    await el('projectMenuClose').click();
    await el('layersMenuButton').click();
    await el('buildingsLayer').uncheck();
    await page.keyboard.press('Escape');
    await el('projectMenuButton').click();
    await el('wholeCityPNGFraming').selectOption('developed');
    await el('wholeCityPNGSize').selectOption('2048');
    assert.notDeepEqual(await exportWholeCity(2048), original, 'Whole-city export uses current layers');

    await page.evaluate(() => {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...options) {
        if (this.isConnected) return toBlob.call(this, callback, ...options);
        callback(null);
      };
    });
    await el('downloadWholeCityPNG').click();
    assert.match(await el('mapExportStatus4F').innerText(), /PNG export failed:.*encode/);
    assert.equal(await el('downloadWholeCityPNG').isEnabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
