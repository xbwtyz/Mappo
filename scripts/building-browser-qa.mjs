// Runs against the compiled standalone document. The sole test-only addition is
// a closure-state observer; shipped HTML has no QA globals or runtime dependency.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const output = new URL('../artifacts/building-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 5120, height: 1440 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 }
];
const failures = [];

for (const [browserName, browserType] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await browserType.launch({ headless: true });
  for (const viewport of viewports) {
    const label = `${browserName}-${viewport.name}`, page = await browser.newPage({ viewport });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      // about:blank/setContent has an opaque origin and blocks browser storage,
      // causing the real app to open its storage warning over unrelated controls.
      // Intercept a normal test origin instead; no server or network is needed.
      await page.route('**/*', route => route.request().url() === 'http://mappo.test/index.html'
        ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
      await page.goto('http://mappo.test/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => __buildingQA.state().files.ready);
      assert.ok(await page.evaluate(() => Boolean(__buildingQA.state().files.store)), 'Browser fixture needs normal-origin storage');
      if (viewport.width <= 670) await page.locator('#workspaceCollapseTools').click();
      const geometry = await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
      const id = await page.evaluate(() => {
        const { project, camera, buildingWorkspace, landscapeWorkspace } = __buildingQA.state();
        camera.zoom = 3;
        for (const building of project.city.buildings) {
          const center = building.footprint.reduce((p, v) => ({
            x: p.x + v.x / building.footprint.length, y: p.y + v.y / building.footprint.length
          }), { x: 0, y: 0 });
          for (let i = 0; i < building.footprint.length; i++) {
            const a = building.footprint[i], b = building.footprint[(i + 1) % building.footprint.length];
            const point = { x: .45 * (a.x + b.x) + .1 * center.x, y: .45 * (a.y + b.y) + .1 * center.y };
            if (buildingWorkspace.hit(point, camera.zoom)?.id !== building.id || landscapeWorkspace.hit(point, camera.zoom)) continue;
            camera.x = point.x;
            camera.y = point.y;
            __buildingQA.target = point;
            __buildingQA.draw();
            return building.id;
          }
        }
        throw new Error('No generated roof available');
      });
      const target = async () => {
        const p = await page.evaluate(() => __buildingQA.state().camera.worldToScreen(__buildingQA.target));
        const box = await page.locator('#mapCanvas').boundingBox();
        return { x: box.x + p.x, y: box.y + p.y };
      };
      let p = await target();
      await page.mouse.move(p.x, p.y);
      assert.equal(await page.evaluate(() => __buildingQA.state().buildingWorkspace.hover?.id), id);
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Building');
      assert.equal(await page.locator('#workspaceSelectionName').innerText(), id);
      assert.equal(await page.locator('#workspaceInspector').isVisible(), true);
      await page.screenshot({ path: new URL(`${label}-selected.png`, output).pathname });

      // Collapsing and reselecting uses the same record at the resized camera.
      await page.locator('#workspaceCloseInspector').click();
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceInspector').isVisible(), true);
      await page.locator('#workspaceCloseInspector').click();

      // No selection after cancelled click/drag; ordinary map dragging still pans.
      await page.evaluate(() => __buildingQA.state().workspaceShell.clear());
      p = await target();
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 40, p.y + 20, { steps: 5 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), null);
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceSelectionName').innerText(), id);
      await page.locator('#workspaceCloseInspector').click();

      await page.locator('#layersMenuButton').click();
      await page.locator('#buildingsLayer').uncheck();
      await page.locator('#layersMenuClose').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), null);
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.notEqual(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection?.kind), 'building');
      // A district inspector/drawer may now cover map controls on narrow layouts.
      if (await page.locator('#workspaceInspector').isVisible()) await page.locator('#workspaceCloseInspector').click();
      if (viewport.width <= 670 && await page.locator('#workspaceTools').isVisible()) await page.locator('#workspaceCollapseTools').click();
      await page.locator('#layersMenuButton').click();
      await page.locator('#buildingsLayer').check();
      await page.locator('#layersMenuClose').click();
      p = await target();
      await page.mouse.click(p.x, p.y);
      assert.equal(await page.locator('#workspaceSelectionType').innerText(), 'Building');
      assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)), geometry);
      const saved = await page.evaluate(() => __buildingQA.state().files.captureDocument());
      assert.equal(saved.project.schemaVersion, 9);
      assert.equal(saved.workspace.schemaVersion, 1);
      assert.equal(saved.workspace.ui.selection, null, 'Session-only 3F-A selection does not break saving');
      if (await page.locator('#workspaceInspector').isVisible()) await page.locator('#workspaceCloseInspector').click();
      if (viewport.width <= 670) await page.locator('#workspaceOpenTools').click();
      await page.locator('#generateButton').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().workspaceShell.state.selection), null);
      assert.ok(await page.evaluate(id => __buildingQA.state().project.city.buildings.some(b => b.id === id), id));
      assert.equal(errors.length, 0, errors.join('; '));
      console.log(`PASS building ${label}: roof hit, hover, inspector, drag, layers, save safety, regeneration`);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      await page.screenshot({ path: new URL(`${label}-failure.png`, output).pathname });
      console.error(`FAIL building ${label}: ${error.stack}`);
      console.error(await page.evaluate(() => ({ fileStatus: document.querySelector('#fileStatus')?.textContent,
        projectMenuVisible: !document.querySelector('#projectMenu')?.hidden,
        layersMenuVisible: !document.querySelector('#layersMenu')?.hidden })));
    } finally {
      await page.close();
    }
  }
  await browser.close();
}
if (failures.length) throw new Error(`Building browser QA failures:\n${failures.join('\n')}`);
console.log('Building browser QA: 8/8 browser-viewport checks passed.');
