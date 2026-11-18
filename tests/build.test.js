import {
  waterPathIsOrdered
} from '../src/core/water-editing.js';
import {
  riverPathIsOrdered
} from '../src/core/river-editing.js';
import {
  waterFrame
} from '../src/core/water-geometry.js';
import {
  waterAt
} from '../src/core/water-geometry.js';
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
  const bundled = await readFile(resolve(root, 'dist/mappo-0.1-dev.ui5c.html'), 'utf8');
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
    if (id === 'wallsEnabledInput') element.checked = true;
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
        textContent: '',
        classList: {
          toggle() {}
        },
        setAttribute() {},
        addEventListener(name, fn) {
          (this.handlers ??= {})[name] = fn;
        },
        replaceChildren(...children) {
          this.children = children;
        }
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
  el('seedInput').handlers.input();
  assert.match(el('workspacePendingDetails').textContent, /Street generation settings/);
  assert.match(el('workspaceRebuildImpact').textContent, /Custom neighborhood names/);
  el('generateButton').handlers.click();
  assert.equal(el('workspacePendingCount').textContent, 'Up to date');
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
  script = script.replace(/\n\}\)\(\);\s*$/, '\nglobalThis.inspectState = () => ({ project, editor, camera, layers, districtPanel, fortificationPanel });\n})();');
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
      textContent: '',
      classList: {
        toggle() {}
      },
      setAttribute() {},
      addEventListener(name, fn) {
        (this.handlers ??= {})[name] = fn;
      },
      replaceChildren(...children) {
        this.children = children;
      },
      scrollIntoView() {
        this.revealed = true;
      }
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
    if (id === 'wallsEnabledInput') element.checked = true;
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
  assert.equal(el('workspaceSection-districts').hidden, false, 'Map selection opens Districts');
  assert.equal(el('districtInspectorControls').hidden, false, 'District form is visible in inspector');
  assert.equal(el('workspaceShowControls').hidden, true, 'A shortcut is unnecessary for inline forms');
  const selectedDistrictIndex = state().project.city.districts.findIndex(d => d.id === candidate.block.districtId);
  assert.equal(el('districtList').options[selectedDistrictIndex].children[0].revealed, true, 'Map block selection scrolls to its matching district row');
  el('districtNameInput').value = 'Test Quarter';
  el('districtColorInput').value = '#123abc';
  el('applyDistrictButton').handlers.click();
  assert.equal(state().project.city.districts.find(d => d.id === candidate.block.districtId).name, 'Test Quarter');
  el('districtNameInput').value = 'Pending name while selecting a block';
  worldClick(topology.centers.get(candidate.block.id));
  assert.equal(el('districtNameInput').value, 'Pending name while selecting a block', 'Reselecting a block preserves unfinished district name');
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
  const script = originalScript.replace(/\n\}\)\(\);\s*$/, '\nglobalThis.inspectSavedApp = () => ({ project, editor, camera, layers, files, districtPanel, fortificationPanel, waterPanel, terrainPanel, workspaceShell, workspaceMenus, landscapeWorkspace });\n})();');
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
          classList: {
            toggle() {}
          },
          setAttribute() {},
          addEventListener(name, fn) {
            (this.handlers ??= {})[name] = fn;
          },
          replaceChildren(...children) {
            this.children = children;
          },
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
      if (id === 'wallsEnabledInput') e.checked = true;
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
  assert.equal(first.el('projectMenu').hidden, false, 'Validated preview is revealed in the shared Project menu');
  assert.equal(first.el('projectMenuAttention').hidden, false);
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
  assert.equal(reloaded.el('projectMenuAttention').hidden, false, 'Recovery choice is visible on the shared Project button');
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
  assert.equal(reloaded.state().workspaceMenus.active, 'project');
  assert.equal(reloaded.el('projectMenu').hidden, false);
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
  for (const key of ['waterState', 'waterFeatures', 'waterFaces', 'bridges']) delete restored[key];
  delete restored.fortificationState;
  delete restored.gates;
  delete restored.towers;
  assert.deepEqual(restored, legacyCity);
  const beforeWalls = copy(reloaded.state().project.city);
  assert.match(reloaded.el('defensePendingMessage').textContent, /No defenses are built/i);
  reloaded.el('wallsEnabledInput').checked = true;
  reloaded.el('wallsEnabledInput').handlers.change();
  assert.match(reloaded.el('defensePendingMessage').textContent, /build walls/i);
  reloaded.el('gateCountInput').value = '3';
  reloaded.el('towerSpacingInput').value = '80';
  reloaded.el('fortificationSeedInput').value = 'portable-forts';
  reloaded.el('fortificationSeedInput').handlers.input();
  assert.match(reloaded.el('defensePendingMessage').textContent, /without rebuilding streets/i);
  assert.equal(reloaded.el('applyFortificationButton').handlers.click(), true);
  assert.match(reloaded.el('defensePendingMessage').textContent, /No defense changes pending/i);
  assert.equal(reloaded.state().project.city.fortificationState.status, 'built');
  assert.equal(reloaded.state().layers.fortifications, true);
  for (const key of ['nodes', 'roads', 'blocks', 'properties', 'buildings', 'districts']) assert.deepEqual(copy(reloaded.state().project.city[key]), beforeWalls[key]);
  const fortData = copy({
    walls: reloaded.state().project.city.walls,
    gates: reloaded.state().project.city.gates,
    towers: reloaded.state().project.city.towers
  });
  reloaded.el('fortificationsLayer').handlers.change({
    target: {
      checked: false
    }
  });
  assert.deepEqual(copy(reloaded.state().project.city.walls), fortData.walls);
  assert.ok(await reloaded.el('saveProjectButton').handlers.click());
  const fortifiedFile = downloaded.at(-1),
    fortifiedText = await fortifiedFile.blob.text();
  assert.ok(JSON.parse(fortifiedText).workspace.fortificationEditor.history.length > 0);
  reloaded.el('wallsEnabledInput').checked = false;
  reloaded.el('wallsEnabledInput').handlers.change();
  assert.match(reloaded.el('defensePendingMessage').textContent, /disable the visible walls/i);
  reloaded.el('towerSpacingInput').value = '';
  reloaded.el('towerSpacingInput').handlers.input();
  assert.equal(reloaded.el('applyFortificationButton').handlers.click(), true);
  assert.match(reloaded.el('defensePendingMessage').textContent, /saved defenses are retained/i);
  assert.equal(reloaded.state().project.city.fortificationState.enabled, false);
  assert.deepEqual(copy(reloaded.state().project.city.gates), fortData.gates);
  await reloaded.state().files.stageFile({
    size: fortifiedFile.blob.size,
    text: async () => fortifiedText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.fortificationState.enabled, true);
  assert.equal(reloaded.el('undoFortificationButton').handlers.click(), true);
  assert.deepEqual(copy(reloaded.state().project.city), beforeWalls);
  // Phase 4C: exercise the district and defense controllers together,
  // including validation failures, complete portable saves and scoped undo.
  const crossBaseline = copy(reloaded.state().project.city);
  assert.equal(crossBaseline.districtState.status, 'unassigned');
  assert.equal(reloaded.el('generateDistrictButton').handlers.click(), true);
  const crossDistrictId = reloaded.state().project.city.districts[0].id;
  const crossDistrictOriginalName = reloaded.state().project.city.districts[0].name;
  const crossRows = reloaded.el('districtList').options;
  assert.equal(crossRows.length, reloaded.state().project.city.districts.length);
  crossRows[0].children[0].handlers.click();
  assert.equal(reloaded.state().workspaceShell.state.selection.id, crossDistrictId);
  assert.equal(reloaded.el('districtInspectorControls').hidden, false);
  const beforeInvalidDistrict = copy(reloaded.state().project.city);
  const districtHistoryBeforeInvalid = reloaded.state().districtPanel.editor.history.length;
  reloaded.el('districtNameInput').value = '';
  assert.equal(reloaded.el('applyDistrictButton').handlers.click(), false);
  assert.match(reloaded.el('districtMessage').textContent, /District names must contain/);
  assert.deepEqual(copy(reloaded.state().project.city), beforeInvalidDistrict);
  assert.equal(reloaded.state().districtPanel.editor.history.length, districtHistoryBeforeInvalid);
  reloaded.el('districtNameInput').value = 'Cross-workflow District';
  reloaded.el('districtColorInput').value = '#335577';
  assert.equal(reloaded.el('applyDistrictButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.districts[0].name, 'Cross-workflow District');
  const afterDistrictOnly = copy(reloaded.state().project.city);
  reloaded.el('wallsEnabledInput').checked = true;
  reloaded.el('gateCountInput').value = '3';
  reloaded.el('towerSpacingInput').value = '90';
  reloaded.el('fortificationSeedInput').value = 'phase4c-fort';
  reloaded.el('fortificationSeedInput').handlers.input();
  assert.match(reloaded.el('defensePendingMessage').textContent, /build walls/);
  assert.equal(reloaded.el('applyFortificationButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.fortificationState.seed, 'phase4c-fort');
  const builtDefenses = copy(reloaded.state().project.city);
  for (const key of ['nodes', 'roads', 'blocks', 'plots', 'properties', 'buildings', 'districts', 'waterFeatures', 'terrainFeatures']) {
    assert.deepEqual(copy(builtDefenses[key] ?? null), copy(afterDistrictOnly[key] ?? null), 'Defense build preserved '+key);
  }
  const defenseHistoryBeforeInvalid = reloaded.state().fortificationPanel.editor.history.length;
  reloaded.el('towerSpacingInput').value = 'not-a-spacing';
  reloaded.el('towerSpacingInput').handlers.input();
  assert.match(reloaded.el('defensePendingMessage').textContent, /Tower spacing/);
  assert.equal(reloaded.el('applyFortificationButton').handlers.click(), false);
  assert.deepEqual(copy(reloaded.state().project.city), builtDefenses);
  assert.equal(reloaded.state().fortificationPanel.editor.history.length, defenseHistoryBeforeInvalid);
  reloaded.el('towerSpacingInput').value = '90';
  reloaded.el('fortificationSeedInput').value = 'phase4c-rebuild';
  reloaded.el('fortificationSeedInput').handlers.input();
  assert.match(reloaded.el('defensePendingMessage').textContent, /regenerate only walls/);
  assert.equal(reloaded.el('applyFortificationButton').handlers.click(), true);
  const crossExpected = copy(reloaded.state().project.city);
  assert.equal(crossExpected.fortificationState.seed, 'phase4c-rebuild');
  assert.equal(crossExpected.districts[0].name, 'Cross-workflow District');
  for (const key of ['nodes', 'roads', 'blocks', 'plots', 'properties', 'buildings', 'districts', 'waterFeatures', 'terrainFeatures']) {
    assert.deepEqual(copy(crossExpected[key] ?? null), copy(afterDistrictOnly[key] ?? null), 'Defense update preserved '+key);
  }
  assert.ok(await reloaded.el('saveProjectButton').handlers.click());
  const crossText = await downloaded.at(-1).blob.text();
  const crossFile = JSON.parse(crossText);
  assert.deepEqual(crossFile.project.city, crossExpected);
  assert.ok(crossFile.workspace.districtEditor.history.length >= 2);
  assert.ok(crossFile.workspace.fortificationEditor.history.length >= 2);
  // Change the in-memory state, then reload the combined save without regenerating.
  assert.equal(reloaded.el('undoDistrictButton').handlers.click(), true);
  assert.equal(reloaded.el('undoFortificationButton').handlers.click(), true);
  await reloaded.state().files.stageFile({ size: crossText.length, text: async () => crossText });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.deepEqual(copy(reloaded.state().project.city), crossExpected);
  assert.equal(reloaded.state().workspaceShell.state.selection.id, crossDistrictId);
  assert.equal(reloaded.el('districtInspectorControls').hidden, false);
  assert.equal(reloaded.el('defensePendingMessage').textContent, 'No defense changes pending. The accepted city and fortifications are unchanged.');
  // Undo operations remain independent across the loaded district and defense histories.
  assert.equal(reloaded.el('undoFortificationButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.fortificationState.seed, 'phase4c-fort');
  assert.equal(reloaded.state().project.city.districts[0].name, 'Cross-workflow District');
  const crossDefenseAfterUndo = copy({
    walls: reloaded.state().project.city.walls,
    gates: reloaded.state().project.city.gates,
    towers: reloaded.state().project.city.towers
  });
  assert.equal(reloaded.el('undoDistrictButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.districts[0].name, crossDistrictOriginalName);
  assert.deepEqual(copy({
    walls: reloaded.state().project.city.walls,
    gates: reloaded.state().project.city.gates,
    towers: reloaded.state().project.city.towers
  }), crossDefenseAfterUndo);
  assert.equal(reloaded.el('undoFortificationButton').handlers.click(), true);
  assert.equal(reloaded.state().project.city.fortificationState.status, 'unbuilt');
  assert.equal(reloaded.el('undoDistrictButton').handlers.click(), true);
  assert.deepEqual(copy(reloaded.state().project.city), crossBaseline, 'Cross-workflow undo restores exact original city');
  // Water remains a draft until its complete street/bridge generation succeeds.
  const dryProject = copy(reloaded.state().project);
  reloaded.el('waterSeedInput').value = 'river-stress';
  reloaded.el('riverWidthInput').value = '24';
  reloaded.el('generateRiverButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.dirty, true);
  assert.deepEqual(copy(reloaded.state().project), dryProject);
  reloaded.el('editBridgesButton').handlers.click();
  const we = reloaded.state().waterPanel.editor,
    f = we.features[0],
    bridge = we.bridges[0],
    priorT = bridge.t;
  const start = reloaded.state().camera.worldToScreen(waterAt(f, priorT)),
    end = reloaded.state().camera.worldToScreen(waterAt(f, priorT + .02));
  const canvas = reloaded.el('mapCanvas'),
    fire = (type, p) => canvas.handlers[type]({
      clientX: p.x,
      clientY: p.y,
      button: 0,
      pointerId: 1,
      preventDefault() {}
    });
  fire('pointerdown', start);
  fire('pointermove', end);
  fire('pointerup', end);
  assert.ok(Math.abs(we.bridges[0].t - priorT) > .01);
  reloaded.el('generateButton').handlers.click();
  assert.equal(reloaded.state().project.city.waterFeatures.length, 1, reloaded.el('draftMessage').textContent);
  assert.equal(reloaded.state().waterPanel.editor.dirty, false);
  const wetProject = copy(reloaded.state().project);
  // Removing every bridge can be saved as a draft, but cannot replace the valid city.
  reloaded.el('editBridgesButton').handlers.click();
  for (const b of [...reloaded.state().waterPanel.editor.bridges]) {
    reloaded.state().waterPanel.editor.selectedBridge = b.id;
    reloaded.el('removeWaterItemButton').handlers.click();
  }
  assert.match(reloaded.el('waterMessage').textContent, /at least one bridge/);
  reloaded.el('generateButton').handlers.click();
  assert.deepEqual(copy(reloaded.state().project), wetProject);
  assert.match(reloaded.el('waterMessage').textContent, /at least one bridge/);
  assert.ok(await reloaded.el('saveProjectButton').handlers.click());
  const wetFile = downloaded.at(-1),
    wetText = await wetFile.blob.text();
  reloaded.el('revertWaterButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.dirty, false);
  await reloaded.state().files.stageFile({
    size: wetFile.blob.size,
    text: async () => wetText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.deepEqual(copy(reloaded.state().project), wetProject);
  assert.equal(reloaded.state().waterPanel.editor.bridges.length, 0);
  assert.equal(reloaded.state().waterPanel.editor.dirty, true);
  reloaded.el('undoWaterButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.bridges.length, 1);
  reloaded.el('coastDirectionInput').value = 'east';
  reloaded.el('coastSeedInput').value = 'coast-stress';
  reloaded.el('generateCoastButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.features.length, 2);
  assert.equal(reloaded.state().waterPanel.editor.activeFeature().kind, 'coast');
  assert.deepEqual(copy(reloaded.state().waterPanel.editor.features.find(f => f.kind === 'river')), wetProject.city.waterFeatures[0]);
  assert.deepEqual(copy(reloaded.state().project), wetProject);
  assert.equal(reloaded.el('addBridgeButton').disabled, false);
  assert.notEqual(reloaded.el('riverWidthInput').disabled, true);
  const shoreEditor = reloaded.state().waterPanel.editor,
    shorePoint = shoreEditor.activeFeature().path[4];
  const a = reloaded.state().camera.worldToScreen(shorePoint),
    b = {
      x: a.x + 3 * reloaded.state().camera.zoom,
      y: a.y
    };
  fire('pointerdown', a);
  fire('pointermove', b);
  fire('pointerup', b);
  reloaded.el('generateButton').handlers.click();
  assert.equal(reloaded.state().project.city.waterState.status, 'mixed', reloaded.el('waterMessage').textContent);
  assert.equal(reloaded.state().project.city.bridges.length, 1);
  const coastProject = copy(reloaded.state().project);
  reloaded.el('flipCoastButton').handlers.click();
  assert.match(reloaded.el('waterMessage').textContent, /square/);
  reloaded.el('generateButton').handlers.click();
  assert.deepEqual(copy(reloaded.state().project), coastProject);
  reloaded.el('coastDirectionInput').value = 'south';
  assert.ok(await reloaded.el('saveProjectButton').handlers.click());
  const coastFile = downloaded.at(-1),
    coastText = await coastFile.blob.text();
  reloaded.el('revertWaterButton').handlers.click();
  await reloaded.state().files.stageFile({
    size: coastFile.blob.size,
    text: async () => coastText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.deepEqual(copy(reloaded.state().project), coastProject);
  assert.equal(reloaded.el('coastDirectionInput').value, 'south');
  reloaded.el('undoWaterButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.features.find(f => f.kind === 'coast').waterSide, coastProject.city.waterFeatures.find(f => f.kind === 'coast').waterSide);
  const preservedRiver = copy(reloaded.state().waterPanel.editor.features.find(f => f.kind === 'river'));
  reloaded.el('removeCoastButton').handlers.click();
  assert.deepEqual(copy(reloaded.state().waterPanel.editor.features), [preservedRiver]);
  reloaded.el('undoWaterButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.features.length, 2);
  const preservedCoast = copy(reloaded.state().waterPanel.editor.features.find(f => f.kind === 'coast'));
  reloaded.el('removeRiverButton').handlers.click();
  assert.deepEqual(copy(reloaded.state().waterPanel.editor.features), [preservedCoast]);
  assert.equal(reloaded.state().waterPanel.editor.bridges.length, 0);
  reloaded.el('undoWaterButton').handlers.click();
  reloaded.el('editRiverButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.activeFeature().kind, 'river');
  reloaded.el('editCoastButton').handlers.click();
  assert.equal(reloaded.state().waterPanel.editor.activeFeature().kind, 'coast');
  reloaded.el('waterSeedInput').value = 'only-the-river';
  reloaded.el('coastSeedInput').value = 'only-the-coast';
  assert.ok(await reloaded.el('saveProjectButton').handlers.click());
  const independentFile = downloaded.at(-1),
    independentText = await independentFile.blob.text();
  reloaded.el('waterSeedInput').value = 'changed';
  reloaded.el('coastSeedInput').value = 'changed';
  await reloaded.state().files.stageFile({
    size: independentFile.blob.size,
    text: async () => independentText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.equal(reloaded.el('waterSeedInput').value, 'only-the-river');
  assert.equal(reloaded.el('coastSeedInput').value, 'only-the-coast');
  reloaded.el('revertWaterButton').handlers.click();
  reloaded.el('editRiverButton').handlers.click();
  const beforeGuide = copy(reloaded.state().project),
    guidedEditor = reloaded.state().waterPanel.editor,
    guidedRiver = guidedEditor.activeFeature(),
    coastBeforeGuide = copy(guidedEditor.features.find(f => f.kind === 'coast')),
    frame = waterFrame(guidedRiver);
  const handle = reloaded.state().camera.worldToScreen(guidedRiver.path[3]),
    pastNeighbor = reloaded.state().camera.worldToScreen({
      x: guidedRiver.path[4].x + frame.u.x * 40,
      y: guidedRiver.path[4].y + frame.u.y * 40
    });
  fire('pointerdown', handle);
  fire('pointermove', pastNeighbor);
  fire('pointerup', pastNeighbor);
  assert.equal(riverPathIsOrdered(guidedRiver.path), true);
  assert.doesNotMatch(reloaded.el('waterMessage').textContent, /too sharply|untangle/);
  assert.deepEqual(copy(reloaded.state().project), beforeGuide);
  assert.deepEqual(copy(guidedEditor.features.find(f => f.kind === 'coast')), coastBeforeGuide);
  reloaded.el('undoWaterButton').handlers.click();
  // An older saved invalid draft is repaired when applying, while file loading stays exact.
  const legacyRiver = guidedEditor.features.find(f => f.kind === 'river');
  legacyRiver.path[4] = {
    ...legacyRiver.path[3]
  };
  guidedEditor.dirty = true;
  reloaded.el('generateButton').handlers.click();
  assert.equal(guidedEditor.dirty, false, reloaded.el('waterMessage').textContent);
  assert.equal(riverPathIsOrdered(reloaded.state().project.city.waterFeatures.find(f => f.kind === 'river').path), true);
  assert.match(reloaded.el('waterMessage').textContent, /tidied/);
  reloaded.el('undoWaterButton').handlers.click();
  assert.equal(riverPathIsOrdered(guidedEditor.features.find(f => f.kind === 'river').path), false);
  reloaded.el('tidyRiverButton').handlers.click();
  assert.equal(riverPathIsOrdered(guidedEditor.features.find(f => f.kind === 'river').path), true);
  reloaded.el('revertWaterButton').handlers.click();
  reloaded.el('editCoastButton').handlers.click();
  const shoreGuide = guidedEditor.activeFeature(),
    riverBeforeCoastGuide = copy(guidedEditor.features.find(f => f.kind === 'river')),
    bridgesBeforeCoastGuide = copy(guidedEditor.bridges),
    shoreFrame = waterFrame(shoreGuide),
    shoreStart = reloaded.state().camera.worldToScreen(shoreGuide.path[3]),
    shoreEnd = reloaded.state().camera.worldToScreen({
      x: shoreGuide.path[4].x + shoreFrame.u.x * 40,
      y: shoreGuide.path[4].y + shoreFrame.u.y * 40
    });
  fire('pointerdown', shoreStart);
  fire('pointermove', shoreEnd);
  fire('pointerup', shoreEnd);
  assert.equal(waterPathIsOrdered(shoreGuide.path), true);
  assert.doesNotMatch(reloaded.el('waterMessage').textContent, /too sharply|untangle/);
  assert.deepEqual(copy(guidedEditor.features.find(f => f.kind === 'river')), riverBeforeCoastGuide);
  assert.deepEqual(copy(guidedEditor.bridges), bridgesBeforeCoastGuide);
  reloaded.el('undoWaterButton').handlers.click();
  const oldCoastDraft = guidedEditor.features.find(f => f.kind === 'coast');
  oldCoastDraft.path[4] = {
    ...oldCoastDraft.path[3]
  };
  guidedEditor.dirty = true;
  reloaded.el('generateButton').handlers.click();
  assert.equal(guidedEditor.dirty, false, reloaded.el('waterMessage').textContent);
  assert.match(reloaded.el('waterMessage').textContent, /Coastline handles were tidied/);
  reloaded.el('undoWaterButton').handlers.click();
  assert.equal(waterPathIsOrdered(guidedEditor.features.find(f => f.kind === 'coast').path), false);
  reloaded.el('tidyCoastButton').handlers.click();
  assert.equal(waterPathIsOrdered(guidedEditor.features.find(f => f.kind === 'coast').path), true);




  reloaded.el('revertWaterButton').handlers.click();
  const existingWater = copy(guidedEditor.features),
    existingBridges = copy(guidedEditor.bridges);
  reloaded.el('lakeSeedInput').value = 'bundle-lakes';
  reloaded.el('lakeRadiusInput').value = '18';
  reloaded.el('addLakeButton').handlers.click();
  reloaded.el('addLakeButton').handlers.click();
  assert.equal(guidedEditor.features.filter(f => f.kind === 'lake').length, 2, reloaded.el('waterMessage').textContent);
  assert.deepEqual(copy(guidedEditor.features.filter(f => f.kind !== 'lake')), existingWater);
  assert.deepEqual(copy(guidedEditor.bridges), existingBridges);
  const firstLake = guidedEditor.features.find(f => f.kind === 'lake');
  reloaded.el('lakeSelect').value = firstLake.id;
  reloaded.el('lakeSelect').handlers.change();
  assert.equal(guidedEditor.activeWaterId, firstLake.id);
  const oldLake = copy(firstLake);
  reloaded.el('moveLakeButton').handlers.click();
  const lakeStart = reloaded.state().camera.worldToScreen(firstLake.center),
    lakeEnd = reloaded.state().camera.worldToScreen({
      x: firstLake.center.x + 2,
      y: firstLake.center.y + 2
    });
  fire('pointerdown', lakeStart);
  fire('pointermove', lakeEnd);
  fire('pointerup', lakeEnd);
  assert.notDeepEqual(copy(firstLake.center), oldLake.center);
  reloaded.el('undoWaterButton').handlers.click();
  assert.deepEqual(copy(guidedEditor.features.find(f => f.id === firstLake.id)), oldLake);
  reloaded.el('generateButton').handlers.click();
  assert.equal(guidedEditor.dirty, false, reloaded.el('waterMessage').textContent);
  assert.equal(reloaded.state().project.city.waterFeatures.length, 4);
  reloaded.el('lakeSeedInput').value = 'pending-lake';
  reloaded.el('lakeRadiusInput').value = '39';
  assert.ok(await reloaded.el('saveProjectButton').handlers.click());
  const lakeSave = JSON.parse(await downloaded.at(-1).blob.text());
  assert.equal(lakeSave.workspace.waterEditor.controls.lakeSeed, 'pending-lake');
  assert.equal(lakeSave.workspace.waterEditor.controls.lakeRadius, '39');
  assert.equal(lakeSave.workspace.waterEditor.controls.lakeId, firstLake.id);
  const lakeFile = {
    size: JSON.stringify(lakeSave).length,
    text: async () => JSON.stringify(lakeSave)
  };
  await reloaded.state().files.stageFile(lakeFile);
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.equal(reloaded.el('lakeSelect').value, firstLake.id);
  assert.equal(reloaded.el('lakeSeedInput').value, 'pending-lake');
  assert.equal(reloaded.el('lakeRadiusInput').value, '39');
  reloaded.el('removeLakeButton').handlers.click();
  assert.equal(guidedEditor.features.filter(f => f.kind === 'lake').length, 1);
  assert.ok(!guidedEditor.features.some(f => f.id === firstLake.id));
  reloaded.el('undoWaterButton').handlers.click();
  assert.equal(guidedEditor.features.filter(f => f.kind === 'lake').length, 2);

  // Mountain controls use a separate editor and persist accepted geometry and drafts.
  reloaded.el('revertWaterButton').handlers.click();
  reloaded.el('terrainSeedInput').value = 'bundle-mountains';
  reloaded.el('terrainSizeInput').value = '45';
  reloaded.el('terrainHeightInput').value = '1100';
  reloaded.el('terrainPlacementInput').value = 'inside';
  const waterBeforeMountain = copy(reloaded.state().project.city.waterFeatures);
  reloaded.el('addTerrainButton').handlers.click();
  const terrainEditor = reloaded.state().terrainPanel.editor;
  assert.equal(terrainEditor.features.length, 1, reloaded.el('terrainMessage').textContent);
  assert.equal(terrainEditor.dirty, true);
  assert.equal(reloaded.state().waterPanel.editor.mode, 'pan');
  const mountainId = terrainEditor.activeTerrainId,
    mountainBeforeMove = copy(terrainEditor.activeFeature());
  reloaded.el('moveTerrainButton').handlers.click();
  const mstart = reloaded.state().camera.worldToScreen(mountainBeforeMove.center),
    mend = reloaded.state().camera.worldToScreen({
      x: mountainBeforeMove.center.x + 3,
      y: mountainBeforeMove.center.y + 2
    });
  fire('pointerdown', mstart);
  fire('pointermove', mend);
  fire('pointerup', mend);
  assert.notDeepEqual(copy(terrainEditor.activeFeature().center), mountainBeforeMove.center);
  reloaded.el('undoTerrainButton').handlers.click();
  assert.deepEqual(copy(terrainEditor.activeFeature()), mountainBeforeMove);
  reloaded.el('editRidgeButton').handlers.click();
  reloaded.el('terrainHeightInput').value = '1450';
  reloaded.el('terrainHeightInput').handlers.change();
  assert.equal(terrainEditor.activeFeature().ridge[1].height, 1450);
  reloaded.el('generateButton').handlers.click();
  assert.equal(terrainEditor.dirty, false, reloaded.el('terrainMessage').textContent);
  assert.equal(reloaded.state().project.city.terrainFeatures.length, 1);
  assert.deepEqual(copy(reloaded.state().project.city.waterFeatures), waterBeforeMountain);
  reloaded.el('editTerrainButton').handlers.click();
  reloaded.el('terrainSeedInput').value = 'pending-terrain';
  reloaded.el('terrainSizeInput').value = '62';
  assert.ok(await reloaded.el('saveProjectButton').handlers.click());
  const terrainText = await downloaded.at(-1).blob.text(),
    terrainSaved = JSON.parse(terrainText);
  assert.equal(terrainSaved.workspace.terrainEditor.controls.seed, 'pending-terrain');
  assert.equal(terrainSaved.workspace.terrainEditor.activeTerrainId, mountainId);
  reloaded.el('removeTerrainButton').handlers.click();
  assert.equal(terrainEditor.features.length, 0);
  await reloaded.state().files.stageFile({
    size: terrainText.length,
    text: async () => terrainText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.equal(terrainEditor.activeTerrainId, mountainId);
  assert.equal(terrainEditor.mode, 'shape');
  assert.equal(reloaded.el('terrainSeedInput').value, 'pending-terrain');
  assert.equal(reloaded.el('terrainSizeInput').value, '62');
  assert.deepEqual(copy(reloaded.state().project.city.terrainFeatures), terrainSaved.project.city.terrainFeatures);
  reloaded.el('editRiverButton').handlers.click();
  assert.equal(terrainEditor.mode, 'pan');

  // The workspace shell preserves completed drafts and existing editor histories.
  const shell = reloaded.state().workspaceShell;
  reloaded.el('workspaceTab-landscape').handlers.click();
  reloaded.el('waterSeedInput').value = 'pending-shell-seed';
  const beforeTabs = {
    project: copy(reloaded.state().project),
    outline: copy(reloaded.state().editor.snapshot()),
    water: copy(guidedEditor.definition()),
    waterHistory: copy(guidedEditor.history),
    terrain: copy(terrainEditor.definition()),
    terrainHistory: copy(terrainEditor.history)
  };
  reloaded.el('workspaceTab-defenses').handlers.click();
  reloaded.el('workspaceTab-districts').handlers.click();
  reloaded.el('workspaceTab-city').handlers.click();
  assert.deepEqual(copy(reloaded.state().project), beforeTabs.project);
  assert.deepEqual(copy(reloaded.state().editor.snapshot()), beforeTabs.outline);
  assert.deepEqual(copy(guidedEditor.definition()), beforeTabs.water);
  assert.deepEqual(copy(guidedEditor.history), beforeTabs.waterHistory);
  assert.deepEqual(copy(terrainEditor.definition()), beforeTabs.terrain);
  assert.deepEqual(copy(terrainEditor.history), beforeTabs.terrainHistory);
  assert.equal(reloaded.el('waterSeedInput').value, 'pending-shell-seed');
  assert.equal(guidedEditor.mode, 'pan');
  reloaded.el('workspaceCollapseTools').handlers.click();
  assert.equal(reloaded.el('workspaceTools').hidden, true);
  reloaded.el('workspaceOpenTools').handlers.click();
  assert.equal(reloaded.el('workspaceTools').hidden, false);
  shell.clear();
  assert.equal(reloaded.el('workspaceInspector').hidden, true);
  reloaded.el('workspaceOpenInspector').handlers.click();
  assert.equal(shell.state.inspectorPinned, true);
  shell.clear();
  assert.equal(reloaded.el('workspaceInspector').hidden, false);
  reloaded.el('workspacePinInspector').handlers.click();
  assert.equal(reloaded.el('workspaceInspector').hidden, true);
  reloaded.el('workspaceTab-landscape').handlers.click();
  reloaded.el('editRiverButton').handlers.click();
  assert.equal(shell.state.section, 'landscape');
  assert.equal(shell.state.selection.kind, 'water');
  assert.equal(reloaded.el('workspaceInspector').hidden, false);
  const riverForCancel = copy(guidedEditor.activeFeature()),
    historyBeforeCancel = copy(guidedEditor.history);
  guidedEditor.down(riverForCancel.path[3], 1);
  guidedEditor.move({
    x: riverForCancel.path[3].x + 2,
    y: riverForCancel.path[3].y + 2
  });
  reloaded.el('workspaceTab-city').handlers.click();
  assert.equal(guidedEditor.dragging, null);
  assert.deepEqual(copy(guidedEditor.activeFeature()), riverForCancel);
  assert.deepEqual(copy(guidedEditor.history), historyBeforeCancel);
  reloaded.el('workspaceTab-landscape').handlers.click();
  reloaded.el('editTerrainButton').handlers.click();
  assert.equal(shell.state.selection.kind, 'terrain');
  assert.equal(reloaded.el('workspaceSelectionName').textContent, terrainEditor.activeFeature().name);

  // Phase 3: real list, map, inspector and file adapters share stable references.
  const landscape = reloaded.state().landscapeWorkspace;
  const lakesForUI = guidedEditor.features.filter(f => f.kind === 'lake');
  assert.ok(lakesForUI.length >= 2);
  const selectedRef = {
    kind: 'water',
    id: lakesForUI[0].id
  };
  landscape.select(selectedRef);
  reloaded.el('lakeSeedInput').value = 'pending-selected-lake';
  const uiBefore = copy([guidedEditor.features, terrainEditor.features]);
  landscape.rows.get('water:' + lakesForUI[1].id).button.handlers.click();
  landscape.select(selectedRef);
  assert.equal(reloaded.el('lakeSeedInput').value, 'pending-selected-lake');
  assert.equal(guidedEditor.mode, 'pan');
  assert.deepEqual(copy([guidedEditor.features, terrainEditor.features]), uiBefore);
  assert.equal(reloaded.el('landscapeLakeControls').hidden, false);
  assert.equal(reloaded.el('landscapeRiverControls').hidden, true);
  reloaded.el('landscapeFilter-mountains').handlers.click();
  const mapLake = reloaded.state().camera.worldToScreen(lakesForUI[0].center);
  fire('pointermove', mapLake);
  assert.equal(landscape.hover.id, selectedRef.id);
  fire('pointerdown', mapLake);
  fire('pointerup', mapLake);
  assert.deepEqual(copy(shell.state.selection), selectedRef);
  assert.equal(landscape.filter, 'all', 'Map selection reveals a record hidden by a filter');
  assert.equal(reloaded.el('editLakeButton').hidden, false);
  reloaded.el('removeLakeButton').handlers.click();
  assert.equal(shell.state.selection, null);
  assert.ok(!guidedEditor.features.some(f => f.id === selectedRef.id));
  assert.deepEqual(copy(guidedEditor.features), uiBefore[0].filter(f => f.id !== selectedRef.id));
  reloaded.el('undoWaterButton').handlers.click();
  landscape.select(selectedRef);
  reloaded.el('lakeSeedInput').value = 'portable-selected-lake';
  await reloaded.el('saveProjectButton').handlers.click();
  const selectedText = await downloaded.at(-1).blob.text(),
    selectedSave = JSON.parse(selectedText);
  assert.deepEqual(selectedSave.workspace.view.landscapeSelection, selectedRef);
  shell.clear();
  await reloaded.state().files.stageFile({
    size: selectedText.length,
    text: async () => selectedText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.deepEqual(copy(shell.state.selection), selectedRef);
  assert.equal(guidedEditor.mode, 'pan');
  assert.equal(reloaded.el('lakeSeedInput').value, 'portable-selected-lake');
  assert.deepEqual(copy(reloaded.state().project), selectedSave.project);
  const stale = copy(selectedSave);
  stale.workspace.view.landscapeSelection.id = 'removed-record';
  stale.workspace.waterEditor.mode = 'river';
  const staleText = JSON.stringify(stale);
  await reloaded.state().files.stageFile({
    size: staleText.length,
    text: async () => staleText
  });
  assert.equal(await reloaded.el('openProjectButton').handlers.click(), true);
  assert.equal(shell.state.selection, null);
  assert.equal(guidedEditor.mode, 'pan');
  assert.deepEqual(copy(reloaded.state().project), selectedSave.project);

});
