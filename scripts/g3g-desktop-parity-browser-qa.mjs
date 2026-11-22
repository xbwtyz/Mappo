import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

// The G3G suite checks the production desktop UI, not the historical compact QA seam.
const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'), '', { legacy: false });
const origin = 'http://mappo-g3g.test/';
const engines = { chromium, firefox };
const names = process.env.MAPPO_QA_ENGINE ? [process.env.MAPPO_QA_ENGINE] : Object.keys(engines);
for (const name of names) {
  const browser = await engines[name].launch();
  try {
    for (const viewport of [{width:1366,height:768},{width:1440,height:900},{width:5120,height:1440}]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.request().url().startsWith(origin)
        ? route.fulfill({ contentType:'text/html', body:html }) : route.abort());
      const el = id => page.locator('#'+id);
      const tab = text => page.locator('#desktopWorkspaceTabs').getByRole('tab', {name:text});
      try {
        await page.goto(origin+'?workspace=legacy');
        await page.waitForFunction(() => globalThis.__buildingQA?.state().files.ready);
        assert.equal(await el('desktopWorkspaceTabs').isVisible(),true);
        assert.equal(await page.locator('.legacy-workspace-tabs').isVisible(),false);
        assert.equal(await el('roadDesktopPreviewG2').isVisible(),false);
        assert.deepEqual(await page.locator('#desktopWorkspaceTabs [role=tab]').allTextContents(),['Generation','Add','Roads']);
        const before = await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
        await el('morphologyInput').selectOption('planned');
        await el('desktopGenerationPreview').click();
        assert.equal(await el('desktopGenerationApply').isEnabled(),true);
        await tab('Generation').click();
        assert.equal(await el('desktopGenerationApply').isEnabled(),true,'Active tab retains its preview');
        await el('desktopGenerationCancel').click();
        assert.equal(await page.evaluate(() => JSON.stringify(__buildingQA.state().project.city)),before);
        await tab('Add').click();
        assert.equal(await el('desktopHomeAdd').isVisible(),true);
        await tab('Add').click();
        await page.locator('[data-add=lake]').click();
        assert.equal(await el('addLakeButton').isVisible(),true);
        await el('desktopLandscapeReview').click();
        assert.equal(await el('desktopLandscapeImpactText').isVisible(),true);
        await tab('Roads').click();
        assert.equal(await el('roadPreviewPanel').isVisible(),true);
        await tab('Roads').click();
        assert.equal(await el('roadPreviewPanel').isVisible(),true);
        await page.keyboard.press('Escape');
        assert.equal(await el('roadPreviewPanel').isHidden(),true);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.workspace),'roads');
        await tab('Roads').click();
        assert.equal(await el('roadPreviewPanel').isVisible(),true,'Roads can reopen after Escape');
        await page.keyboard.press('Escape');
        await tab('Generation').click();
        await el('projectMenuButton').click();
        assert.equal(await el('projectMenu').isVisible(),true);
        assert.equal(await el('saveProjectButton').isVisible(),true);
        assert.equal(await el('loadProjectButton').isVisible(),true);
        await el('projectMenuClose').click();
        await el('layersMenuButton').click();
        assert.equal(await el('layersMenu').isVisible(),true);
        await el('layersMenuClose').click();
        await page.setViewportSize({width:768,height:850});
        assert.equal(await el('desktopWorkspaceTabs').isHidden(),true);
        assert.equal(await el('workspaceTab-city').isVisible(),true);
        await page.setViewportSize(viewport);
        // matchMedia's change event can settle after setViewportSize resolves.
        // Keep the original visibility requirement; do not accept a hidden tab.
        await el('desktopWorkspaceTabs').waitFor({state:'visible',timeout:10000});
        assert.equal(await el('desktopWorkspaceTabs').isVisible(),true);
        assert.equal(await page.locator('.legacy-workspace-tabs').isVisible(),false);
        assert.deepEqual(errors,[]);
        console.log('PASS G3G desktop '+name+' '+viewport.width+'x'+viewport.height);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
