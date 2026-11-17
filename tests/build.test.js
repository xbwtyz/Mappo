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
  const bundled = await readFile(resolve(root, 'dist/mappo-0.1-dev.3c.html'), 'utf8');
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
      replaceChildren(...items) {
        this.options = items;
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
      createElement: () => ({
        value: '',
        textContent: ''
      }),
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
  script = script.replace(/\n\}\)\(\);\s*$/, '\nglobalThis.inspectState = () => ({ project, editor, camera, layers, districtPanel });\n})();');
  const elements = new Map(),
    windowEvents = new Map();
  const noopContext = new Proxy({}, {
    get: (t, p) => t[p] ?? (() => {})
  });
  const document = {
    activeElement: {
      tagName: 'BODY'
    },
    getElementById: el,
    createElement: () => ({
      value: '',
      textContent: ''
    })
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
      replaceChildren(...items) {
        this.options = items;
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
  const initialCity = state().project.city;
  assert.equal(el('buildingCount').textContent, initialCity.buildings.length);
  assert.equal(el('propertyCount').textContent, initialCity.properties.length);
  assert.equal(el('mergedCount').textContent, initialCity.properties.filter(p => p.plotIds.length > 1).length);
  const beforeLayers = copy(state().project);
  el('propertiesLayer').handlers.change({
    target: {
      checked: true
    }
  });
  el('plotsLayer').handlers.change({
    target: {
      checked: true
    }
  });
  el('buildingsLayer').handlers.change({
    target: {
      checked: false
    }
  });
  assert.equal(state().layers.properties, true);
  assert.equal(state().layers.plots, true);
  assert.equal(state().layers.buildings, false);
  assert.deepEqual(copy(state().project), beforeLayers);
  el('buildingsLayer').handlers.change({
    target: {
      checked: true
    }
  });
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
  const {
    buildDistrictTopology
  } = await import('../src/core/district-topology.js');
  const {
    moveDistrictBlock
  } = await import('../src/core/district-model.js');
  const topology = buildDistrictTopology(state().project.city);
  let candidate = null;
  for (const block of state().project.city.blocks) {
    for (const neighbor of topology.neighbors.get(block.id)) {
      const target = topology.blocks.get(neighbor).districtId;
      if (target === block.districtId) continue;
      try {
        moveDistrictBlock(state().project.city, block.id, target);
        candidate = {
          block,
          target
        };
        break;
      } catch {}
    }
    if (candidate) break;
  }
  assert.ok(candidate);
  worldClick(topology.centers.get(candidate.block.id));
  assert.equal(state().districtPanel.editor.selectedBlockId, candidate.block.id);
  assert.equal(el('districtSelect').value, candidate.block.districtId);
  el('districtNameInput').value = 'Test Quarter';
  el('districtColorInput').value = '#123abc';
  el('applyDistrictButton').handlers.click();
  assert.equal(state().project.city.districts.find(d => d.id === candidate.block.districtId).name, 'Test Quarter');
  el('districtTargetInput').value = candidate.target;
  assert.equal(el('moveDistrictButton').handlers.click(), true);
  assert.equal(state().project.city.blocks.find(b => b.id === candidate.block.id).districtId, candidate.target);
  el('undoDistrictButton').handlers.click();
  assert.equal(state().project.city.blocks.find(b => b.id === candidate.block.id).districtId, candidate.block.districtId);
  el('undoDistrictButton').handlers.click();
  const beforeDistrictLayers = copy(state().project);
  for (const key of ['districtColors', 'districtBorders', 'districtLabels']) el(key + 'Layer').handlers.change({
    target: {
      checked: false
    }
  });
  assert.deepEqual(copy(state().project), beforeDistrictLayers);
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
  assert.equal(el('draftBadge').textContent, '● CITY PLAN');
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

test('standalone app downloads, previews and restores complete projects and recovers them after a reload', async () => {
  const bundled = await readFile(resolve(root, 'index.html'), 'utf8');
  const originalScript = bundled.match(/<script>\s*([\s\S]*?)\s*<\/script>/)[1];
  const script = originalScript.replace(/\n\}\)\(\);\s*$/, '\nglobalThis.inspectSavedApp = () => ({ project, editor, camera, layers, files, districtPanel });\n})();');
  const memory = new Map(),
    downloaded = [];
  const storage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
  async function app() {
    const elements = new Map(),
      events = new Map(),
      blobs = new Map();
    let sequence = 0;
    const context2d = new Proxy({}, {
      get: (t, p) => t[p] ?? (() => {})
    });
    const document = {
      activeElement: {
        tagName: 'BODY'
      },
      body: {
        appendChild() {}
      },
      getElementById: el,
      addEventListener() {},
      createElement() {
        return {
          click() {
            downloaded.push({
              filename: this.download,
              blob: blobs.get(this.href)
            });
          },
          remove() {}
        };
      }
    };

    function el(id) {
      if (elements.has(id)) return elements.get(id);
      const e = {
        id,
        value: '',
        checked: false,
        hidden: false,
        disabled: false,
        textContent: '',
        handlers: {},
        tagName: 'DIV',
        classList: {
          add() {},
          remove() {},
          toggle() {}
        },
        replaceChildren(...items) {
          this.options = items;
        },
        setAttribute() {},
        setPointerCapture() {},
        focus() {
          document.activeElement = this;
        },
        addEventListener(name, cb) {
          this.handlers[name] = cb;
        },
        click() {
          return this.handlers.click?.();
        },
        getContext: () => context2d,
        getBoundingClientRect: () => ({
          width: 800,
          height: 650,
          left: 0,
          top: 0
        })
      };
      if (id === 'sizeInput') e.value = 'small';
      if (id === 'morphologyInput' || id === 'presetInput') e.value = 'organic';
      elements.set(id, e);
      return e;
    }
    class FileURL extends URL {
      static createObjectURL(blob) {
        const key = `blob:app-test-${sequence++}`;
        blobs.set(key, blob);
        return key;
      }
      static revokeObjectURL(key) {
        blobs.delete(key);
      }
    }
    const context = {
      document,
      window: {
        location: {
          href: 'file:///mappo.html'
        },
        devicePixelRatio: 1,
        addEventListener(name, cb) {
          if (!events.has(name)) events.set(name, []);
          events.get(name).push(cb);
        }
      },
      localStorage: storage,
      Blob,
      TextEncoder,
      URL: FileURL,
      Uint32Array,
      Date,
      Math,
      console,
      requestAnimationFrame: cb => cb(),
      setTimeout: () => 1,
      clearTimeout() {}
    };
    context.globalThis = context;
    vm.runInNewContext(script, context);
    const state = () => context.inspectSavedApp();
    for (let i = 0; i < 20 && !state().files.ready; i++) await Promise.resolve();
    assert.equal(state().files.ready, true);
    return {
      state,
      el,
      events
    };
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  const first = await app();
  let s = first.state();
  const selectedDistrict = s.project.city.districts[0];
  first.el('districtSelect').value = selectedDistrict.id;
  first.el('districtSelect').handlers.change();
  first.el('districtNameInput').value = 'Portable District';
  first.el('districtColorInput').value = '#654abc';
  first.el('applyDistrictButton').handlers.click();
  s = first.state();
  first.el('districtNameInput').value = 'Unapplied district name';
  s.project.city.name = 'Exact Saved City';
  s.project.city.buildings[0].name = 'Copper Fox';
  s.editor.start('points');
  s.editor.down({
    x: 10,
    y: 20
  }, 1);
  s.editor.down({
    x: 80,
    y: 100
  }, 1);
  s.camera.x = 77;
  s.camera.y = -31;
  s.camera.zoom = 2.4;
  first.el('plotsLayer').handlers.change({
    target: {
      checked: true
    }
  });
  first.el('seedInput').value = 'unfinished-next-seed';
  const expectedProject = copy(s.project),
    expectedDraft = copy(s.editor.snapshot());
  assert.ok(await first.el('saveProjectButton').handlers.click());
  const file = downloaded.at(-1),
    text = await file.blob.text(),
    payload = JSON.parse(text);
  assert.match(file.filename, /\.mappo\.json$/);
  assert.deepEqual(payload.project, expectedProject);
  assert.equal(payload.workspace.view.camera.zoom, 2.4);
  assert.equal(payload.workspace.view.layers.plots, true);
  // Staging a file never changes the city. Only Open project commits the import.
  s.project.city.name = 'Replace this temporary city';
  s.editor.boundary = [];
  await s.files.stageFile({
    size: file.blob.size,
    text: async () => text
  });
  assert.equal(first.state().project.city.name, 'Replace this temporary city');
  assert.equal(first.el('loadPreview').hidden, false);
  assert.equal(await first.el('openProjectButton').handlers.click(), true);
  assert.deepEqual(copy(first.state().project), expectedProject);
  assert.deepEqual(copy(first.state().editor.snapshot()), expectedDraft);
  assert.equal(first.state().editor.mode, 'points');
  assert.equal(first.el('seedInput').value, 'unfinished-next-seed');
  assert.equal(first.state().camera.x, 77);
  assert.equal(first.state().layers.plots, true);
  assert.equal(first.el('districtNameInput').value, 'Unapplied district name');
  assert.ok(first.state().districtPanel.editor.history.length > 0);
  await first.state().files.flush();
  const beforeReload = [...memory.values()][0];
  const reloaded = await app();
  assert.equal(reloaded.state().files.suspended, true);
  assert.equal([...memory.values()][0], beforeReload);
  reloaded.el('restoreRecoveryButton').handlers.click();
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.deepEqual(copy(reloaded.state().project), expectedProject);
  assert.deepEqual(copy(reloaded.state().editor.snapshot()), expectedDraft);
  assert.equal(reloaded.el('districtNameInput').value, 'Unapplied district name');
  reloaded.el('undoDistrictButton').handlers.click();
  assert.notEqual(reloaded.state().project.city.districts[0].name, 'Portable District');
  const loadedBefore = copy(reloaded.state().project);
  await reloaded.state().files.stageFile({
    size: 5,
    text: async () => '<html>'
  });
  assert.deepEqual(copy(reloaded.state().project), loadedBefore);
  assert.match(reloaded.el('fileStatus').textContent, /standalone HTML/);
  const legacyText = await readFile(resolve(root, 'tests/fixtures/save-3b1-format1-schema2.json'), 'utf8');
  const legacyCity = JSON.parse(legacyText).project.city;
  await reloaded.state().files.stageFile({
    size: legacyText.length,
    text: async () => legacyText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.districtState.status, 'unassigned');
  assert.equal(reloaded.state().layers.districtColors, false);
  assert.equal(reloaded.el('generateDistrictButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.districtState.status, 'assigned');
  for (const key of ['districtColors', 'districtBorders', 'districtLabels']) assert.equal(reloaded.state().layers[key], true);
  for (const key of ['nodes', 'roads', 'plaza', 'plots']) assert.deepEqual(copy(reloaded.state().project.city[key]), legacyCity[key]);
  reloaded.el('undoDistrictButton').handlers.click();
  const restored = copy(reloaded.state().project.city);
  delete restored.districtState;
  assert.deepEqual(restored, legacyCity);

});
