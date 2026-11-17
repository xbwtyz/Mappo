import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile
} from 'node:fs/promises';
import {
  resolve
} from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

test('compiled HTML is standalone with all styles and script embedded', async () => {
  const bundled = await readFile(resolve(root, 'dist/mappo-0.1-dev.3a2.html'), 'utf8');
  const index = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.equal(index, bundled);
  assert.match(bundled, /<style>[\s\S]*<\/style>/);
  assert.match(bundled, /<script>[\s\S]*<\/script>/);
  assert.doesNotMatch(bundled, /<script[^>]+src=/i);
  assert.doesNotMatch(bundled, /<link[^>]+href=/i);
  assert.doesNotMatch(bundled, /https?:\/\//i);
  assert.doesNotMatch(bundled, /watabou|MFCG|competitor/i);
  const script = bundled.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  new vm.Script(script, {
    filename: 'mappo-bundle.js'
  });
});

test('compiled HTML initializes and responds to UI events with stubbed Canvas', async () => {
  const bundled = await readFile(resolve(root, 'index.html'), 'utf8');
  const script = bundled.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  const allElements = new Map();
  const fakeContext = new Proxy({}, {
    get: (target, prop) => target[prop] ?? (() => {})
  });

  function el(id) {
    if (allElements.has(id)) return allElements.get(id);
    const element = {
      id,
      value: '',
      textContent: '',
      width: 0,
      height: 0,
      handlers: {},
      classList: {
        add() {},
        remove() {},
        toggle() {}
      },
      setAttribute() {},
      focus() {},
      addEventListener(name, cb) {
        this.handlers[name] = cb;
      },
      setPointerCapture() {},
      getBoundingClientRect() {
        return {
          width: 760,
          height: 620,
          left: 0,
          top: 0
        };
      },
      getContext() {
        return fakeContext;
      }
    };
    if (id === 'sizeInput') element.value = 'medium';
    if (id === 'presetInput') element.value = 'organic';
    if (id === 'morphologyInput') element.value = 'radial';
    allElements.set(id, element);
    return element;
  }
  const context = {
    document: {
      getElementById: el,
      activeElement: {
        tagName: 'BODY'
      }
    },
    window: {
      devicePixelRatio: 1,
      location: {
        href: 'file:///mappo.html?seed=test-seed&size=large&shape=organic'
      },
      addEventListener() {}
    },
    requestAnimationFrame(cb) {
      cb();
    },
    URL,
    Uint32Array,
    Math,
    Date,
    console
  };
  context.globalThis = context;
  vm.runInNewContext(script, context);
  assert.equal(el('citySeed').textContent, 'test-seed');
  assert.equal(el('citySize').textContent, 'large');
  assert.equal(el('cityMorphology').textContent, 'organic');
  assert.ok(el('junctionCount').textContent > 50);
  assert.ok(el('blockCount').textContent > 30);
  assert.ok(el('roadCount').textContent > 70);
  assert.ok(el('laneCount').textContent > 0);
  assert.ok(el('mapCanvas').width > 0);
  const firstName = el('cityName').textContent;
  assert.ok(firstName.length > 3);
  el('seedInput').value = 'a-different-seed';
  el('generateButton').handlers.click();
  assert.equal(el('citySeed').textContent, 'a-different-seed');
  assert.equal(el('reportCityName').textContent, el('cityName').textContent);
  el('morphologyInput').value = 'linear';
  el('morphologyInput').handlers.change();
  assert.equal(el('cityMorphology').textContent, 'organic');
  el('generateButton').handlers.click();
  assert.equal(el('cityMorphology').textContent, 'linear');
  el('zoomInButton').handlers.click();
  assert.notEqual(el('zoomValue').textContent, '100%');
  el('mapCanvas').handlers.wheel({
    deltaY: -200,
    clientX: 200,
    clientY: 180,
    preventDefault() {}
  });
});

test('compiled drawing workflow handles pointer gestures, center placement, undo and failed generation atomically', async () => {
  const bundled = await readFile(resolve(root, 'index.html'), 'utf8');
  let script = bundled.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  // Test-only observation of private application state, without adding product globals.
  script = script.replace(/\n\}\)\(\);\s*$/, '\nglobalThis.inspectState = () => ({ project, editor, camera });\n})();');
  const elements = new Map(),
    windowEvents = new Map();
  const noopContext = new Proxy({}, {
    get: (t, p) => t[p] ?? (() => {})
  });
  const document = {
    activeElement: {
      tagName: 'BODY'
    },
    getElementById: el
  };

  function el(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set();
    const element = {
      id,
      tagName: id === 'mapCanvas' ? 'CANVAS' : 'DIV',
      value: '',
      textContent: '',
      handlers: {},
      disabled: false,
      addEventListener(name, cb) {
        this.handlers[name] = cb;
      },
      setAttribute(name, value) {
        this[name] = value;
      },
      focus() {
        document.activeElement = this;
      },
      setPointerCapture() {},
      classList: {
        add: s => classes.add(s),
        remove: s => classes.delete(s),
        toggle: (s, on) => on ? classes.add(s) : classes.delete(s)
      },
      getBoundingClientRect() {
        return {
          left: 0,
          top: 0,
          width: 760,
          height: 620
        };
      },
      getContext() {
        return noopContext;
      }
    };
    if (id === 'sizeInput') element.value = 'medium';
    if (id === 'morphologyInput') element.value = 'organic';
    if (id === 'presetInput') element.value = 'organic';
    elements.set(id, element);
    return element;
  }
  const context = {
    document,
    window: {
      location: {
        href: 'file:///mappo.html'
      },
      devicePixelRatio: 1,
      addEventListener(name, cb) {
        if (!windowEvents.has(name)) windowEvents.set(name, []);
        windowEvents.get(name).push(cb);
      }
    },
    requestAnimationFrame: cb => cb(),
    URL,
    Uint32Array,
    Math,
    Date,
    console
  };
  context.globalThis = context;
  vm.runInNewContext(script, context);
  const state = () => context.inspectState(),
    copy = x => JSON.parse(JSON.stringify(x));
  const fire = (name, x, y) => el('mapCanvas').handlers[name]({
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: y,
    preventDefault() {}
  });
  const click = (x, y) => {
    fire('pointerdown', x, y);
    fire('pointerup', x, y);
  };
  const worldClick = p => {
    const s = state().camera.worldToScreen(p);
    click(s.x, s.y);
  };
  el('pointsButton').handlers.click();
  for (const p of [
      [120, 130],
      [620, 130],
      [620, 480],
      [120, 480]
    ]) click(...p);
  assert.equal(state().editor.closed, false);
  el('finishButton').handlers.click();
  assert.equal(state().editor.closed, true);
  el('centerButton').handlers.click();
  click(300, 300);
  const chosen = copy(state().editor.center);
  el('generateButton').handlers.click();
  const boundary = copy(state().project.options.boundary);
  assert.equal(el('draftBadge').textContent, '● STREET PLAN');
  assert.deepEqual(copy(state().project.options.center), chosen);
  el('newSeedButton').handlers.click();
  assert.deepEqual(copy(state().project.options.boundary), boundary);
  assert.deepEqual(copy(state().project.options.center), chosen);
  el('editButton').handlers.click();
  const corner = state().camera.worldToScreen(state().editor.boundary[0]);
  fire('pointerdown', corner.x, corner.y);
  fire('pointermove', corner.x - 30, corner.y + 15);
  fire('pointerup', corner.x - 30, corner.y + 15);
  assert.notDeepEqual(copy(state().editor.boundary), boundary);
  el('undoButton').handlers.click();
  assert.deepEqual(copy(state().editor.boundary), boundary);
  const lastGood = copy(state().project);
  el('pointsButton').handlers.click();
  for (const p of [
      [120, 130],
      [620, 480],
      [120, 480],
      [620, 130]
    ]) click(...p);
  el('finishButton').handlers.click();
  el('generateButton').handlers.click();
  assert.deepEqual(copy(state().project), lastGood);
  assert.match(el('draftMessage').textContent, /crosses/);
  el('cancelButton').handlers.click();
  assert.deepEqual(copy(state().editor.boundary), boundary);
  el('freehandButton').handlers.click();
  fire('pointerdown', 130, 140);
  for (const p of [
      [250, 140],
      [400, 142],
      [610, 140],
      [610, 470],
      [130, 470]
    ]) fire('pointermove', ...p);
  fire('pointerup', 130, 470);
  assert.equal(state().editor.closed, true);
  assert.equal(state().editor.mode, 'edit');
  assert.equal(state().editor.error, false);
  el('generateButton').handlers.click();
  assert.equal(state().editor.dirty, false);
  // Space-drag pans in editing mode without moving a boundary point.
  el('editButton').handlers.click();
  const before = copy(state().editor.boundary),
    position = state().camera.x;
  for (const cb of windowEvents.get('keydown')) cb({
    code: 'Space',
    key: ' ',
    preventDefault() {}
  });
  fire('pointerdown', 300, 300);
  fire('pointermove', 340, 330);
  fire('pointerup', 340, 330);
  for (const cb of windowEvents.get('keyup')) cb({
    code: 'Space'
  });
  assert.notEqual(state().camera.x, position);
  assert.deepEqual(copy(state().editor.boundary), before);
});
