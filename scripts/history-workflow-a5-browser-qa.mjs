import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const dir = new URL('../artifacts/history-workflow-a5/', import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL('mappo.html', dir);
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
await writeFile(file, observeBuildingApp(html, `globalThis.historyQA = {
  chooseBuilding: () => project.city.buildings.find(b => inspectBuildingPreview(project, b.id, { dx: .3 }).status === 'valid'),
};`, { legacy: false }));
const engines = { chromium, firefox };
for (const name of process.env.MAPPO_QA_ENGINE ? [process.env.MAPPO_QA_ENGINE] : Object.keys(engines)) {
  const browser = await engines[name].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, offline: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(file.href + '?seed=inspector-a3-qa&size=small');
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    const el = id => page.locator('#' + id);
    const city = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project.city));
    const entries = () => page.evaluate(() => __buildingQA.state().acceptedHistoryD01.summaries());
    const key = async chord => { await el('mapCanvas').focus(); await page.keyboard.press(chord); };
    const baseline = await city();

    assert.ok(await page.evaluate(() => {
      const b = historyQA.chooseBuilding();
      return b && __buildingQA.state().buildingWorkspace.select({ kind: 'building', id: b.id });
    }));
    await page.getByRole('button', { name: 'Edit footprint', exact: true }).click();
    await el('buildingOffsetX').fill('0.3');
    await el('buildingOffsetX').dispatchEvent('change');
    await el('buildingPreviewApply').click();
    assert.match(await el('workspaceUndoButton').textContent(), /Move building/);
    const afterBuilding = await city();
    await el('buildingPreviewCancel').click();
    await page.evaluate(() => __buildingQA.state().workspaceShell.clear());
    await page.getByRole('tab', { name: 'Generation', exact: true }).click();
    await page.locator('[data-generation=districts]').click();
    if (await el('districtList').getByRole('button').count() === 0) {
      await el('desktopGenerationPreview').click();
      await el('desktopGenerationApply').click();
    }
    await el('districtList').getByRole('button').first().click();
    await el('districtNameInput').fill('A5 district review');
    await el('applyDistrictButton').click();
    assert.match(await el('workspaceUndoButton').textContent(), /district/);
    const afterDistrict = await city();
    await el('desktopDistrictBack').click();

    assert.equal(await page.locator('[data-generation=defenses]').count(), 1);
    await page.locator('[data-generation=defenses]').click();
    const walls = el('wallsEnabledInput');
    await walls.setChecked(!(await walls.isChecked()));
    await el('desktopGenerationPreview').click();
    await el('desktopGenerationApply').click();
    assert.match(await el('workspaceUndoButton').textContent(), /defenses/);
    const afterDefense = await city();

    await page.evaluate(() => {
      const { project, propertyWorkspace } = __buildingQA.state();
      propertyWorkspace.select({ kind: 'property', id: project.city.properties[0].id });
    });
    await page.getByRole('button', { name: 'Name & use', exact: true }).click();
    await el('identityNameInput').fill('A5 property review');
    await el('identityApplyButton').click();
    const afterProperty = await city();
    assert.deepEqual((await entries()).slice(-3).map(row => row.family), ['districts', 'defenses', 'identity']);

    for (const expected of [afterDefense, afterDistrict]) {
      await key('Control+z');
      assert.equal(await city(), expected);
    }
    const districtActions = (await entries()).filter(row => row.direction === 'undo').length - 1;
    for (let i = 0; i < districtActions; i++) await key('Control+z');
    assert.equal(await city(), afterBuilding);
    await key('Control+z');
    assert.equal(await city(), baseline);
    for (let i = 0; i < (await entries()).length; i++) await key('Control+y');
    assert.equal(await city(), afterProperty);

    await page.getByRole('tab', { name: 'Roads', exact: true }).click();
    await page.evaluate(() => {
      const road = __buildingQA.state().roadWorkspace.session;
      road.update({ x: road.point.x + 1, y: road.point.y + 1 });
    });
    assert.equal(await el('workspaceUndoButton').getAttribute('aria-disabled'), 'true');
    await el('workspaceUndoButton').hover();
    assert.equal(await el('workspaceUndoTooltipA5').isVisible(), true);
    assert.match(await el('workspaceUndoTooltipA5').textContent(), /road preview/);
    await page.mouse.move(0, 0);
    await el('workspaceUndoButton').focus();
    assert.equal(await el('workspaceUndoTooltipA5').isVisible(), true);
    await key('Control+z');
    assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.pending), true);
    assert.equal(await city(), afterProperty);
    await key('Control+Shift+z');
    assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.pending), false);
    await el('roadPreviewCancel').click();
    assert.equal(await city(), afterProperty);
    await page.evaluate(() => __buildingQA.apply(__buildingQA.capture()));
    assert.equal((await entries()).length, 0);
    await el('workspaceHistoryPanelD01').locator('summary').click();
    await el('restoreDefenseHistoryA5').click();
    assert.match(await el('workspaceUndoButton').textContent(), /Restore saved defense edit/);
    assert.notEqual(await city(), afterProperty);
    await key('Control+z');
    assert.equal(await city(), afterProperty);
    assert.deepEqual(errors, []);
    console.log('PASS ' + name + ' A5 interleaved history, toolbar labels, hover/focus, and preview shortcut');
  } finally {
    await browser.close();
  }
}
