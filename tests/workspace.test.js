import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WorkspaceShell
} from '../src/ui/workspace.js';
import {
  registerWorkspaceInspectors
} from '../src/ui/workspace-inspectors.js';
import { BuildingWorkspace } from '../src/ui/building-workspace.js';
import { PropertyWorkspace } from '../src/ui/property-workspace.js';
import {
  workspaceInitialState,
  workspaceInspectorVisible,
  workspaceTransition
} from '../src/core/workspace-state.js';

function shellHarness(providers = {}) {
  const elements = new Map();
  let layouts = 0,
    navigations = 0,
    changes = 0;
  const el = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id,
        hidden: false,
        inert: false,
        handlers: {},
        attributes: {},
        classList: {
          toggle: (key, on) => on ? classes.add(key) : classes.delete(key),
          contains: key => classes.has(key)
        },
        setAttribute(key, value) {
          this.attributes[key] = value;
        },
        addEventListener(key, fn) {
          this.handlers[key] = fn;
        },
        replaceChildren(...children) {
          this.children = children;
        },
        focus() {
          this.focused = true;
        }
      });
    }
    return elements.get(id);
  };
  const shell = new WorkspaceShell({
    getElement: el,
    document: {
      createElement: () => ({
        attributes: {}, handlers: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, fn) { this.handlers[name] = fn; },
        replaceChildren(...children) { this.children = children; }
      })
    },
    onLayout: () => layouts++,
    onNavigate: () => navigations++,
    changed: () => changes++
  });
  for (const [kind, provider] of Object.entries(providers)) shell.registerInspector(kind, provider);
  shell.bind();
  return {
    shell,
    el,
    counts: () => ({
      layouts,
      navigations,
      changes
    })
  };
}
test('property inspector supports safe building navigation, parent return, hidden layers, local refresh and stale references', () => {
  const { shell, el } = shellHarness();
  let city = { properties: [{ id: 'PROP-1', usage: '<img src=x>', plotIds: ['plot-1', 'plot-2'], buildingIds: ['west', 'east'] }],
    buildings: [{ id: 'west', propertyId: 'PROP-1', type: 'temple', shape: 'compound-wing' },
      { id: 'east', propertyId: 'PROP-1', type: 'temple', shape: 'compound-wing' }] };
  const before = JSON.stringify(city), layers = { buildings: true, properties: false, plots: false };
  let properties;
  const buildings = new BuildingWorkspace({ shell, getCity: () => city, getLayers: () => layers, getProperties: () => properties });
  properties = new PropertyWorkspace({ shell, getCity: () => city, getLayers: () => layers, buildings });
  properties.select({ kind: 'property', id: 'PROP-1' });
  assert.equal(el('workspaceSelectionType').textContent, 'Property');
  assert.equal(shell.descriptor().sections[0].rows[0][1], '<img src=x>');
  const buttons = el('workspaceSelectionSections').children.flatMap(section => section.children ?? [])
    .filter(button => button.attributes?.['data-inspector-kind'] === 'building');
  assert.equal(buttons.length, 2);
  assert.match(buttons[0].textContent, /west/);
  buttons[0].handlers.click();
  assert.deepEqual(shell.state.selection, { kind: 'building', id: 'west' });
  assert.equal(el('workspaceSelectionName').focused, true);
  assert.equal(properties.selectBuilding('other-property', 'east'), false);
  const back = el('workspaceSelectionSections').children.flatMap(section => section.children ?? [])
    .find(button => button.attributes?.['data-inspector-kind'] === 'property');
  assert.equal(back.textContent, 'Back to property');
  back.handlers.click();
  assert.equal(shell.state.selection.kind, 'property');
  assert.equal(properties.selectBuilding('PROP-1', 'east'), true);
  assert.equal(shell.state.selection.id, 'east');
  city = JSON.parse(JSON.stringify(city));
  properties.refresh();
  assert.equal(shell.state.selection.id, 'east', 'Local record-preserving changes retain the selected child');
  layers.properties = true;
  layers.buildings = false;
  properties.refresh();
  buildings.refresh();
  assert.deepEqual(shell.state.selection, { kind: 'property', id: 'PROP-1' });
  assert.ok(shell.descriptor().sections.find(section => section.actions)?.actions.every(a => a.disabled));
  assert.equal(properties.selectBuilding('PROP-1', 'east'), false);
  properties.setHover({ kind: 'property', id: 'PROP-1' });
  layers.properties = false;
  properties.refresh();
  assert.equal(shell.state.selection, null);
  assert.equal(properties.hover, null);
  layers.plots = true;
  properties.select({ kind: 'property', id: 'PROP-1' });
  shell.navigate('landscape');
  assert.equal(shell.state.selection.id, 'PROP-1');
  assert.equal(JSON.stringify(city), before);
  properties.refresh({ replaced: true });
  assert.equal(shell.state.selection, null, 'Full replacement clears even reused property IDs');
  properties.select({ kind: 'property', id: 'PROP-1' });
  city.properties = [];
  properties.refresh();
  assert.equal(shell.state.selection, null);
});
test('building selection uses the shared inspector and clears hidden, missing or replaced records without geometry changes', () => {
  const { shell, el } = shellHarness();
  let city = { buildings: [{ id: 'BLD-1', footprint: [], holes: [] }] };
  const layers = { buildings: true };
  let selections = 0;
  const workspace = new BuildingWorkspace({ shell, getCity: () => city, getLayers: () => layers, onSelect: () => selections++ });
  const ref = { kind: 'building', id: 'BLD-1' }, before = JSON.stringify(city);
  assert.equal(workspace.select(ref), true);
  assert.equal(el('workspaceSelectionType').textContent, 'Building');
  assert.equal(el('workspaceSelectionName').textContent, 'BLD-1');
  assert.equal(el('workspaceInspector').hidden, false);
  el('workspaceCloseInspector').handlers.click();
  workspace.select(ref);
  assert.equal(el('workspaceInspector').hidden, false, 'Reselecting reopens a collapsed inspector');
  shell.navigate('landscape');
  assert.equal(shell.state.selection.id, ref.id, 'Changing sections retains valid selection');
  city = JSON.parse(JSON.stringify(city));
  workspace.refresh();
  assert.equal(shell.state.selection.id, ref.id, 'A local record-preserving update retains selection');
  workspace.setHover(ref);
  layers.buildings = false;
  workspace.refresh();
  assert.equal(shell.state.selection, null);
  assert.equal(workspace.hover, null);
  assert.equal(workspace.select(ref), false);
  layers.buildings = true;
  workspace.select(ref);
  workspace.refresh({ replaced: true });
  assert.equal(shell.state.selection, null, 'A full rebuild clears even a reused building ID');
  workspace.select(ref);
  assert.equal(JSON.stringify(city), before, 'Selection and navigation never mutate city records');
  city.buildings = [];
  shell.refresh();
  assert.equal(shell.state.selection, null);
  assert.equal(selections, 4);
});
test('workspace defaults to City with an empty inspector collapsed and one accessible section', () => {
  const {
    shell,
    el
  } = shellHarness();
  assert.equal(shell.state.section, 'city');
  assert.equal(el('workspaceInspector').hidden, true);
  assert.equal(el('workspaceSection-city').hidden, false);
  assert.equal(el('workspaceSection-landscape').hidden, true);
  assert.equal(el('workspaceSection-landscape').inert, true);
  assert.equal(el('workspaceTab-city').attributes['aria-selected'], 'true');
  assert.equal(el('workspaceTab-city').tabIndex, 0);
  el('workspaceTab-landscape').handlers.click();
  assert.equal(shell.state.section, 'landscape');
  assert.equal(el('workspaceSection-city').hidden, true);
  assert.equal(el('workspaceSection-landscape').hidden, false);
  assert.equal(el('workspaceTab-landscape').tabIndex, 0);
  assert.throws(() => shell.navigate('missing'), /Unknown/);
  assert.equal(shell.state.section, 'landscape');
});
test('selection opens the inspector; pin, close, reopen, clear and automatic disappearance cooperate', () => {
  const records = new Map([
      ['lake', {
        title: 'Northmere',
        type: 'Lake',
        section: 'landscape',
        sections: [{
          title: 'Shoreline',
          rows: [
            ['Handles', 12]
          ]
        }]
      }]
    ]),
    {
      shell,
      el,
      counts
    } = shellHarness({
      water: {
        resolve: id => records.get(id)
      }
    });
  shell.select({
    kind: 'water',
    id: 'lake'
  });
  assert.equal(el('workspaceInspector').hidden, false);
  assert.equal(el('workspaceSelectionName').textContent, 'Northmere');
  assert.equal(el('workspaceSelectionSections').children[0].textContent, 'Shoreline\nHandles: 12');
  el('workspaceCloseInspector').handlers.click();
  assert.equal(el('workspaceInspector').hidden, true);
  shell.select({
    kind: 'water',
    id: 'lake'
  }, {
    reveal: false
  });
  assert.equal(el('workspaceInspector').hidden, true);
  shell.select({
    kind: 'water',
    id: 'lake'
  });
  assert.equal(el('workspaceInspector').hidden, false);
  el('workspacePinInspector').handlers.click();
  assert.equal(shell.state.inspectorPinned, true);
  shell.clear();
  assert.equal(el('workspaceInspector').hidden, false);
  assert.equal(el('workspaceEmptyInspector').hidden, false);
  el('workspacePinInspector').handlers.click();
  assert.equal(el('workspaceInspector').hidden, true);
  shell.select({
    kind: 'water',
    id: 'lake'
  });
  records.clear();
  shell.refresh();
  assert.equal(shell.state.selection, null);
  assert.equal(el('workspaceInspector').hidden, true);
  assert.ok(counts().layouts >= 5);
});
test('future inspector providers render text safely and navigate through the shared shell', () => {
  const source = Object.freeze({
      id: 'BLD-1',
      name: '<img src=x onerror=alert(1)>'
    }),
    {
      shell,
      el
    } = shellHarness({
      building: {
        resolve: id => id === source.id ? {
          title: source.name,
          type: 'Building',
          section: 'city',
          sections: [{
            title: 'Notes',
            rows: [
              ['Name', source.name]
            ]
          }]
        } : null
      }
    });
  shell.select({
    kind: 'building',
    id: source.id
  });
  assert.equal(el('workspaceSelectionName').textContent, source.name);
  assert.equal(el('workspaceSelectionName').innerHTML, undefined);
  el('workspaceShowControls').handlers.click();
  assert.equal(shell.state.section, 'city');
  assert.equal(source.name, '<img src=x onerror=alert(1)>');
  assert.throws(() => shell.select({
    kind: 'unknown',
    id: 'x'
  }), /provider/);
});
test('panel collapse and keyboard navigation change only workspace state', () => {
  const {
    shell,
    el,
    counts
  } = shellHarness();
  el('workspaceCollapseTools').handlers.click();
  assert.equal(el('workspaceTools').hidden, true);
  assert.equal(el('workspaceOpenTools').focused, true);
  el('workspaceOpenTools').handlers.click();
  assert.equal(el('workspaceTools').hidden, false);
  const event = {
    key: 'ArrowRight',
    preventDefault() {
      this.prevented = true;
    }
  };
  el('workspaceTab-city').handlers.keydown(event);
  assert.equal(shell.state.section, 'landscape');
  assert.equal(event.prevented, true);
  assert.equal(el('workspaceTab-landscape').focused, true);
  shell.dispatch({
    type: 'inspector',
    collapsed: false
  });
  assert.equal(shell.state.inspectorPinned, true);
  assert.equal(el('workspaceInspector').hidden, false);
  shell.reset();
  assert.deepEqual(shell.state, workspaceInitialState());
  assert.equal(el('workspaceInspector').hidden, true);
  assert.equal(counts().navigations, 1);
  const state = workspaceInitialState();
  assert.throws(() => workspaceTransition(state, {
    type: 'select',
    selection: {
      kind: 'water',
      id: ''
    }
  }), /Invalid/);
  assert.equal(workspaceInspectorVisible(state), false);
});
test('existing district, water and terrain inspector adapters read source records without changing them', () => {
  const city = {
      districtState: {
        status: 'assigned'
      },
      districts: [{
        id: 'D1',
        name: 'Old Ward',
        blockIds: ['B1']
      }],
      properties: [{
        districtId: 'D1'
      }],
      buildings: [{
        districtId: 'D1'
      }]
    },
    district = {
      editor: {
        selectedDistrictId: 'D1',
        selectedBlockId: 'B1'
      }
    },
    water = {
      editor: {
        dirty: true,
        features: [{
          id: 'L1',
          kind: 'lake',
          path: [1, 2, 3]
        }],
        bridges: []
      }
    },
    terrain = {
      editor: {
        dirty: false,
        features: [{
          id: 'T1',
          name: 'High Ridge',
          path: [1, 2, 3, 4],
          ridge: [{
            height: 100
          }, {
            height: 300
          }, {
            height: 200
          }]
        }],
        passes: []
      }
    };
  const before = JSON.stringify({
      city,
      district,
      water,
      terrain
    }),
    {
      shell
    } = shellHarness();
  registerWorkspaceInspectors(shell, {
    getCity: () => city,
    getDistrictPanel: () => district,
    getWaterPanel: () => water,
    getTerrainPanel: () => terrain
  });
  shell.select({
    kind: 'district',
    id: 'D1'
  });
  assert.equal(shell.descriptor().title, 'Old Ward');
  shell.select({
    kind: 'water',
    id: 'L1'
  });
  assert.match(shell.descriptor().description, /draft/);
  shell.select({
    kind: 'terrain',
    id: 'T1'
  });
  assert.equal(shell.descriptor().title, 'High Ridge');
  assert.equal(JSON.stringify({
    city,
    district,
    water,
    terrain
  }), before);
});


