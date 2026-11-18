import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile
} from 'node:fs/promises';
import {
  WorkspaceMenus
} from '../src/ui/workspace-menus.js';

function menuFixture() {
  const elements = new Map(),
    events = new Map();
  const document = {
    activeElement: null,
    addEventListener(name, fn) {
      events.set(name, fn);
    }
  };
  const el = id => {
    if (!elements.has(id)) elements.set(id, {
      id,
      hidden: false,
      attributes: {},
      handlers: {},
      contains(target) {
        return target?.parent === this;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      addEventListener(name, fn) {
        this.handlers[name] = fn;
      },
      focus() {
        document.activeElement = this;
        events.get('focusin')?.({
          target: this
        });
      }
    });
    return elements.get(id);
  };
  const menus = new WorkspaceMenus({
    getElement: el,
    document
  });
  menus.bind();
  el('saveProjectButton').parent = el('projectMenu');
  el('openProjectButton').parent = el('projectMenu');
  el('buildingsLayer').parent = el('layersMenu');
  return {
    menus,
    el,
    events,
    document
  };
}

test('shared menus support keyboard opening, switching, Escape, focus exit and outside dismissal', () => {
  const {
    menus,
    el,
    events,
    document
  } = menuFixture();
  assert.equal(el('projectMenu').hidden, true);
  assert.equal(el('layersMenu').hidden, true);
  el('projectMenuButton').handlers.keydown({
    key: 'ArrowDown',
    preventDefault() {}
  });
  assert.equal(document.activeElement, el('saveProjectButton'));
  assert.equal(el('projectMenuButton').attributes['aria-expanded'], 'true');
  el('layersMenuButton').handlers.click();
  assert.equal(menus.active, 'layers');
  assert.equal(el('projectMenu').hidden, true);
  assert.equal(document.activeElement, el('buildingsLayer'));
  let prevented = false,
    stopped = false;
  events.get('keydown')({
    key: 'Escape',
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    }
  });
  assert.equal(prevented && stopped, true);
  assert.equal(menus.active, null);
  assert.equal(document.activeElement, el('layersMenuButton'));
  menus.open('project');
  events.get('pointerdown')({
    target: el('openProjectButton')
  });
  assert.equal(menus.active, 'project');
  events.get('pointerdown')({
    target: el('mapCanvas')
  });
  assert.equal(menus.active, null);
  assert.equal(document.activeElement, el('projectMenuButton'));
  menus.open('layers');
  el('mapCanvas').focus();
  assert.equal(menus.active, null);
  assert.equal(document.activeElement, el('mapCanvas'));
});

test('project attention and asynchronous load results stay discoverable without changing file state', () => {
  const {
    menus,
    el,
    document
  } = menuFixture();
  menus.projectStatus({
    message: 'Recovery available',
    error: false,
    pending: null,
    recovery: true
  });
  assert.equal(el('projectMenuAttention').hidden, false);
  assert.equal(menus.active, null);
  const pending = {
    document: {
      city: 'Staged, not applied'
    }
  };
  menus.projectStatus({
    message: 'Review then Open project',
    pending
  });
  assert.equal(menus.active, 'project');
  menus.close();
  menus.projectStatus({
    message: 'Still pending',
    pending
  });
  assert.equal(menus.active, null, 'Passive status refresh does not reopen a dismissed preview');
  menus.open('layers');
  menus.projectStatus({
    message: 'Invalid file',
    error: true,
    pending: null
  });
  assert.equal(menus.active, 'project');
  assert.equal(document.activeElement, el('saveProjectButton'), 'Focus leaves a panel hidden by an asynchronous error');
  assert.equal(pending.document.city, 'Staged, not applied');
  menus.projectStatus({
    message: 'Opened exact saved geometry',
    error: false,
    pending: null,
    recovery: false
  });
  assert.equal(el('projectMenuAttention').hidden, true);
  assert.equal(el('projectMenuButton').attributes['aria-label'], 'Project');
});

// Inventory checks use actual template ancestry, since controller tests use a
// deliberately minimal Canvas/DOM stub rather than a layout engine.
test('template retains the previous control inventory in compact, shared homes', async () => {
  const html = await readFile(new URL('../index.template.html', import.meta.url), 'utf8');
  const stack = [],
    ancestry = new Map();
  const voidTags = new Set(['meta', 'input', 'br', 'hr', 'link', 'img']);
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    const [tag, rawName] = match, name = rawName.toLowerCase();
    if (tag.startsWith('</')) {
      assert.equal(stack.pop()?.name, name, `Balanced ${tag}`);
      continue;
    }
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    if (id) {
      assert.equal(ancestry.has(id), false, `Unique ID ${id}`);
      ancestry.set(id, [...stack]);
    }
    if (!voidTags.has(name)) stack.push({
      name,
      id,
      settings: tag.includes('workspace-settings')
    });
  }
  assert.equal(stack.length, 0);
  const inside = (id, parent) => assert.ok(ancestry.get(id)?.some(a => a.id === parent), `${id} belongs in ${parent}`);
  for (const id of ['freehandButton', 'pointsButton', 'editButton', 'finishButton', 'undoButton', 'presetInput', 'presetButton', 'centerButton', 'morphologyInput', 'sizeInput', 'seedInput', 'newSeedButton', 'cancelButton']) inside(id, 'workspaceSection-city');
  for (const id of ['saveProjectButton', 'loadProjectButton', 'projectFileInput', 'restoreRecoveryButton', 'restoreBackupButton', 'keepCurrentButton', 'loadPreview', 'loadSummary', 'openProjectButton', 'cancelLoadButton', 'fileStatus']) inside(id, 'projectMenu');
  for (const id of ['buildingsLayer', 'propertiesLayer', 'plotsLayer', 'districtColorsLayer', 'districtBordersLayer', 'districtLabelsLayer', 'fortificationsLayer']) inside(id, 'layersMenu');
  for (const id of ['panButton', 'fitButton', 'zoomInButton', 'zoomOutButton', 'layersMenu']) assert.ok(!ancestry.get(id).some(a => a.id?.startsWith('workspaceSection-')), `${id} is shared across sections`);
  for (const id of ['seedInput', 'waterSeedInput', 'coastSeedInput', 'lakeSeedInput', 'terrainSeedInput', 'districtSeedInput', 'fortificationSeedInput']) assert.ok(ancestry.get(id).some(a => a.settings), `${id} is in expandable generation settings`);
  inside('presetInput', 'startingShapeSettings');
  assert.doesNotMatch(html, /Shape your city\.|CITY FOUNDATION|SHAPE THE BOUNDARY/);
});
