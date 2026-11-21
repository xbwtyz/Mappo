import test from 'node:test';
import assert from 'node:assert/strict';
import { DistrictWorkspace } from '../src/ui/district-workspace.js';
import { DistrictPanel } from '../src/ui/districts.js';

function harness() {
  const elements = new Map();
  const make = () => ({
    value: '', hidden: false, disabled: false, textContent: '', handlers: {},
    attributes: {},
    classList: { toggle() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    replaceChildren(...nodes) { this.children = nodes; },
    scrollIntoView() { this.revealed = true; }
  });
  const el = id => {
    if (!elements.has(id)) elements.set(id, make());
    return elements.get(id);
  };
  const city = {
    districtState: { status: 'assigned' },
    districts: [
      { id: 'D1', name: 'Old Quarter', color: '#123abc', blockIds: ['B1', 'B2'] },
      { id: 'D2', name: 'South Ward', color: '#ffeeca', blockIds: ['B3'] }
    ]
  };
  const shell = { state: { selection: null } };
  let refreshed = 0, changed = 0;
  const panel = {
    editor: { selectedDistrictId: null, selectedBlockId: null },
    refresh() { refreshed++; },
    changed() {
      changed++;
      shell.state.selection = { kind: 'district', id: this.editor.selectedDistrictId };
    }
  };
  const adapter = new DistrictWorkspace({
    getElement: el, getCity: () => city, panel,
    getShell: () => shell,
    document: { createElement: make }
  });
  return { el, city, shell, panel, adapter, counts: () => ({ refreshed, changed }) };
}

test('district list is keyed, shows accepted names/colors, and selects through the existing panel', () => {
  const { adapter, el, city, panel, shell, counts } = harness();
  adapter.render();
  assert.equal(el('districtList').children.length, 2);
  const first = adapter.rows.get('D1');
  assert.equal(first.name.textContent, 'Old Quarter');
  assert.equal(first.swatch.attributes.style, 'background-color:#123abc');
  first.button.handlers.click();
  assert.equal(panel.editor.selectedDistrictId, 'D1');
  assert.equal(shell.state.selection.id, 'D1');
  assert.equal(el('districtInspectorControls').hidden, false);
  assert.deepEqual(counts(), { refreshed: 1, changed: 1 });
  assert.equal(first.button.revealed, true);
  city.districts[0].name = 'Renamed Quarter';
  adapter.render();
  assert.equal(adapter.rows.get('D1'), first, 're-render retains the same row');
  assert.equal(first.name.textContent, 'Renamed Quarter');
  assert.equal(first.button.attributes['aria-pressed'], 'true');
});

test('district list handles missing records, unassigned cities, and unrelated inspector selection', () => {
  const { adapter, el, city, panel, shell } = harness();
  adapter.render();
  assert.equal(adapter.select('missing'), false);
  adapter.select('D2');
  assert.equal(panel.editor.selectedDistrictId, 'D2');
  shell.state.selection = { kind: 'water', id: 'R1' };
  adapter.render();
  assert.equal(el('districtInspectorControls').hidden, true);
  city.districts = [city.districts[0]];
  adapter.render();
  assert.equal(adapter.rows.has('D2'), false);
  assert.equal(el('districtList').children.length, 1);
  city.districtState.status = 'unassigned';
  adapter.render();
  assert.equal(el('districtList').children.length, 0);
  assert.equal(el('districtEmpty').hidden, false);
});

test('district refresh caches unfinished values when changing selection and restores them on return', () => {
  const { el } = harness();
  const city = {
    id: 'seed', districtState: { status: 'assigned', requestedCount: 1, seed: 'seed' },
    districts: [{ id: 'D1', name: 'Old', color: '#123abc', blockIds: ['B1'] }],
    nodes: [
      { id: 'N1', x: 0, y: 0 }, { id: 'N2', x: 10, y: 0 },
      { id: 'N3', x: 0, y: 10 }
    ],
    blocks: [{ id: 'B1', districtId: 'D1', vertices: ['N1', 'N2', 'N3'], area: 50 }],
    properties: [], buildings: [], roads: []
  };
  const panel = new DistrictPanel({
    getElement: el, getCity: () => city,
    commit() {}, changed() {}, document: { createElement: () => ({}) }
  });
  panel.editor.selectedDistrictId = 'D1';
  panel.refresh(true);
  assert.equal(el('districtNameInput').value, 'Old');
  el('districtNameInput').value = 'Unapplied name';
  el('districtColorInput').value = '#abcdef';
  panel.editor.selectedBlockId = 'B1';
  panel.refresh();
  assert.equal(el('districtNameInput').value, 'Unapplied name');
  assert.equal(el('districtColorInput').value, '#abcdef');
  panel.editor.selectedDistrictId = null;
  panel.refresh();
  assert.equal(el('districtNameInput').value, '');
  panel.editor.selectedDistrictId = 'D1';
  panel.refresh();
  assert.equal(el('districtNameInput').value, 'Unapplied name');
  assert.equal(el('districtColorInput').value, '#abcdef');
  assert.deepEqual(panel.snapshotUI().formCache, [{id:'D1',name:'Unapplied name',color:'#abcdef'}]);
  panel.refresh(true);
  assert.equal(el('districtNameInput').value, 'Old', 'applying or regenerating clears stale cached forms');
});