test('per-section tool scroll positions and current selection survive navigation; project reset clears session positions', () => {
  const descriptor = {
    type: 'Lake', title: 'Northmere', section: 'landscape', sections: []
  };
  const { shell, el } = shellHarness({
    water: { resolve: id => id === 'lake' ? descriptor : null }
  });
  const pane = el('workspaceToolScroll');
  pane.scrollTop = 125;
  shell.navigate('landscape');
  assert.equal(pane.scrollTop, 0);
  shell.select({ kind: 'water', id: 'lake' });
  pane.scrollTop = 230;
  shell.navigate('districts');
  assert.equal(pane.scrollTop, 0);
  assert.deepEqual(shell.state.selection, { kind: 'water', id: 'lake' });
  pane.scrollTop = 48;
  shell.navigate('city');
  assert.equal(pane.scrollTop, 125);
  shell.navigate('landscape');
  assert.equal(pane.scrollTop, 230);
  assert.equal(shell.state.selection.id, 'lake');
  shell.navigate('districts');
  assert.equal(pane.scrollTop, 48);
  shell.reset({ section: 'city' });
  assert.equal(pane.scrollTop, 0);
  shell.navigate('landscape');
  assert.equal(pane.scrollTop, 0, 'previous project scroll does not leak into newly opened projects');
});

