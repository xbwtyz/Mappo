import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright';

const address = new URL('../prototypes/0.2g/index.html', import.meta.url).href;
const artifacts = new URL('../artifacts/workspace-g1/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const layouts = [
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ultrawide', width: 5120, height: 1440 }
];

for (const [engine, launcher] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await launcher.launch();
  try {
    for (const { name, width, height } of layouts) {
      const page = await browser.newPage({ viewport: { width, height }, offline: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const button = label => page.getByRole('button', { name: label, exact: true });
      const view = () => page.locator('#workspace').getAttribute('data-view');
      const screenshot = design => page.screenshot({
        path: fileURLToPath(new URL(`${engine}-${name}-${design}.png`, artifacts))
      });
      try {
        await page.goto(address);
        const naturalLayout = await page.locator('#map').boundingBox();
        assert.ok(naturalLayout.width > width * .55);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await button('Move road').click();
        assert.equal(await button('Apply').isDisabled(), true);
        await button('Keep footprint').click();
        assert.match(await page.locator('#status').innerText(), /blocks Apply/);
        await screenshot('single-map');
        await button('Impact dock').click();
        assert.equal(await view(), 'dock');
        const map = await page.locator('#map').boundingBox();
        const dock = await page.locator('#dock-list').boundingBox();
        const details = await page.locator('#panel').boundingBox();
        assert.ok(map.width >= width - 1);
        assert.ok(dock.y >= map.y + map.height && details.x >= dock.x + dock.width - 1);
        assert.equal(await page.locator('#panel').getByRole('button', { name: 'Apply', exact: true }).isVisible(), true);
        await page.locator('[data-impact="PROP-00053"]').click();
        assert.equal(await page.locator('[data-impact="PROP-00053"]').getAttribute('aria-pressed'), 'true');
        await screenshot('impact-dock');
        if (name === 'ultrawide') {
          await button('Before + proposed').click();
          assert.equal(await view(), 'compare');
          const accepted = await page.locator('#map').boundingBox();
          const proposed = await page.locator('#proposed-map').boundingBox();
          assert.ok(proposed.x >= accepted.x + accepted.width - 1);
          const originalCamera = await page.evaluate(() => ({ ...state.camera }));
          await page.locator('#proposed-map').press('ArrowRight');
          assert.equal(await page.evaluate(() => state.camera.x), originalCamera.x + 12);
          await button('Use this placement').click();
          await screenshot('comparison');
          await button('Back to impact list').click();
          assert.equal(await page.locator('[data-impact="PROP-00053"]').getAttribute('aria-pressed'), 'true');
          assert.equal(await button('Apply').isEnabled(), true);
          await button('Before + proposed').click();
          await page.setViewportSize({ width: 1366, height: 768 });
          await page.waitForFunction(() => document.querySelector('#workspace').dataset.view === 'dock');
          assert.equal(await button('Apply').isEnabled(), true);
        } else {
          assert.equal(await button('Before + proposed').isDisabled(), true);
          assert.match(await page.locator('#view-note').innerText(), /wider windows/);
          await button('Review Market Hall').click();
          await button('Preview relocation').click();
          assert.equal(await button('Apply').isDisabled(), true);
          assert.match(await page.locator('#status').innerText(), /shown on this map/);
          await button('Use this placement').click();
        }
        await button('Map + editor').click();
        assert.equal(await page.locator('#value').inputValue(), '18');
        assert.equal(await button('Apply').isEnabled(), true);
        await button('Apply').click();
        assert.match(await page.locator('#status').innerText(), /Applied/);
        await button('Undo road edit').click();
        await button('Move road').click();
        assert.equal(await button('Apply').isDisabled(), true);
        await button('Cancel').click();
        await button('Properties').click();
        await button('Split property').click();
        await page.locator('#value').fill('10');
        await page.locator('#value').press('Tab');
        assert.equal(await button('Apply').isDisabled(), true);
        await button('Reset').click();
        assert.equal(await button('Apply').isEnabled(), true);
        await button('Apply').click();
        await button('Undo property edit').click();
        await button('Buildings').click();
        await button('Add courtyard').click();
        await page.locator('#value').fill('4');
        await page.locator('#value').press('Tab');
        assert.equal(await button('Apply').isEnabled(), true);
        await button('Apply').click();
        await button('Undo building edit').click();
        assert.deepEqual(errors, []);
        console.log('PASS G1 ' + engine + ' ' + name);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
