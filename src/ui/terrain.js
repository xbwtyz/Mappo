import {
  TerrainEditor
} from '../editor/terrain.js';
import {
  terrainPrepare,
  TERRAIN_LIMIT
} from '../core/terrain-geometry.js';
import {
  validateTerrainDefinition
} from '../core/terrain-model.js';
export class TerrainPanel {
  constructor({
    getElement,
    getCity,
    getBoundary,
    getCenter,
    getWater,
    changed,
    activate
  }) {
    this.$ = getElement;
    this.getCity = getCity;
    this.getBoundary = getBoundary;
    this.getCenter = getCenter;
    this.getWater = getWater;
    this.changed = changed;
    this.activate = activate;
    this.editor = new TerrainEditor(() => {
      this.refresh();
      changed();
    }, (text, error) => this.message(text, error));
  }
  message(text, error = false) {
    if (!error && this.editor.dirty) try {
      const t = terrainPrepare(this.editor.definition());
      validateTerrainDefinition(t.features, t.passes, this.getBoundary(), this.getCenter(), this.getWater());
    } catch (e) {
      text = e.message;
      error = true;
    }
    this.$('terrainMessage').textContent = text;
    this.$('terrainMessage').classList.toggle('error', Boolean(error));
  }
  run(fn) {
    try {
      return fn();
    } catch (e) {
      this.message(e.message, true);
      return false;
    }
  }
  controls() {
    return {
      seed: String(this.$('terrainSeedInput').value),
      size: String(this.$('terrainSizeInput').value),
      height: String(this.$('terrainHeightInput').value),
      placement: this.$('terrainPlacementInput').value || 'surrounding'
    };
  }
  refresh(reset = false) {
    const e = this.editor,
      f = e.activeFeature(),
      select = this.$('terrainSelect');
    select.replaceChildren(...(e.features.length ? e.features : [{
      id: '',
      name: 'No mountain ranges yet'
    }]).map(f => {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.name;
      return o;
    }));
    select.value = f?.id ?? '';
    this.$('terrainStats').textContent = `${e.features.length}/${TERRAIN_LIMIT} ranges · ${e.passes.length} passes${e.dirty?' · Pending regeneration':''}`;
    this.$('addTerrainButton').disabled = e.features.length >= TERRAIN_LIMIT;
    this.$('undoTerrainButton').disabled = !e.history.length;
    this.$('removeTerrainItemButton').disabled = e.selectedPoint < 0 && !e.selectedPass;
    for (const [id, mode] of [
        ['editTerrainButton', 'shape'],
        ['editRidgeButton', 'ridge'],
        ['moveTerrainButton', 'move'],
        ['editPassButton', 'pass'],
        ['addPassButton', 'addpass']
      ]) {
      this.$(id).disabled = !f;
      this.$(id).setAttribute('aria-pressed', String(e.mode === mode));
    }
    for (const id of ['regenerateTerrainButton', 'removeTerrainButton']) this.$(id).disabled = !f;
    if (reset) {
      this.$('terrainSeedInput').value = f?.generation?.seed ?? 'mountains';
      this.$('terrainSizeInput').value = String(f?.generation?.size ?? 70);
      this.$('terrainPlacementInput').value = f?.generation?.placement ?? 'surrounding';
      this.$('terrainHeightInput').value = String(f ? Math.max(...f.ridge.map(p => p.height)) : 900);
    }
    const selection = e.mode === 'ridge' && e.selectedPoint >= 0 ? `${e.activeTerrainId}:${e.selectedPoint}` : null;
    if (selection && selection !== this.peakSelection) this.$('terrainHeightInput').value = String(f.ridge[e.selectedPoint].height);
    this.peakSelection = selection;
  }
  bind() {
    this.$('terrainSelect').addEventListener('change', () => {
      if (this.editor.select(this.$('terrainSelect').value)) {
        this.editor.setMode('shape');
        this.activate();
        this.refresh(true);
      }
    });
    for (const [id, target] of [
        ['addTerrainButton', false],
        ['regenerateTerrainButton', true]
      ]) this.$(id).addEventListener('click', () => this.run(() => {
      const c = this.controls();
      this.editor.generate(this.getBoundary(), this.getCenter(), {
        ...c,
        water: this.getWater()
      }, target ? this.editor.activeTerrainId : null);
      this.activate();
    }));
    for (const [id, mode] of [
        ['editTerrainButton', 'shape'],
        ['editRidgeButton', 'ridge'],
        ['moveTerrainButton', 'move'],
        ['editPassButton', 'pass'],
        ['addPassButton', 'addpass']
      ]) this.$(id).addEventListener('click', () => {
      this.editor.setMode(mode);
      this.activate();
      this.message(mode === 'shape' ? 'Drag foothill handles. Double-click an edge to add a handle; Delete removes the selection. Sharp edits self-adjust.' : mode === 'ridge' ? 'Drag a ridge or peak handle. Peak height changes the selected handle.' : mode === 'move' ? 'Drag the center marker to move this entire mountain range.' : mode === 'pass' ? 'Drag a pass marker along the ridge. Both foothills must stay inside the city.' : 'Click near the ridge to add a road pass.');
    });
    this.$('removeTerrainButton').addEventListener('click', () => this.editor.remove());
    this.$('undoTerrainButton').addEventListener('click', () => {
      this.editor.undo();
      this.refresh(true);
    });
    this.$('revertTerrainButton').addEventListener('click', () => {
      this.editor.revert(this.getCity());
      this.refresh(true);
    });
    this.$('removeTerrainItemButton').addEventListener('click', () => this.editor.removePoint());
    for (const id of ['terrainSeedInput', 'terrainSizeInput', 'terrainHeightInput', 'terrainPlacementInput']) this.$(id).addEventListener('input', () => this.changed());
    this.$('terrainHeightInput').addEventListener('change', () => this.run(() => this.editor.height(this.$('terrainHeightInput').value)));
  }
}