test('portable workspace shell restores section, panel visibility, inspector pin and scroll without mutating a selection',()=>{
  const {shell,el} = shellHarness({
    water:{resolve:id=>id==='lake'?{title:'Northmere',section:'landscape',type:'Lake',sections:[]}:null}
  });
  shell.navigate('landscape');
  shell.select({kind:'water',id:'lake'});
  shell.dispatch({type:'pin'});
  el('workspaceToolScroll').scrollTop=240;
  el('workspaceInspectorScroll').scrollTop=33;
  shell.navigate('city');
  el('workspaceToolScroll').scrollTop=90;
  shell.dispatch({type:'tools',collapsed:true});
  const stored=shell.snapshot();
  assert.equal(stored.section,'city');
  assert.equal(stored.toolsCollapsed,true);
  assert.equal(stored.inspectorPinned,true);
  assert.equal(stored.sectionScroll.city,90);
  assert.equal(stored.sectionScroll.landscape,240);
  assert.equal(stored.inspectorScroll,33);
  const reference={kind:'water',id:'lake'};
  shell.reset({section:'city',selection:reference,ui:stored});
  assert.equal(shell.state.toolsCollapsed,true);
  assert.equal(shell.state.section,'city');
  assert.equal(shell.state.inspectorPinned,true);
  assert.deepEqual(shell.state.selection,reference);
  assert.equal(el('workspaceToolScroll').scrollTop,90);
  assert.equal(el('workspaceInspectorScroll').scrollTop,33);
  el('workspaceOpenTools').handlers.click();
  shell.navigate('landscape');
  assert.equal(el('workspaceToolScroll').scrollTop,240);
  shell.reset();
  assert.equal(shell.state.section,'city');
  assert.equal(shell.state.inspectorPinned,false);
  assert.equal(el('workspaceToolScroll').scrollTop,0);
});
