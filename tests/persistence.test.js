import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject
} from '../src/core/city-model.js';
import {
  makeStartingOutline
} from '../src/editor/outline.js';
import {
  createProjectDocument,
  encodeProjectDocument,
  decodeProjectDocument,
  copyJson,
  defaultWorkspace,
  projectFilename,
  utf8Size
} from '../src/data/project-format.js';
import {
  MAX_PROJECT_BYTES
} from '../src/data/project-validation.js';
import {
  RecoveryStore,
  localStorageRecoveryAdapter,
  indexedDbRecoveryAdapter,
  openBrowserRecovery
} from '../src/data/recovery-store.js';
import {
  readProjectFile,
  downloadProjectText
} from '../src/data/file-io.js';
import {
  ProjectFiles
} from '../src/ui/project-files.js';

const original = createProject({
  seed: 'save-fixture',
  size: 'small',
  morphology: 'organic'
});
const now = '2026-11-17T09:00:00.000Z';

function documentFixture() {
  return createProjectDocument(copyJson(original), defaultWorkspace(original), null, now);
}

function textFixture() {
  return encodeProjectDocument(documentFixture());
}

function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
}

function adapterFixture() {
  let state = null;
  return {
    async read() {
      return copyJson(state);
    },
    async update(transform) {
      state = copyJson(transform(copyJson(state)));
      return copyJson(state);
    },
    raw: () => state,
    set: next => {
      state = next;
    }
  };
}

function fakeElements() {
  const elements = new Map();
  return id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '',
      hidden: true,
      disabled: false,
      classList: {
        toggle() {}
      },
      addEventListener() {},
      click() {}
    });
    return elements.get(id);
  };
}

function controllerFixture({
  store = null,
  initial = documentFixture(),
  download = async () => {},
  applyFailure = false
} = {}) {
  let live = copyJson(initial);
  const elements = fakeElements(),
    timers = {
      callbacks: [],
      setTimeout(callback) {
        this.callbacks.push(callback);
        return this.callbacks.length;
      },
      clearTimeout() {}
    };
  const controller = new ProjectFiles({
    getElement: elements,
    capture: () => ({
      project: live.project,
      workspace: live.workspace
    }),
    apply: doc => {
      if (applyFailure && doc.project.city.name === 'fail-apply') throw new Error('simulated apply failure');
      live = copyJson(doc);
    },
    openRecovery: async () => {
      if (!store) throw new Error('Storage blocked');
      return store;
    },
    download,
    clock: () => now,
    timers
  });
  controller.base = copyJson(initial);
  return {
    controller,
    elements,
    timers,
    getLive: () => live,
    setLive: d => {
      live = d;
    }
  };
}

test('project files round-trip exact geometry, IDs, renamed metadata and editor/view state', () => {
  const document = documentFixture();
  document.project.city.name = 'The Saved City';
  document.project.city.buildings[0].name = 'Copper Fox';
  document.project.city.buildings[0].notes = 'Keep this building';
  const w = document.workspace;
  w.editor.dirty = true;
  w.editor.closed = false;
  w.editor.mode = 'points';
  w.editor.boundary = [{
    x: 1,
    y: 2
  }, {
    x: 70,
    y: 90
  }];
  w.editor.center = null;
  w.editor.history = [{
    boundary: [],
    center: null,
    closed: false,
    dirty: true
  }];
  w.controls.seed = '';
  w.view.camera = {
    x: 80,
    y: -50,
    zoom: 2.7
  };
  w.view.layers.plots = true;
  const restored = decodeProjectDocument(encodeProjectDocument(document));
  assert.deepEqual(restored, document);
  assert.equal(restored.project.city.buildings[0].name, 'Copper Fox');
});

test('all 96 outline, density and street-pattern combinations save and reload without regenerating geometry', () => {
  const configurations = new Set();
  for (const outline of ['radial', 'organic', 'linear', 'planned', 'wedge', 'twin', 'branching', 'crescent'])
    for (const size of ['small', 'medium', 'large'])
      for (const morphology of ['radial', 'organic', 'linear', 'planned']) {
        const project = createProject({
          seed: 'save-shapes',
          size,
          morphology,
          boundary: makeStartingOutline(outline, 'save-shapes', size)
        });
        configurations.add([outline, project.options.size, project.options.morphology].join(':'));
        const document = createProjectDocument(project);
        assert.deepEqual(decodeProjectDocument(encodeProjectDocument(document)).project, copyJson(project));
      }
  assert.equal(configurations.size, 96);
});

