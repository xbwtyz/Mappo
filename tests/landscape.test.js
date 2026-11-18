import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hitLandscape,
  landscapeRecords,
  landscapeLabel
} from '../src/core/landscape-selection.js';
import {
  LandscapeWorkspace
} from '../src/ui/landscape.js';
import {
  WaterEditor
} from '../src/editor/water.js';
import {
  TerrainEditor
} from '../src/editor/terrain.js';

const lake = (id, x = 0, radius = 20) => ({
  id,
  kind: 'lake',
  center: {
    x,
    y: 0
  },
  path: Array.from({
    length: 12
  }, (_, i) => ({
    x: x + Math.cos(i * Math.PI / 6) * radius,
    y: Math.sin(i * Math.PI / 6) * radius
  })),
  generation: {
    seed: id,
    radius
  }
});
const mountain = (id, x = 120) => ({
  id,
  kind: 'mountain',
  name: 'Granite Ridge',
  center: {
    x,
    y: 0
  },
  path: [{
    x: x - 30,
    y: -30
  }, {
    x: x + 30,
    y: -30
  }, {
    x: x + 30,
    y: 30
  }, {
    x: x - 30,
    y: 30
  }],
  ridge: [{
    x: x - 10,
    y: 0,
    height: 600
  }, {
    x,
    y: 0,
    height: 900
  }, {
    x: x + 10,
    y: 0,
    height: 600
  }],
  generation: {
    seed: id,
    size: 60,
    placement: 'inside'
  }
});
const copy = v => JSON.parse(JSON.stringify(v));

