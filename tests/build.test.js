import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

test('compiled HTML is standalone with all styles and script embedded', async () => {
  const bundled = await readFile(resolve(root, 'dist/mappo-0.1-dev.1.html'), 'utf8');
  const index = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.equal(index, bundled);
  assert.match(bundled, /<style>[\s\S]*<\/style>/);
  assert.match(bundled, /<script>[\s\S]*<\/script>/);
  assert.doesNotMatch(bundled, /<script[^>]+src=/i);
  assert.doesNotMatch(bundled, /<link[^>]+href=/i);
  assert.doesNotMatch(bundled, /https?:\/\//i);
  const script = bundled.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  new vm.Script(script, { filename: 'mappo-bundle.js' });
});

test('compiled HTML initializes and responds to UI events with stubbed Canvas', async () => {
  const bundled = await readFile(resolve(root, 'index.html'), 'utf8');
  const script = bundled.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  const allElements = new Map();
  const fakeContext = new Proxy({}, { get: (target, prop) => target[prop] ?? (() => {}) });
  function el(id) {
    if (allElements.has(id)) return allElements.get(id);
    const element = {
      id, value: '', textContent: '', width: 0, height: 0,
      handlers: {}, classList: { add() {}, remove() {} },
      addEventListener(name, cb) { this.handlers[name] = cb; },
      setPointerCapture() {},
      getBoundingClientRect() { return { width: 760, height: 620, left: 0, top: 0 }; },
      getContext() { return fakeContext; }
    };
    if (id === 'sizeInput') element.value = 'medium';
    allElements.set(id, element);
    return element;
  }
  const context = {
    document: { getElementById: el, activeElement: { tagName: 'BODY' } },
    window: { devicePixelRatio: 1, location: { href: 'file:///mappo.html?seed=test-seed&size=large' }, addEventListener() {} },
    requestAnimationFrame(cb) { cb(); },
    URL, Uint32Array, Math, Date, console
  };
  context.globalThis = context;
  vm.runInNewContext(script, context);
  assert.equal(el('citySeed').textContent, 'test-seed');
  assert.equal(el('citySize').textContent, 'large');
  assert.equal(el('anchorCount').textContent, 16);
  assert.ok(el('mapCanvas').width > 0);
  const firstName = el('cityName').textContent;
  assert.ok(firstName.length > 3);
  el('seedInput').value = 'a-different-seed';
  el('generateButton').handlers.click();
  assert.equal(el('citySeed').textContent, 'a-different-seed');
  assert.equal(el('reportCityName').textContent, el('cityName').textContent);
  el('zoomInButton').handlers.click();
  assert.notEqual(el('zoomValue').textContent, '100%');
  el('mapCanvas').handlers.wheel({ deltaY: -200, clientX: 200, clientY: 180, preventDefault() {} });
});