test('unknown extension fields, future building types, district records and wall records survive save/load/save', () => {
  const document = documentFixture();
  document.extraEnvelope = {
    future: true
  };
  document.extensions = {
    plugin: {
      npcs: [{
        id: 'npc-1',
        name: 'Ada'
      }]
    }
  };
  document.project.city.districts[0].futureRules = {
    trade: 3
  };
  document.project.city.walls = [{
    id: 'WALL-1',
    futureGeometry: {
      nodes: ['a', 'b']
    }
  }];
  document.project.city.buildings[0].type = 'future-observatory';
  document.project.city.buildings[0].custom = {
    height: 40,
    owner: 'Ada'
  };
  document.workspace.futureInspector = {
    selected: 'BLD-00001'
  };
  document.workspace.view.layers.futureWalls = true;
  document.workspace.editor.futureConstraint = 'keep';
  const loaded = decodeProjectDocument(encodeProjectDocument(document));
  const rewritten = createProjectDocument(loaded.project, loaded.workspace, loaded, '2026-11-17T10:00:00.000Z');
  assert.deepEqual(rewritten.extensions, document.extensions);
  assert.deepEqual(rewritten.extraEnvelope, document.extraEnvelope);
  assert.deepEqual(rewritten.project, document.project);
  assert.deepEqual(rewritten.workspace, document.workspace);
  assert.equal(rewritten.documentId, document.documentId);
  assert.equal(rewritten.createdAt, document.createdAt);
});

test('legacy schema-1 projects migrate in memory while preserving their source geometry and IDs', () => {
  for (const withBuildings of [true, false]) {
    const raw = copyJson(original);
    raw.schemaVersion = 1;
    raw.generatorVersion = withBuildings ? '0.1-dev.3b' : '0.1-dev.3a2';
    if (!withBuildings) {
      raw.city.buildings = [];
      delete raw.city.plots;
      delete raw.city.properties;
      delete raw.city.openSpaces;
    }
    const text = JSON.stringify(raw),
      loaded = decodeProjectDocument(text);
    assert.equal(loaded.project.schemaVersion, 9);
    for (const key of ['nodes', 'roads', 'blocks', 'plaza']) assert.deepEqual(loaded.project.city[key], raw.city[key]);
    assert.equal(loaded.project.generatorVersion, raw.generatorVersion);
    assert.equal(raw.schemaVersion, 1);
    assert.ok(Array.isArray(loaded.project.city.properties));
    assert.deepEqual(decodeProjectDocument(encodeProjectDocument(loaded)), loaded);
  }
});

test('newer format, project and workspace versions are rejected without guessing at migrations', () => {
  for (const mutate of [d => {
      d.formatVersion = 99;
    }, d => {
      d.project.schemaVersion = 99;
    }, d => {
      d.workspace.schemaVersion = 99;
    }]) {
    const doc = documentFixture();
    mutate(doc);
    assert.throws(() => decodeProjectDocument(JSON.stringify(doc)), /newer|unsupported/i);
  }
});

test('malformed, truncated, HTML, oversized, unsafe and excessively nested files are rejected', () => {
  assert.throws(() => decodeProjectDocument('{"format":'), /incomplete|JSON/);
  assert.throws(() => decodeProjectDocument('<!doctype html>'), /standalone HTML/);
  assert.throws(() => decodeProjectDocument('x'.repeat(MAX_PROJECT_BYTES + 1)), /20 MiB/);
  assert.throws(() => decodeProjectDocument('{"__proto__":{"polluted":true},"format":"mappo-project"}'), /unsafe/);
  assert.equal({}.polluted, undefined);
  const doc = documentFixture();
  let value = {};
  doc.extensions = value;
  for (let i = 0; i < 80; i++) {
    value.next = {};
    value = value.next;
  }
  assert.throws(() => decodeProjectDocument(JSON.stringify(doc)), /nested/);
  assert.equal(utf8Size('🌲'), 4);
  assert.deepEqual(decodeProjectDocument('\uFEFF' + textFixture()).project, copyJson(original));
});

