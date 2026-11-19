import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
const output = new URL('../artifacts/road-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 5120, height: 1440 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
];
const failures = [];
for (const [name, type] of [
  ['chromium', chromium],
  ['firefox', firefox],
]) {
  const browser = await type.launch({ headless: true });
  for (const viewport of viewports) {
    const label = `${name}-${viewport.name}`,
      page = await browser.newPage({ viewport, hasTouch: name === 'chromium' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    try {
      await page.route('**/*', (route) =>
        route.request().url() === 'http://mappo.test/index.html'
          ? route.fulfill({ contentType: 'text/html', body: html })
          : route.abort(),
      );
      await page.goto('http://mappo.test/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => __buildingQA.state().files.ready);
      // Snapshot a real property selection, accepted history, camera and recovery.
      await page.evaluate(() => {
        const s = __buildingQA.state();
        s.propertyWorkspace.select({ kind: 'property', id: s.project.city.properties[0].id });
      });
      if (viewport.width <= 670) await page.locator('#workspaceCloseInspector').click();
      await page.locator('#roadModeButton').scrollIntoViewIfNeeded();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await page.evaluate(async () => {
        const s = __buildingQA.state();
        await s.files.flush();
        __buildingQA.before = JSON.stringify(__buildingQA.capture());
        __buildingQA.revision = s.files.revision;
        __buildingQA.recovery = await s.files.store.read();
        __buildingQA.history = [
          s.buildingHistory,
          s.buildingStructureHistory,
          s.propertyHistory,
          s.propertyDeletionHistory4A,
        ].map((h) => JSON.stringify(h));
      });
      await page.locator('#roadModeButton').click();
      assert.equal(await page.locator('#roadPreviewPanel').isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'roadPreviewHeading');
      assert.equal(await page.locator('#roadPreviewPanel button').filter({ hasText: /apply/i }).count(), 0);
      assert.equal(await page.locator('#roadReportStatus').getAttribute('role'), 'status');
      assert.equal(await page.locator('#roadReconciliationB3').isVisible(), true);
      assert.equal(await page.locator('#roadReconciliationStatusB3').getAttribute('role'), 'status');
      assert.equal(await page.locator('#roadOverlayB3').isChecked(), true);
      await page.locator('#roadOverlayB3').uncheck();
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.previewVisible), false);
      await page.locator('#roadOverlayB3').check();
      const id = await page.evaluate(() => __buildingQA.state().roadWorkspace.session.selection.id);
      // Move the inspected junction to an unobstructed map location. Camera
      // adjustments are transient; the serialized view must remain the baseline.
      const place = async (point = null) => {
        await page.evaluate((point) => {
          const s = __buildingQA.state(),
            p = point ?? s.roadWorkspace.session.point;
          s.camera.zoom = 3;
          s.camera.x = p.x - 80 / s.camera.zoom;
          s.camera.y = p.y + (s.camera.height * 0.24) / s.camera.zoom;
          __buildingQA.draw();
        }, point);
        const p = await page.evaluate(() => {
          const s = __buildingQA.state();
          return s.camera.worldToScreen(s.roadWorkspace.session.point);
        });
        const box = await page.locator('#mapCanvas').boundingBox();
        return { x: box.x + p.x, y: box.y + p.y };
      };
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      let p = await place();
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 5, p.y + 3, { steps: 4 });
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.checking), true);
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.report), null);
      await page.mouse.up();
      await page.waitForFunction(() => Boolean(__buildingQA.state().roadWorkspace.session.report));
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.selection.id), id);
      const expected = await page.evaluate(() => {
        const s = __buildingQA.state(),
          session = s.roadWorkspace.session;
        // Compare displayed status, counts and every list description with A3's
        // unaltered report. Core classification is tested separately in Node.
        return {
          status: session.report.status,
          counts: session.report.counts,
          rows: session.report.affected.slice(0, 50),
        };
      });
      const statusText = await page.locator('#roadReportStatus').innerText();
      assert.ok(
        statusText.startsWith(
          { safe: 'Safe', 'needs-review': 'Needs review', invalid: 'Invalid' }[expected.status],
        ),
      );
      assert.ok(statusText.includes(`${expected.counts.affectedObjects} affected`));
      // A5 groups repeated issues into collapsed details. Check every preserved
      // ID and message, including rows not initially expanded in the UI.
      while (await page.locator('#roadShowMore').isVisible())
        await page.locator('#roadShowMore').click();
      const descriptions = await page.locator('#roadReportList').textContent();
      for (const row of expected.rows) {
        assert.ok(descriptions.includes(row.id));
        assert.ok(descriptions.includes(row.message));
      }
      await page.locator('#roadPreviewReset').click();
      assert.ok((await page.locator('#roadReportStatus').innerText()).startsWith('Accepted position'));
      // Numeric invalid -> corrected clears stale issues and uses A3 again.
      const original = await page.evaluate(() => ({ ...__buildingQA.state().roadWorkspace.session.point }));
      await page.locator('#roadProposedX').fill('200000');
      await page.waitForFunction(
        () => __buildingQA.state().roadWorkspace.session.report?.status === 'invalid',
      );
      assert.ok((await page.locator('#roadReportStatus').innerText()).startsWith('Invalid'));
      await page.locator('#roadProposedX').fill(String(original.x + 0.01));
      await page.waitForFunction(() =>
        ['safe', 'needs-review'].includes(__buildingQA.state().roadWorkspace.session.report?.status),
      );
      assert.equal(
        await page.locator('#roadPreviewPanel').getAttribute('data-report-status'),
        await page.evaluate(() => __buildingQA.state().roadWorkspace.session.report.status),
      );
      // All preview data, pan/zoom, file downloads and recovery captures exclude
      // road mode. Flush a pre-existing recovery write while preview is active.
      assert.equal(
        await page.evaluate(() => JSON.stringify(__buildingQA.capture()) === __buildingQA.before),
        true,
      );
      const after = await page.evaluate(async () => {
        const s = __buildingQA.state();
        await s.files.flush();
        const recovery = await s.files.store.read();
        return {
          same: s.files.revision === __buildingQA.revision,
          current: JSON.parse(recovery.current),
          before: JSON.parse(__buildingQA.recovery.current),
          history: [
            s.buildingHistory,
            s.buildingStructureHistory,
            s.propertyHistory,
            s.propertyDeletionHistory4A,
          ].map((h) => JSON.stringify(h)),
          expectedHistory: __buildingQA.history,
        };
      });
      assert.equal(after.same, true);
      delete after.current.savedAt;
      delete after.before.savedAt;
      assert.deepEqual(after.current, after.before);
      assert.deepEqual(after.history, after.expectedHistory);
      const downloading = page.waitForEvent('download');
      await page.locator('#projectMenuButton').click();
      await page.locator('#saveProjectButton').click();
      const download = await downloading;
      const portable = JSON.parse(await readFile(await download.path(), 'utf8'));
      const baseline = await page.evaluate(() => JSON.parse(__buildingQA.before));
      assert.deepEqual(portable.project, baseline.project);
      assert.deepEqual(portable.workspace, baseline.workspace);
      await page.locator('#roadProposedX').focus(); // closes the nonmodal Project menu
      // Keyboard nudging is scoped to the canvas, with native input arrows intact.
      await page.locator('#roadPreviewReset').click();
      await page.locator('#mapCanvas').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(
        await page.evaluate(() => __buildingQA.state().roadWorkspace.session.point.x),
        original.x + 0.5,
      );
      await page.keyboard.press('Control+z');
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.pending), false);
      await page.locator('#roadProposedX').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.pending), false);
      // Touch selection/drag through the real pointer controller; Firefox's
      // synthetic touch PointerEvent supplies the same event API as hardware.
      p = await place();
      if (name === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        for (const [type, x, y] of [
          ['touchStart', p.x, p.y],
          ['touchMove', p.x + 4, p.y + 2],
          ['touchEnd', p.x + 4, p.y + 2],
        ])
          await cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }],
          });
        await cdp.detach();
      } else {
        // Firefox Playwright cannot inject native touch drags. Dispatch the
        // hardware-equivalent PointerEvents and bypass capture only for this
        // synthetic pointer, which the browser never registers as active.
        await page.locator('#mapCanvas').evaluate((canvas) => {
          canvas.qaCapture = canvas.setPointerCapture;
          canvas.setPointerCapture = function (id) {
            if (id !== 7) this.qaCapture(id);
          };
        });
        for (const [event, x, y] of [
          ['pointerdown', p.x, p.y],
          ['pointermove', p.x + 4, p.y + 2],
          ['pointerup', p.x + 4, p.y + 2],
        ])
          await page.locator('#mapCanvas').dispatchEvent(event, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            clientX: x,
            clientY: y,
            bubbles: true,
          });
        await page.locator('#mapCanvas').evaluate((canvas) => {
          canvas.setPointerCapture = canvas.qaCapture;
          delete canvas.qaCapture;
        });
      }
      await page.waitForFunction(() => Boolean(__buildingQA.state().roadWorkspace.session.report));
      // Protected records remain reachable by keyboard list and map tapping.
      const protectedId = await page.evaluate(() => {
        const session = __buildingQA.state().roadWorkspace.session;
        return [...session.graph.nodesById.keys()].find((id) =>
          session.graph.incidentRoads.get(id).some((r) => session.graph.roadClasses.get(r).protected),
        );
      });
      await page.locator('#roadSelectionId').selectOption(protectedId);
      assert.equal(await page.locator('#roadProposedX').isDisabled(), true);
      assert.ok((await page.locator('#roadRecordDetails').innerText()).includes('Protected:'));
      await page.locator('#roadSelectionKind').selectOption('road');
      assert.ok((await page.locator('#roadAcceptedPoint').innerText()).includes('Endpoints'));
      assert.ok((await page.locator('#roadEndpointList button').count()) === 2);
      await page.locator('#roadEndpointList button').first().click();
      assert.equal(await page.locator('#roadSelectionKind').inputValue(), 'junction');
      await page.locator('#roadSelectionId').selectOption(id);
      await page.locator('#roadProposedX').fill(String(original.x + 0.01));
      await page.waitForFunction(() => Boolean(__buildingQA.state().roadWorkspace.session.report));
      // Keep a review screenshot for visual inspection at all viewport sizes.
      await page.screenshot({ path: new URL(`${label}.png`, output).pathname });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, 'No horizontal page overflow');
      const panel = await page.locator('#roadPreviewPanel').boundingBox();
      assert.ok(panel.width >= 270 && panel.x >= 0 && panel.x + panel.width <= viewport.width);
      await page.locator('#roadPreviewMinimize').click();
      assert.equal(await page.locator('#roadPreviewBody').isVisible(), false);
      await page.locator('#roadPreviewMinimize').click();
      // Escape from a numeric input cancels deferred analysis and restores the
      // exact initial view/selection without advancing the file revision.
      await page.locator('#roadProposedX').fill(String(original.x + 0.02));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(240);
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.active), false);
      assert.equal(
        await page.evaluate(() => JSON.stringify(__buildingQA.capture()) === __buildingQA.before),
        true,
      );
      assert.equal(
        await page.evaluate(() => __buildingQA.state().files.revision === __buildingQA.revision),
        true,
      );
      // Route changes and replacement cancel pending work, then ordinary roof
      // selection again resolves to the property-first workflow.
      await page.locator('#roadModeButton').click();
      await page.locator('#roadNudgeRight').click();
      await page.locator('#workspaceTab-landscape').click();
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.active), false);
      await page.locator('#workspaceTab-city').click();
      await page.locator('#roadModeButton').click();
      await page.locator('#roadNudgeRight').click();
      await page.evaluate(() => {
        const saved = JSON.parse(__buildingQA.before);
        __buildingQA.apply({ project: saved.project, workspace: saved.workspace });
      });
      await page.waitForTimeout(240);
      assert.equal(await page.evaluate(() => __buildingQA.state().roadWorkspace.session.report), null);
      assert.equal(await page.locator('#roadPreviewPanel').isVisible(), false);
      // A valid undeveloped city exposes the Safe state through the same UI.
      await page.evaluate(() => {
        const saved = JSON.parse(__buildingQA.before),
          city = saved.project.city;
        city.properties = [];
        city.plots = [];
        city.buildings = [];
        city.openSpaces = city.blocks.map((b) => ({
          id: `OPEN-${b.id}`,
          blockId: b.id,
          kind: 'undeveloped',
          area: b.area,
        }));
        saved.workspace.ui.selection = null;
        __buildingQA.apply(saved);
      });
      await page.locator('#roadModeButton').click();
      const safePoint = await page.evaluate(() => __buildingQA.state().roadWorkspace.session.point);
      await page.locator('#roadProposedX').fill(String(safePoint.x + 0.01));
      await page.waitForFunction(() => __buildingQA.state().roadWorkspace.session.report?.status === 'safe');
      assert.ok((await page.locator('#roadReportStatus').innerText()).startsWith('Safe'));
      await page.locator('#roadPreviewCancel').click();
      assert.equal(errors.length, 0, errors.join('; '));
      console.log(
        `PASS road ${label}: inspection, mouse/touch/keyboard preview, A3 report, reset/cancel, save/recovery isolation`,
      );
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      console.error(`FAIL road ${label}: ${error.stack}`);
      await page.screenshot({ path: new URL(`${label}-failure.png`, output).pathname });
    } finally {
      await page.close();
    }
  }
  await browser.close();
}
if (failures.length) throw new Error(`Road browser QA failures:\n${failures.join('\n')}`);
console.log('Road browser QA: 8/8 browser-viewport checks passed.');
