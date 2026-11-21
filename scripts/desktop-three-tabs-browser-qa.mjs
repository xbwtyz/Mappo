import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'), '', { legacy: false });
const origin = 'http://mappo-desktop.test/';
const engines = { chromium, firefox };
const engineNames = process.env.MAPPO_QA_ENGINE ? [process.env.MAPPO_QA_ENGINE] : Object.keys(engines);
const chromiumArgs = process.env.MAPPO_CHROMIUM_SINGLE_PROCESS ? ['--single-process', '--no-zygote', '--disable-gpu'] : [];

for (const name of engineNames) {
  const browser = await engines[name].launch(name === 'chromium' ? { args: chromiumArgs } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const el = id => page.locator('#' + id);
    const tab = name => page.getByRole('tab', { name, exact: true }).click();
    const city = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
    await page.route('**/*', route => route.request().url() === origin
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
    await page.goto(origin);
    await page.waitForFunction(() => __buildingQA.state().files.ready);

    assert.deepEqual(await page.locator('#desktopWorkspaceTabs [role=tab]').allTextContents(), ['Generation', 'Add', 'Roads']);
    assert.ok((await el('mapCanvas').boundingBox()).width > 600);
    const original = await city();
    await el('morphologyInput').selectOption('planned');
    await el('desktopGenerationPreview').click();
    assert.equal(await el('desktopGenerationApply').isEnabled(), true);
    await el('desktopGenerationBefore').click();
    await el('desktopGenerationProposed').click();
    assert.equal(await city(), original, 'Review leaves the accepted city intact');
    await el('desktopGenerationEdit').click();
    await el('morphologyInput').selectOption('radial');
    assert.equal(await el('desktopGenerationApply').isDisabled(), true, 'Changing inputs invalidates a preview');

    await page.locator('[data-generation=districts]').click();
    await el('districtNumberInput').selectOption('4');
    await el('desktopGenerationPreview').click();
    assert.match(await el('desktopGenerationImpactText').innerText(), /4 districts/);
    await el('desktopGenerationApply').click();
    assert.equal(await el('districtCount').innerText(), '4');

    await tab('Add');
    await page.locator('[data-add=lake]').click();
    await el('lakeRadiusInput').fill('18');
    await el('addLakeButton').click();
    assert.match(await el('landscapeDraftStatus').innerText(), /Draft changes to water/);
    await el('landscapeReviewRebuild').click();
    assert.equal(await el('desktopWorkspaceHeading').innerText(), 'Generation');
    const beforeRebuild = await city();
    await el('desktopGenerationPreview').click();
    assert.equal(await el('desktopGenerationApply').isEnabled(), true);
    assert.equal(await city(), beforeRebuild);
    await el('desktopGenerationCancel').click();
    assert.equal(await page.evaluate(() => __buildingQA.state().waterPanel.editor.dirty), true);

    await tab('Add');
    await page.locator('[data-add=property]').click();
    assert.equal(await el('propertyCreatePanelE1').isVisible(), true);
    await el('propertyCreateCancelE1').click();
    await page.locator('[data-add=building]').click();
    const point = await page.evaluate(() => {
      const { project, propertyWorkspace, camera } = __buildingQA.state();
      for (const property of project.city.properties) {
        const center = property.boundary.reduce((p, v) => ({
          x: p.x + v.x / property.boundary.length, y: p.y + v.y / property.boundary.length,
        }), { x: 0, y: 0 });
        if (propertyWorkspace.hit(center, camera.zoom)?.id === property.id)
          return camera.worldToScreen(center);
      }
      return null;
    });
    assert.ok(point);
    await el('mapCanvas').click({ position: point });
    assert.equal(await el('buildingStructurePanel').isVisible(), true);
    page.once('dialog', dialog => dialog.accept());
    await el('structureCancel').click();

    await tab('Roads');
    assert.equal(await el('roadPreviewPanel').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await el('roadPreviewPanel').isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.workspace), 'roads');
    await tab('Generation');
    await page.setViewportSize({ width: 768, height: 850 });
    assert.equal(await el('desktopWorkspaceTabs').isHidden(), true);
    assert.equal(await el('workspaceTab-city').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS ' + name + ' three-tab workspace, generation review, placement, road focus, and compact fallback');
  } finally {
    await browser.close();
  }
}