test('duplicate IDs, missing road endpoints, invalid numbers and orphan building references are rejected', () => {
  for (const mutate of [d => d.project.city.nodes.push(copyJson(d.project.city.nodes[0])), d => {
      d.project.city.roads[0].a = 'missing';
    }, d => {
      d.project.city.nodes[0].x = null;
    }, d => {
      d.project.city.buildings[0].propertyId = 'missing';
    }, d => {
      d.project.city.blocks[0].vertices[0] = 'missing';
    }, d => {
      d.workspace.view.camera.zoom = 0;
    }]) {
    const doc = documentFixture();
    mutate(doc);
    assert.throws(() => decodeProjectDocument(JSON.stringify(doc)));
  }
});

test('changed building placement, overlapping properties and an inconsistent block area cannot be loaded', () => {
  const escaped = documentFixture();
  escaped.project.city.buildings[0].footprint[0] = {
    x: 9000,
    y: 9000
  };
  assert.throws(() => decodeProjectDocument(JSON.stringify(escaped)));
  const overlap = documentFixture(),
    p = overlap.project.city.properties.find(p => overlap.project.city.properties.some(q => q.blockId === p.blockId && q.id !== p.id)),
    other = overlap.project.city.properties.find(q => q.blockId === p.blockId && q.id !== p.id);
  assert.ok(other);
  other.boundary = copyJson(p.boundary);
  assert.throws(() => decodeProjectDocument(JSON.stringify(overlap)), /overlap|parent|area|street/);
  const area = documentFixture();
  area.project.city.blocks[0].area += 300;
  assert.throws(() => decodeProjectDocument(JSON.stringify(area)), /area/);
});

test('project filenames are safe and file reads reject oversized inputs before reading bytes', async () => {
  const doc = documentFixture();
  doc.project.city.name = '../../City: <name> / 🌲';
  assert.match(projectFilename(doc), /^City-name-2026-11-17\.mappo\.json$/);
  let read = false;
  await assert.rejects(readProjectFile({
    size: MAX_PROJECT_BYTES + 1,
    text() {
      read = true;
    }
  }), /20 MiB/);
  assert.equal(read, false);
  assert.equal(await readProjectFile({
    size: 2,
    text: async () => '{}'
  }), '{}');
});

test('recovery writes keep current and previous snapshots and do not rotate backup for unchanged data', async () => {
  const adapter = adapterFixture(),
    store = new RecoveryStore(adapter);
  await store.read();
  const a = textFixture();
  await store.save(a);
  const doc = decodeProjectDocument(a);
  doc.project.city.name = 'Second version';
  const b = encodeProjectDocument(doc);
  await store.save(b);
  let saved = await store.read();
  assert.equal(saved.current, b);
  assert.equal(saved.backup, a);
  doc.savedAt = '2026-11-17T10:00:00.000Z';
  await store.save(encodeProjectDocument(doc));
  saved = await store.read();
  assert.equal(saved.backup, a);
  assert.equal(saved.current, b);
});

test('quota and transaction failures preserve the last committed recovery snapshot', async () => {
  const storage = fakeStorage(),
    store = new RecoveryStore(localStorageRecoveryAdapter(storage));
  await store.read();
  const text = textFixture();
  await store.save(text);
  const before = copyJson([...storage.data]);
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const doc = decodeProjectDocument(text);
  doc.project.city.name = 'Unsaved change';
  await assert.rejects(store.save(encodeProjectDocument(doc)), /Quota/);
  assert.deepEqual([...storage.data], before);
});

