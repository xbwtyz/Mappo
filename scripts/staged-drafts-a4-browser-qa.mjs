import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const dir = new URL('../artifacts/staged-drafts-a4/', import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL('mappo.html', dir);
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
await writeFile(file, observeBuildingApp(html, '', { legacy: false }));
const engines = { chromium, firefox };
for (const name of process.env.MAPPO_QA_ENGINE ? [process.env.MAPPO_QA_ENGINE] : Object.keys(engines)) {
  const browser = await engines[name].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, offline: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(file.href + '?seed=inspector-a3-qa&size=small');
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    const byId = id => page.locator('#' + id);
    const accepted = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project));
    const waterDraft = () => page.evaluate(() => JSON.stringify(__buildingQA.state().waterPanel.editor.definition()));
    const original = await accepted();
    await page.getByRole('tab', { name: 'Add', exact: true }).click();
    await page.locator('[data-add=lake]').click();
    await byId('lakeRadiusInput').fill('18');
    await byId('addLakeButton').click();
    await byId('desktopLandscapeReview').click();
    assert.equal(await byId('landscapeDraftStatus').getAttribute('data-draft-state'), 'pending');
    const lake = await waterDraft();
    assert.equal(await accepted(), original);

    await byId('landscapeReviewRebuild').click();
    await byId('desktopGenerationPreview').click();
    assert.equal(await byId('desktopGenerationApply').isEnabled(), true);
    await byId('desktopGenerationCancel').click();
    assert.equal(await waterDraft(), lake);

    // Stage identity changes in the existing editor to exercise the rebuild guard.
    await page.evaluate(() => {
      const { project, identityWorkspace, buildingWorkspace } = __buildingQA.state();
      const ref = { kind: 'building', id: project.city.buildings[0].id };
      buildingWorkspace.select(ref);
      identityWorkspace.drafts.set(identityWorkspace.key(ref), { customName: 'A4 pending identity', customUse: '' });
      identityWorkspace.mounted = null;
      identityWorkspace.render({ reload: true });
      __buildingQA.state().workspaceShell.clear();
    });
    await byId('desktopGenerationPreview').click();
    await byId('desktopGenerationApply').click();
    assert.equal(await byId('identityRebuildWarning').evaluate(node => node.hidden), false);
    await byId('identityCancelRebuildButton').click();
    assert.equal(await byId('desktopGenerationApply').isEnabled(), true);
    assert.equal(await waterDraft(), lake);
    assert.equal(await accepted(), original);

    await byId('desktopGenerationEdit').click();
    await byId('morphologyInput').selectOption('planned');
    assert.equal(await byId('desktopGenerationApply').isDisabled(), true);
    assert.equal(await waterDraft(), lake);
    assert.equal(await accepted(), original);
    assert.deepEqual(errors, []);
    console.log('PASS ' + name + ' A4 staged lake, Cancel, declined rebuild, and preview invalidation');
  } finally {
    await browser.close();
  }
}
