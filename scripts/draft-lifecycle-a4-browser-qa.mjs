import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const dir = new URL('../artifacts/draft-lifecycle-a4/', import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL('mappo.html', dir);
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
await writeFile(file, observeBuildingApp(html, 'globalThis.readDraft = domain => drafts.read(domain);', { legacy: false }));
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
    const draft = domain => page.evaluate(domain => readDraft(domain), domain);
    const original = await accepted();
    await page.evaluate(() => {
      const { project, buildingWorkspace } = __buildingQA.state();
      buildingWorkspace.select({ kind: 'building', id: project.city.buildings[0].id });
    });
    await page.getByRole('button', { name: 'Edit footprint', exact: true }).click();
    await byId('buildingOffsetX').fill('300');
    await byId('buildingOffsetX').dispatchEvent('change');
    const invalid = await draft('building');
    assert.equal(invalid.status, 'blocked');
    assert.ok(invalid.diagnostics[0].code);
    assert.ok(invalid.diagnostics[0].message);
    assert.equal(await byId('buildingPreviewApply').isDisabled(), true);
    await byId('desktopPlaceReview').click();
    await byId('desktopPlaceEdit').click();
    assert.equal(Number(await byId('buildingOffsetX').inputValue()), 300);
    assert.equal((await draft('building')).revision, invalid.revision);
    assert.equal(await accepted(), original);

    page.once('dialog', dialog => dialog.dismiss());
    await byId('buildingPreviewCancel').click();
    assert.equal((await draft('building')).session, invalid.session);
    page.once('dialog', dialog => dialog.accept());
    await byId('buildingPreviewReset').click();
    const reset = await draft('building');
    assert.equal(reset.status, 'clean');
    assert.notEqual(reset.session, invalid.session);
    await byId('buildingPreviewCancel').click();
    assert.equal((await draft('building')).status, 'inactive');
    assert.equal(await accepted(), original);

    await page.getByRole('tab', { name: 'Roads', exact: true }).click();
    await page.evaluate(() => {
      const road = __buildingQA.state().roadWorkspace.session;
      road.computeJunctionAsync = () => new Promise(resolve => {
        window.returnOldValidation = () => resolve({ proposal: { issues: [{ message: 'Old result' }] } });
      });
      road.update({ x: road.point.x + 1, y: road.point.y + 1 }, { defer: false });
    });
    await page.waitForFunction(() => typeof window.returnOldValidation === 'function');
    assert.equal((await draft('road')).status, 'checking');
    const prior = await draft('road');
    await byId('roadPreviewReset').click();
    await page.evaluate(() => window.returnOldValidation());
    const resetRoad = await draft('road');
    assert.equal(resetRoad.status, 'clean');
    assert.notEqual(resetRoad.session, prior.session);
    assert.equal(await byId('roadApplyB4').isDisabled(), true);
    assert.doesNotMatch(await byId('roadApplyStatusB4').textContent(), /Old result/);
    await byId('roadPreviewCancel').click();
    assert.equal((await draft('road')).status, 'inactive');
    assert.equal(await accepted(), original);
    assert.deepEqual(errors, []);
    console.log('PASS ' + name + ' A4 invalid draft, review, declined discard, Reset, and late road validation');
  } finally {
    await browser.close();
  }
}