test('a corrupt current recovery keeps its usable backup; newer recovery is preserved instead of overwritten', async () => {
  const adapter = adapterFixture(),
    store = new RecoveryStore(adapter);
  const valid = textFixture();
  adapter.set({
    token: 'old',
    current: 'broken JSON',
    backup: valid
  });
  await store.read();
  const next = decodeProjectDocument(valid);
  next.project.city.name = 'Recovered';
  await store.save(encodeProjectDocument(next));
  assert.equal((await store.read()).backup, valid);
  const future = JSON.parse(valid);
  future.formatVersion = 99;
  adapter.set({
    token: 'future',
    current: JSON.stringify(future),
    backup: valid
  });
  await store.read();
  await assert.rejects(store.save(valid), /preserved|newer/);
  assert.equal(adapter.raw().token, 'future');
});

test('conflicting recovery writers cannot silently replace another tab’s last committed copy', async () => {
  const adapter = adapterFixture(),
    a = new RecoveryStore(adapter),
    b = new RecoveryStore(adapter);
  await a.read();
  await b.read();
  const text = textFixture();
  await a.save(text);
  const committed = copyJson(adapter.raw());
  await assert.rejects(b.save(text), /Another Mappo tab/);
  assert.deepEqual(adapter.raw(), committed);
});

test('download uses a JSON Blob and revokes the object URL after requesting the file', () => {
  let appended = false,
    clicked = false,
    removed = false,
    revoked = false,
    downloaded;
  const callbacks = [];
  const link = {
    click() {
      clicked = true;
      downloaded = this.download;
    },
    remove() {
      removed = true;
    }
  };
  const environment = {
    Blob,
    URL: {
      createObjectURL(blob) {
        assert.equal(blob.type, 'application/json;charset=utf-8');
        return 'blob:test';
      },
      revokeObjectURL(url) {
        assert.equal(url, 'blob:test');
        revoked = true;
      }
    },
    document: {
      createElement: () => link,
      body: {
        appendChild() {
          appended = true;
        }
      }
    },
    setTimeout(cb) {
      callbacks.push(cb);
    }
  };
  downloadProjectText('{}', 'city.mappo.json', environment);
  assert.ok(appended && clicked && removed);
  assert.equal(downloaded, 'city.mappo.json');
  assert.equal(revoked, false);
  callbacks[0]();
  assert.equal(revoked, true);
});

test('startup recovery is offered without replacing it with the default generated city', async () => {
  const adapter = adapterFixture(),
    store = new RecoveryStore(adapter),
    text = textFixture();
  await store.save(text);
  const fixture = controllerFixture({
    store
  });
  await fixture.controller.start();
  assert.equal(fixture.controller.suspended, true);
  assert.equal(fixture.elements('recoveryChoice').hidden, false);
  fixture.controller.changed();
  assert.equal(adapter.raw().current, text);
  fixture.controller.stageDocument(fixture.controller.currentRecovery, 'recovery');
  assert.equal(await fixture.controller.openPending(), true);
  assert.deepEqual(fixture.getLive().project, copyJson(original));
});

test('invalid staged files and cancel leave the open project and undo draft untouched', async () => {
  const fixture = controllerFixture();
  await fixture.controller.start();
  const before = copyJson(fixture.getLive());
  await fixture.controller.stageFile({
    size: 1,
    text: async () => '{'
  });
  assert.deepEqual(fixture.getLive(), before);
  assert.equal(fixture.controller.pending, null);
  await fixture.controller.stageFile({
    size: 10,
    text: async () => textFixture()
  });
  assert.ok(fixture.controller.pending);
  assert.deepEqual(fixture.getLive(), before);
  fixture.controller.cancelLoad();
  assert.equal(fixture.controller.pending, null);
  assert.deepEqual(fixture.getLive(), before);
});

test('latest file selection wins and cancelled in-flight reads cannot later open a stale file', async () => {
  const fixture = controllerFixture();
  await fixture.controller.start();
  let resolveFirst;
  const first = fixture.controller.stageFile({
    size: 10,
    text: () => new Promise(resolve => {
      resolveFirst = resolve;
    })
  });
  const doc = documentFixture();
  doc.project.city.name = 'Latest selected';
  await fixture.controller.stageFile({
    size: 10,
    text: async () => encodeProjectDocument(doc)
  });
  resolveFirst(textFixture());
  await first;
  assert.equal(fixture.controller.pending.document.project.city.name, 'Latest selected');
  let resolveSecond;
  const second = fixture.controller.stageFile({
    size: 10,
    text: () => new Promise(resolve => {
      resolveSecond = resolve;
    })
  });
  fixture.controller.cancelLoad();
  resolveSecond(textFixture());
  await second;
  assert.equal(fixture.controller.pending, null);
  assert.equal(fixture.controller.busy, false);
});