function landscapeHarness() {
  const elements = new Map();
  const make = id => ({
    id,
    value: '',
    hidden: false,
    disabled: false,
    attributes: {},
    handlers: {},
    children: [],
    classList: {
      toggle() {}
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, fn) {
      this.handlers[name] = fn;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    click() {
      this.handlers.click?.();
    },
    scrollIntoView() {
      this.revealed = true;
    }
  });
  const el = id => {
    if (!elements.has(id)) elements.set(id, make(id));
    return elements.get(id);
  };
  el('landscapeTypeInput').options = ['river', 'coast', 'lake', 'terrain'].map(value => ({
    value
  }));
  const providers = new Map(),
    shell = {
      state: {
        selection: null,
        section: 'city'
      },
      registerInspector(kind, p) {
        providers.set(kind, p);
      },
      navigate(section) {
        this.state.section = section;
      },
      select(selection) {
        this.state.selection = selection;
        workspace.render();
      }
    };
  const water = {
      editor: new WaterEditor(),
      refresh() {}
    },
    terrain = {
      editor: new TerrainEditor(),
      refresh() {}
    };
  water.editor.features = [lake('lake-a'), lake('lake-b', 60)];
  water.editor.activeWaterId = 'lake-a';
  terrain.editor.features = [mountain('range-a')];
  terrain.editor.activeTerrainId = 'range-a';
  const workspace = new LandscapeWorkspace({
    getElement: el,
    document: {
      createElement: () => make('')
    },
    shell,
    water,
    terrain,
    stopTools() {
      water.editor.setMode('pan');
      terrain.editor.setMode('pan');
    }
  });
  water.editor.changed = () => workspace.editorChanged('water');
  terrain.editor.changed = () => workspace.editorChanged('terrain');
  workspace.bind();
  return {
    workspace,
    el,
    shell,
    water,
    terrain
  };
}

test('map hits use draft geometry, screen-sized edge tolerance and stable overlap priority without mutation', () => {
  const small = lake('small', 0, 12),
    large = lake('large', 0, 60),
    ranges = [mountain('range', 150)];
  const records = landscapeRecords([large, small], ranges),
    before = copy(records);
  assert.deepEqual(hitLandscape({
    x: 0,
    y: 0
  }, records), {
    kind: 'water',
    id: 'small'
  });
  assert.deepEqual(hitLandscape({
    x: 0,
    y: 0
  }, records.slice().reverse()), {
    kind: 'water',
    id: 'small'
  });
  assert.deepEqual(hitLandscape({
    x: 150,
    y: 0
  }, records), {
    kind: 'terrain',
    id: 'range'
  });
  assert.equal(hitLandscape({
    x: 280,
    y: 0
  }, records), null);
  assert.equal(hitLandscape({
    x: 24,
    y: 0
  }, landscapeRecords([small]), 1), null);
  assert.deepEqual(hitLandscape({
    x: 24,
    y: 0
  }, landscapeRecords([small]), .5), {
    kind: 'water',
    id: 'small'
  });
  const river = {
    id: 'river',
    kind: 'river',
    path: [{
      x: -200,
      y: -80
    }, {
      x: 200,
      y: -80
    }],
    width: 20
  };
  const coast = {
    id: 'coast',
    kind: 'coast',
    path: [{
      x: -200,
      y: 100
    }, {
      x: 200,
      y: 100
    }],
    waterSide: 'left'
  };
  assert.deepEqual(hitLandscape({
    x: 0,
    y: -80
  }, landscapeRecords([river, coast])), {
    kind: 'water',
    id: 'river'
  });
  const twin = lake('aaa', 0, 12);
  assert.deepEqual(hitLandscape({
    x: 0,
    y: 0
  }, landscapeRecords([small, twin])), {
    kind: 'water',
    id: 'aaa'
  });
  assert.deepEqual(records, before);
  assert.equal(landscapeLabel(records[1]).name, 'Lake · small');
});

test('list/map selection shares mounted inspector forms, keeps tools idle and retains per-feature pending inputs', () => {
  const {
    workspace,
    el,
    shell,
    water,
    terrain
  } = landscapeHarness();
  const before = copy([water.editor.features, terrain.editor.features]);
  workspace.select({
    kind: 'water',
    id: 'lake-a'
  });
  assert.equal(shell.state.section, 'landscape');
  assert.equal(water.editor.mode, 'pan');
  assert.equal(el('landscapeLakeControls').hidden, false);
  assert.equal(el('landscapeRiverControls').hidden, true);
  assert.equal(el('terrainPanel').hidden, true);
  el('lakeSeedInput').value = 'pending-lake-a';
  workspace.select({
    kind: 'water',
    id: 'lake-b'
  });
  assert.equal(el('lakeSeedInput').value, 'lake-b');
  workspace.select({
    kind: 'water',
    id: 'lake-a'
  });
  assert.equal(el('lakeSeedInput').value, 'pending-lake-a');
  el('landscapeFilter-water').click();
  workspace.select({
    kind: 'terrain',
    id: 'range-a'
  }, {
    fromMap: true
  });
  assert.equal(workspace.filter, 'all');
  assert.equal(workspace.rows.get('terrain:range-a').button.revealed, true);
  assert.equal(el('waterPanel').hidden, true);
  assert.equal(el('terrainPanel').hidden, false);
  assert.equal(el('terrainHeightInput').value, '900');
  assert.deepEqual([water.editor.features, terrain.editor.features], before);
  assert.equal(water.editor.history.length + terrain.editor.history.length, 0);
});

test('filters and hover retain selection and geometry; keyed rows keep their button identity', () => {
  const {
    workspace,
    el,
    shell,
    water
  } = landscapeHarness();
  const row = workspace.rows.get('water:lake-a').button;
  row.click();
  el('landscapeFilter-mountains').click();
  assert.equal(el('landscapeFeatureList').children.length, 1);
  assert.equal(shell.state.selection.id, 'lake-a');
  const before = copy(water.editor.definition());
  workspace.setHover({
    kind: 'terrain',
    id: 'range-a'
  });
  assert.equal(workspace.rows.get('terrain:range-a').button.attributes['aria-pressed'], 'false');
  el('landscapeFilter-all').click();
  assert.equal(workspace.rows.get('water:lake-a').button, row);
  assert.deepEqual(water.editor.definition(), before);
});

test('creation shows only the requested form and enforces singleton and multiple-feature limits', () => {
  const {
    workspace,
    el,
    shell,
    water,
    terrain
  } = landscapeHarness();
  workspace.beginAdd('lake');
  assert.equal(shell.state.selection.kind, 'landscape-add');
  assert.equal(el('landscapeCreationType').hidden, false);
  assert.equal(el('addLakeButton').hidden, false);
  assert.equal(el('editLakeButton').hidden, true);
  assert.equal(el('landscapeWaterShared').hidden, true);
  assert.equal(el('waterMessage').hidden, false);
  water.editor.features = [...Array.from({
    length: 8
  }, (_, i) => lake('lake-' + i)), {
    id: 'r',
    kind: 'river',
    path: [],
    width: 20
  }, {
    id: 'c',
    kind: 'coast',
    path: []
  }];
  terrain.editor.features = Array.from({
    length: 6
  }, (_, i) => mountain('range-' + i));
  workspace.render();
  assert.equal(el('landscapeAddButton').disabled, true);
  for (const type of ['river', 'coast', 'lake', 'terrain', 'invalid']) assert.equal(workspace.available(type), false);
});

test('removal clears missing references, undo preserves valid selection by ID, and other features survive', () => {
  const {
    workspace,
    shell,
    water
  } = landscapeHarness();
  workspace.select({
    kind: 'water',
    id: 'lake-b'
  });
  const other = copy(water.editor.features[0]);
  water.editor.setMode('river');
  water.editor.remember();
  water.editor.activeWaterId = 'lake-a';
  water.editor.mark();
  workspace.select({
    kind: 'water',
    id: 'lake-b'
  });
  water.editor.undo();
  assert.equal(shell.state.selection.id, 'lake-b');
  assert.equal(water.editor.activeWaterId, 'lake-b');
  workspace.select({
    kind: 'water',
    id: 'lake-b'
  });
  workspace.$('lakeSeedInput').value = 'pending-removed-lake';
  water.editor.removeFeature('lake-b');
  assert.equal(shell.state.selection, null);
  assert.equal(water.editor.mode, 'pan');
  assert.deepEqual(water.editor.features, [other]);
  water.editor.undo();
  assert.equal(water.editor.features.length, 2);
  assert.equal(shell.state.selection, null);
  workspace.select({
    kind: 'water',
    id: 'lake-b'
  });
  assert.equal(workspace.$('lakeSeedInput').value, 'pending-removed-lake');
});
