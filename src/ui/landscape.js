import {
  LAKE_LIMIT
} from '../core/lake-geometry.js';
import {
  TERRAIN_LIMIT
} from '../core/terrain-geometry.js';
import {
  landscapeRecords,
  landscapeLabel,
  hitLandscape
} from '../core/landscape-selection.js';

const LANDSCAPE_FIELDS = {
  river: ['waterSeedInput', 'riverWidthInput'],
  coast: ['coastSeedInput', 'coastDirectionInput'],
  lake: ['lakeSeedInput', 'lakeRadiusInput'],
  terrain: ['terrainSeedInput', 'terrainSizeInput', 'terrainHeightInput', 'terrainPlacementInput']
};
export class LandscapeWorkspace {
  constructor({
    getElement,
    document = globalThis.document,
    shell,
    water,
    terrain,
    stopTools,
    onSelect = () => {},
    changed = () => {},
    draw = () => {}
  }) {
    this.$ = getElement;
    this.document = document;
    this.shell = shell;
    this.water = water;
    this.terrain = terrain;
    this.stopTools = stopTools;
    this.onSelect = onSelect;
    this.changed = changed;
    this.draw = draw;
    this.filter = 'all';
    this.hover = null;
    this.rows = new Map();
    this.controlCache = new Map();
    this.context = null;
    this.selecting = false;
    this.restoring = false;
    this.historyLengths = {
      water: water.editor.history.length,
      terrain: terrain.editor.history.length
    };
    shell.registerInspector('landscape-add', {
      resolve: id => LANDSCAPE_FIELDS[id] ? {
        type: 'Add landscape feature',
        title: 'New feature',
        sections: []
      } : null
    });
  }
  records() {
    return landscapeRecords(this.water.editor.features, this.terrain.editor.features);
  }
  record(ref) {
    return this.records().find(r => r.kind === ref?.kind && r.id === ref?.id);
  }
  refKey(ref) {
    return ref ? `${ref.kind}:${ref.id}` : '';
  }
  type(ref) {
    return ref?.kind === 'landscape-add' ? ref.id : ref?.kind === 'terrain' ? 'terrain' : this.record(ref)?.feature.kind ?? null;
  }
  available(type) {
    if (!LANDSCAPE_FIELDS[type]) return false;
    return type === 'terrain' ? this.terrain.editor.features.length < TERRAIN_LIMIT : type === 'lake' ? this.water.editor.features.filter(f => f.kind === 'lake').length < LAKE_LIMIT : !this.water.editor.features.some(f => f.kind === type);
  }
  stash() {
    if (!this.context) return;
    // Removal notifies after deleting the record; retain the mounted form's
    // pending values so undo can bring that same feature back intact.
    const type = this.type(this.context) ?? this.contextType;
    if (LANDSCAPE_FIELDS[type]) this.controlCache.set(this.refKey(this.context), Object.fromEntries(LANDSCAPE_FIELDS[type].map(id => [id, this.$(id).value])));
  }
  loadControls(ref) {
    const record = this.record(ref),
      f = record?.feature,
      type = this.type(ref);
    const defaults = type === 'river' ? {
      waterSeedInput: f?.generation?.seed ?? 'river',
      riverWidthInput: f?.width ?? 28
    } : type === 'coast' ? {
      coastSeedInput: f?.generation?.seed ?? 'coast',
      coastDirectionInput: f?.direction ?? 'east'
    } : type === 'lake' ? {
      lakeSeedInput: f?.generation?.seed ?? 'lake',
      lakeRadiusInput: f?.generation?.radius ?? 28
    } : {
      terrainSeedInput: f?.generation?.seed ?? 'mountains',
      terrainSizeInput: f?.generation?.size ?? 70,
      terrainHeightInput: f ? Math.max(...f.ridge.map(p => p.height)) : 900,
      terrainPlacementInput: f?.generation?.placement ?? 'surrounding'
    };
    for (const [id, value] of Object.entries({
        ...defaults,
        ...this.controlCache.get(this.refKey(ref))
      })) this.$(id).value = String(value);
    this.context = ref;
    this.contextType = type;
  }
  select(ref, {
    fromMap = false
  } = {}) {
    const record = this.record(ref);
    if (!record) return false;
    this.stash();
    this.selecting = true;
    try {
      this.stopTools();
      this.onSelect();
      if (record.kind === 'water') {
        this.water.editor.selectFeature(record.id);
        if (record.feature.kind === 'lake') this.water.selectedLakeId = record.id;
        this.water.refresh();
      } else {
        this.terrain.editor.select(record.id);
        this.terrain.refresh();
      }
      this.loadControls(ref);
      if ((this.filter === 'water' && ref.kind !== 'water') || (this.filter === 'mountains' && ref.kind !== 'terrain')) this.filter = 'all';
      this.shell.navigate('landscape');
      this.shell.select(ref);
      this.setHover(null);
      this.draw();
      this.changed();
      if (fromMap) this.rows.get(this.refKey(ref))?.button.scrollIntoView?.({
        block: 'nearest'
      });
      return true;
    } finally {
      this.selecting = false;
    }
  }
  beginAdd(type = null) {
    const choice = type && this.available(type) ? type : Object.keys(LANDSCAPE_FIELDS).find(t => this.available(t) && (this.filter === 'mountains' ? t === 'terrain' : this.filter === 'water' ? t !== 'terrain' : true)) ?? Object.keys(LANDSCAPE_FIELDS).find(t => this.available(t));
    if (!choice) return;
    this.stash();
    this.selecting = true;
    try {
      this.stopTools();
      this.onSelect();
      this.shell.navigate('landscape');
      const ref = {
        kind: 'landscape-add',
        id: choice
      };
      this.loadControls(ref);
      this.shell.select(ref);
      this.setHover(null);
      this.$('landscapeTypeInput').focus?.();
    } finally {
      this.selecting = false;
    }
  }
  editorChanged(kind) {
    if (this.selecting || this.restoring) return;
    const selection = this.shell.state.selection,
      editor = kind === 'water' ? this.water.editor : this.terrain.editor;
    const undoing = editor.history.length < this.historyLengths[kind];
    this.historyLengths[kind] = editor.history.length;
    if (selection?.kind === kind && !this.record(selection)) {
      this.stash();
      this.context = null;
      this.selecting = true;
      editor.setMode('pan');
      this.selecting = false;
      this.shell.select(null, {
        reveal: false
      });
      this.$('landscapeAddButton').focus?.();
    } else if (undoing && selection?.kind === kind && this.record(selection)) {
      if (kind === 'water') {
        editor.selectFeature(selection.id);
        this.water.refresh();
      } else {
        editor.select(selection.id);
        this.terrain.refresh();
      }
    } else if (editor.mode !== 'pan' && editor.activeFeature()) {
      this.onSelect();
      const ref = {
        kind,
        id: editor.activeFeature().id
      };
      if (this.refKey(ref) !== this.refKey(selection)) {
        this.stash();
        this.context = ref;
        this.contextType = this.type(ref);
      }
      if ((this.filter === 'water' && kind !== 'water') || (this.filter === 'mountains' && kind !== 'terrain')) this.filter = 'all';
      this.shell.select(ref, {
        reveal: false
      });
      if (selection?.kind === 'landscape-add') {
        const button = kind === 'terrain' ? 'editTerrainButton' : editor.activeFeature().kind === 'lake' ? 'editLakeButton' : editor.activeFeature().kind === 'coast' ? 'editCoastButton' : 'editRiverButton';
        this.$(button).focus?.();
      }
    }
    this.render();
    this.setHover(null);
  }
  setHover(ref) {
    if (this.refKey(ref) === this.refKey(this.hover)) return;
    this.hover = ref;
    this.renderList();
    this.draw();
  }
  hit(point, zoom) {
    return hitLandscape(point, this.records(), zoom);
  }
  snapshotUI() {
    this.stash();
    return {
      filter: this.filter,
      formCache: [...this.controlCache].slice(0, 80).map(([key, controls]) => ({
        key, controls: { ...controls }
      }))
    };
  }
  restoreUI(saved) {
    this.reset();
    this.filter = saved?.filter ?? 'all';
    for (const entry of saved?.formCache ?? [])
      this.controlCache.set(entry.key, { ...entry.controls });
  }
  reset() {
    this.filter = 'all';
    this.controlCache.clear();
    this.context = null;
    this.hover = null;
    this.restoring = false;
    this.historyLengths = {
      water: this.water.editor.history.length,
      terrain: this.terrain.editor.history.length
    };
  }
  renderList() {
    const records = this.records(),
      visible = records.filter(r => this.filter === 'all' || (this.filter === 'water' ? r.kind === 'water' : r.kind === 'terrain'));
    for (const record of records) {
      const key = this.refKey(record);
      if (!this.rows.has(key)) {
        const item = this.document.createElement('li'),
          button = this.document.createElement('button');
        button.className = 'landscape-feature-button';
        button.type = 'button';
        button.addEventListener('click', () => this.select({
          kind: record.kind,
          id: record.id
        }));
        button.addEventListener('pointerenter', () => this.setHover({
          kind: record.kind,
          id: record.id
        }));
        button.addEventListener('pointerleave', () => this.setHover(null));
        item.replaceChildren(button);
        this.rows.set(key, {
          item,
          button
        });
      }
      const row = this.rows.get(key),
        label = landscapeLabel(record),
        pending = record.kind === 'water' ? this.water.editor.dirty : this.terrain.editor.dirty;
      row.button.textContent = `${label.name}\n${label.name === label.type ? (pending ? 'Draft' : 'Saved geometry') : label.type + (pending ? ' · Draft' : '')}`;
      row.button.setAttribute('aria-pressed', String(key === this.refKey(this.shell.state.selection)));
      row.button.classList.toggle('is-hovered', key === this.refKey(this.hover));
    }
    for (const key of this.rows.keys())
      if (!records.some(r => this.refKey(r) === key)) this.rows.delete(key);
    const signature = visible.map(r => this.refKey(r)).join('|');
    if (signature !== this.listSignature) {
      this.$('landscapeFeatureList').replaceChildren(...visible.map(r => this.rows.get(this.refKey(r)).item));
      this.listSignature = signature;
    }
    this.$('landscapeFeatureCount').textContent = `${records.length} ${records.length === 1 ? 'feature' : 'features'}`;
    this.$('landscapeEmpty').hidden = visible.length > 0;
    this.$('landscapeEmpty').textContent = records.length ? 'No features match this filter.' : 'Add a river, coastline, lake or mountain range.';
    for (const filter of ['all', 'water', 'mountains']) this.$(`landscapeFilter-${filter}`).setAttribute('aria-pressed', String(this.filter === filter));
    this.$('landscapeAddButton').disabled = !Object.keys(LANDSCAPE_FIELDS).some(t => this.available(t));
  }
  render() {
    if (this.restoring) return;
    this.renderList();
    const selection = this.shell.state.selection,
      record = this.record(selection),
      creating = selection?.kind === 'landscape-add',
      type = this.type(selection);
    const key = this.refKey(selection);
    if (key !== this.inspectorKey) {
      this.$('workspaceInspectorScroll').scrollTop = 0;
      this.inspectorKey = key;
    }
    const visible = Boolean(record || creating);
    this.$('landscapeInspectorControls').hidden = !visible;
    if (!visible) {
      this.stash();
      this.context = null;
      return;
    }
    if (!this.context) {
      this.context = selection;
      this.contextType = type;
    }
    const pending = [this.water.editor.dirty && 'water', this.terrain.editor.dirty && 'terrain'].filter(Boolean);
    const draftStatus = this.$('landscapeDraftStatus');
    const message = pending.length
      ? `Draft changes to ${pending.join(' and ')}. Rebuild city to apply.`
      : 'Changes here create a draft. Rebuild city to apply it.';
    if (draftStatus.textContent !== message) draftStatus.textContent = message;
    this.$('landscapeReviewRebuild').hidden = !pending.length;
    this.$('landscapeCreationType').hidden = !creating;
    this.$('landscapeTypeInput').value = creating ? type : 'lake';
    for (const option of Array.from(this.$('landscapeTypeInput').options ?? [])) option.disabled = !this.available(option.value);
    this.$('landscapeCreationHelp').textContent = `One river, one coastline, up to ${LAKE_LIMIT} lakes and ${TERRAIN_LIMIT} ranges. Existing features stay intact.`;
    this.$('waterPanel').hidden = type === 'terrain';
    this.$('terrainPanel').hidden = type !== 'terrain';
    if (type === 'terrain') this.$('terrainPanel').open = true;
    else this.$('waterPanel').open = true;
    for (const [kind, id] of [
        ['river', 'landscapeRiverControls'],
        ['coast', 'landscapeCoastControls'],
        ['lake', 'landscapeLakeControls']
      ]) this.$(id).hidden = type !== kind;
    for (const id of ['editRiverButton', 'tidyRiverButton', 'removeRiverButton', 'editBridgesButton', 'addBridgeButton', 'editCoastButton', 'flipCoastButton', 'tidyCoastButton', 'removeCoastButton', 'editLakeButton', 'moveLakeButton', 'removeLakeButton', 'regenerateLakeButton', 'editTerrainButton', 'moveTerrainButton', 'editRidgeButton', 'removeTerrainButton', 'editPassButton', 'addPassButton', 'regenerateTerrainButton', 'removeTerrainItemButton']) this.$(id).hidden = creating;
    this.$('landscapeWaterShared').hidden = creating;
    this.$('addLakeButton').hidden = !creating;
    this.$('addTerrainButton').hidden = !creating;
    this.$('generateRiverButton').textContent = creating ? 'Create river' : 'Regenerate river';
    this.$('generateCoastButton').textContent = creating ? 'Create coastline' : 'Regenerate coastline';
    this.$('addLakeButton').textContent = 'Create lake';
    this.$('addTerrainButton').textContent = 'Create mountain range';
    // Errors must remain visible while a new feature proposal is being validated.
    this.$('waterMessage').hidden = false;
  }
  bind() {
    this.$('landscapeReviewRebuild').addEventListener('click', () => {
      if (globalThis.window?.matchMedia?.('(max-width: 900px)').matches)
        this.shell.dispatch({ type: 'inspector', collapsed: true });
      if (this.shell.state.toolsCollapsed) this.shell.dispatch({ type: 'tools', collapsed: false });
      this.$('workspaceRebuildGuide').open = true;
      this.$('generateButton').focus();
    });
    for (const filter of ['all', 'water', 'mountains']) this.$(`landscapeFilter-${filter}`).addEventListener('click', () => {
      this.filter = filter;
      this.renderList();
    });
    this.$('landscapeAddButton').addEventListener('click', () => this.beginAdd());
    this.$('landscapeTypeInput').addEventListener('change', () => this.beginAdd(this.$('landscapeTypeInput').value));
    this.render();
  }
}