test('open stages exact project state, rolls back apply failures and never invokes regeneration', async () => {
  const fixture = controllerFixture({
    applyFailure: true
  });
  await fixture.controller.start();
  const before = copyJson(fixture.getLive()),
    bad = documentFixture();
  bad.project.city.name = 'fail-apply';
  fixture.controller.stageDocument(bad, 'file');
  assert.equal(await fixture.controller.openPending(), false);
  assert.deepEqual(fixture.getLive(), before);
  const good = documentFixture();
  good.project.city.name = 'Exact import';
  good.workspace.editor.dirty = true;
  good.workspace.editor.closed = false;
  good.workspace.editor.boundary = [{
    x: 1,
    y: 2
  }];
  good.workspace.editor.center = null;
  fixture.controller.stageDocument(good, 'file');
  assert.equal(await fixture.controller.openPending(), true);
  assert.deepEqual(fixture.getLive(), good);
});

test('unload warnings track pending changes and quota errors, while successful downloads protect the captured revision only', async () => {
  let finishDownload;
  const fixture = controllerFixture({
    download: () => new Promise(resolve => {
      finishDownload = resolve;
    })
  });
  await fixture.controller.start();
  fixture.controller.changed();
  assert.equal(fixture.controller.needsUnloadWarning, true);
  const promise = fixture.controller.saveDownload();
  await Promise.resolve();
  await Promise.resolve();
  fixture.controller.changed();
  finishDownload();
  await promise;
  assert.equal(fixture.controller.needsUnloadWarning, true);
  fixture.controller.download = async () => {};
  await fixture.controller.saveDownload();
  assert.equal(fixture.controller.needsUnloadWarning, false);
});

test('storage failure still permits portable downloads and validated file loading', async () => {
  let text;
  const fixture = controllerFixture({
    download: async value => {
      text = value;
    }
  });
  await fixture.controller.start();
  assert.equal(fixture.controller.store, null);
  fixture.controller.changed();
  assert.ok(await fixture.controller.saveDownload());
  assert.ok(decodeProjectDocument(text));
  const doc = documentFixture();
  doc.project.city.name = 'Portable city';
  await fixture.controller.stageFile({
    size: 1,
    text: async () => encodeProjectDocument(doc)
  });
  assert.equal(await fixture.controller.openPending(), true);
  assert.equal(fixture.getLive().project.city.name, 'Portable city');
});

function fakeIndexedDb({
  failWrites = false
} = {}) {
  let stored = null;
  const database = {
    objectStoreNames: {
      contains: () => true
    },
    createObjectStore() {},
    close() {},
    transaction(name, mode) {
      const tx = {
        error: null,
        aborted: false,
        abort() {
          this.aborted = true;
          queueMicrotask(() => this.onabort?.());
        },
        objectStore() {
          return {
            get() {
              const request = {};
              queueMicrotask(() => {
                request.result = copyJson(stored);
                request.onsuccess?.();
                queueMicrotask(() => {
                  if (tx.aborted) return;
                  if (mode === 'readwrite' && failWrites) {
                    tx.error = new Error('Simulated quota abort');
                    tx.onabort?.();
                  } else {
                    if (mode === 'readwrite' && tx.pending !== undefined) stored = copyJson(tx.pending);
                    tx.oncomplete?.();
                  }
                });
              });
              return request;
            },
            put(value) {
              tx.pending = copyJson(value);
            }
          };
        }
      };
      return tx;
    }
  };
  return {
    open() {
      const request = {
        result: database
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
    raw: () => stored
  };
}

test('IndexedDB adapter commits current/backup together and preserves them when a transaction aborts', async () => {
  const idb = fakeIndexedDb(),
    store = new RecoveryStore(indexedDbRecoveryAdapter(idb));
  await store.read();
  const first = textFixture();
  await store.save(first);
  assert.equal(idb.raw().current, first);
  const doc = decodeProjectDocument(first);
  doc.project.city.name = 'Database second';
  const second = encodeProjectDocument(doc);
  await store.save(second);
  assert.equal(idb.raw().backup, first);
  assert.equal(idb.raw().current, second);
  const failing = fakeIndexedDb({
      failWrites: true
    }),
    failed = new RecoveryStore(indexedDbRecoveryAdapter(failing));
  await failed.read();
  await assert.rejects(failed.save(first), /quota abort/);
  assert.equal(failing.raw(), null);
});

test('blocked IndexedDB falls back to localStorage; fully blocked storage reports unavailability', async () => {
  const local = fakeStorage();
  const store = await openBrowserRecovery({
    get indexedDB() {
      throw new Error('SecurityError');
    },
    localStorage: local
  });
  await store.read();
  const text = textFixture();
  await store.save(text);
  assert.equal((await store.read()).current, text);
  await assert.rejects(openBrowserRecovery({
    get indexedDB() {
      throw new Error('blocked');
    },
    get localStorage() {
      throw new Error('blocked');
    }
  }), /unavailable/);
});

test('recovery serializes rapid writes and never marks a newer in-memory revision as recovered', async () => {
  const adapter = adapterFixture(),
    store = new RecoveryStore(adapter);
  await store.read();
  const a = textFixture(),
    b = decodeProjectDocument(a);
  b.project.city.name = 'Rapid second';
  const textB = encodeProjectDocument(b);
  await Promise.all([store.save(a), store.save(textB)]);
  const saved = await store.read();
  assert.equal(saved.current, textB);
  assert.equal(saved.backup, a);
  let finish;
  const delayed = adapterFixture(),
    baseUpdate = delayed.update;
  delayed.update = async transform => {
    await new Promise(resolve => {
      finish = resolve;
    });
    return baseUpdate(transform);
  };
  const fixture = controllerFixture({
    store: new RecoveryStore(delayed)
  });
  await fixture.controller.start();
  const pending = fixture.controller.flush();
  for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
  fixture.controller.changed();
  finish();
  await pending;
  assert.ok(fixture.controller.recoveredRevision < fixture.controller.revision);
  assert.equal(fixture.controller.needsUnloadWarning, true);
});

test('frozen projects captured from the released 3A.2 and 3B HTML builds remain loadable', async () => {
  const {
    readFile
  } = await import('node:fs/promises');
  for (const version of ['3a2', '3b']) {
    const text = await readFile(new URL(`./fixtures/legacy-${version}-schema1.json`, import.meta.url), 'utf8');
    const raw = JSON.parse(text),
      document = decodeProjectDocument(text);
    assert.equal(raw.generatorVersion, `0.1-dev.${version}`);
    assert.equal(document.project.schemaVersion, 9);
    for (const key of ['nodes', 'roads', 'blocks', 'plaza', 'buildings']) assert.deepEqual(document.project.city[key], raw.city[key]);
    assert.deepEqual(decodeProjectDocument(encodeProjectDocument(document)), document);
  }
});

test('native 3B.1 schema-2 files migrate to unassigned districts without changing any saved city data', async () => {
  const {
    readFile
  } = await import('node:fs/promises');
  const raw = JSON.parse(await readFile(new URL('./fixtures/save-3b1-format1-schema2.json', import.meta.url), 'utf8'));
  const loaded = decodeProjectDocument(JSON.stringify(raw));
  assert.equal(loaded.project.schemaVersion, 9);
  assert.equal(loaded.project.city.districtState.status, 'unassigned');
  const {
    districtState,
    waterState,
    waterFeatures,
    waterFaces,
    bridges,
    fortificationState,
    gates,
    towers,
    ...city
  } = loaded.project.city;
  assert.deepEqual(city, raw.project.city);
  assert.deepEqual(loaded.workspace, raw.workspace);
  assert.equal(loaded.documentId, raw.documentId);
  // Prior readers preserved opaque future annotations; migration retains them.
  raw.project.city.districts = [{
    id: 'OPAQUE',
    future: {
      rule: 'retain'
    }
  }];
  raw.project.city.properties[0].districtId = 'OPAQUE';
  const annotated = decodeProjectDocument(JSON.stringify(raw));
  assert.deepEqual(annotated.project.city.districts, raw.project.city.districts);
  assert.equal(annotated.project.city.properties[0].districtId, 'OPAQUE');
  assert.deepEqual(decodeProjectDocument(encodeProjectDocument(annotated)), annotated);
});

test('optional landscape selection remains bounded, preserves compatible data and accepts older saves', () => {
  const document = documentFixture();
  for (const selection of [null, {
      kind: 'water',
      id: 'draft-lake'
    }, {
      kind: 'terrain',
      id: 'range-1',
      extension: {
        future: true
      }
    }]) {
    document.workspace.view.landscapeSelection = selection;
    assert.deepEqual(decodeProjectDocument(encodeProjectDocument(document)).workspace.view.landscapeSelection, selection);
  }
  for (const selection of [{
      kind: 'district',
      id: 'x'
    }, {
      kind: 'water',
      id: ''
    }, {
      kind: 'water',
      id: 'x'.repeat(129)
    }, 'bad']) {
    document.workspace.view.landscapeSelection = selection;
    assert.throws(() => encodeProjectDocument(document), /Landscape selection|landscape selection/);
  }
  delete document.workspace.view.landscapeSelection;
  assert.equal(decodeProjectDocument(encodeProjectDocument(document)).workspace.view.landscapeSelection, undefined);
});

test('additive workspace ui survives native round-trip without regenerating schema-9 city geometry',()=>{
  const source=documentFixture();
  const city=copyJson(source.project.city);
  source.workspace.ui={
    section:'defenses',toolsCollapsed:true,inspectorCollapsed:true,inspectorPinned:true,
    selection:null,sectionScroll:{city:21,defenses:74},inspectorScroll:36,
    disclosures:{cityGenerationSettings:true,workspaceCityReport:true},
    landscape:{filter:'water',formCache:[{key:'landscape-add:lake',controls:{lakeSeedInput:'custom pending lake'}}]},
    districts:{formCache:[{id:'D1',name:'Unapplied name',color:'#123abc'}]},
    futureFeature:{keep:'opaque'}
  };
  const decoded=decodeProjectDocument(encodeProjectDocument(source));
  assert.deepEqual(decoded.project.city,city,'accepted city is stored and restored exactly');
  assert.equal(decoded.project.schemaVersion,9);
  assert.equal(decoded.workspace.schemaVersion,1);
  assert.equal(decoded.workspace.ui.landscape.formCache[0].controls.lakeSeedInput,'custom pending lake');
  assert.equal(decoded.workspace.ui.section,'defenses');
  assert.equal(decoded.workspace.ui.futureFeature.keep,'opaque');
  const modified=copyJson(decoded.workspace);
  modified.ui={section:'city',landscape:{filter:'all'},disclosures:{workspaceCityReport:false}};
  const resaved=createProjectDocument(decoded.project,modified,decoded,now);
  assert.equal(resaved.workspace.ui.section,'city');
  assert.equal(resaved.workspace.ui.landscape.filter,'all');
  assert.deepEqual(resaved.workspace.ui.landscape.formCache,source.workspace.ui.landscape.formCache);
  assert.equal(resaved.workspace.ui.futureFeature.keep,'opaque');
  assert.equal(resaved.workspace.ui.disclosures.cityGenerationSettings,true);
  assert.equal(resaved.workspace.ui.disclosures.workspaceCityReport,false);
  assert.deepEqual(resaved.project.city,city);
  assert.equal(decodeProjectDocument(encodeProjectDocument(documentFixture())).workspace.ui,undefined,
    'older schema-9 documents without UI use legacy fallback');
});

test('invalid optional presentation state is rejected by the complete native project decoder',()=>{
  const source=documentFixture();
  source.workspace.ui={section:'city',landscape:{formCache:[{key:'water:a',controls:{evil:'payload'}}]}};
  assert.throws(()=>decodeProjectDocument(JSON.stringify(source)),/Invalid saved landscape input/);
});
