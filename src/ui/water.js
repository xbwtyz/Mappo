import {
  prepareWater
} from '../generators/water.js';
import {
  validateWaterDefinition
} from '../core/water-model.js';
import {
  WaterEditor
} from '../editor/water.js';

export class WaterPanel {
  constructor({
    getElement,
    getCity,
    getBoundary,
    getCenter,
    changed,
    activate
  }) {
    this.$ = getElement;
    this.getCity = getCity;
    this.getBoundary = getBoundary;
    this.getCenter = getCenter;
    this.changed = changed;
    this.activate = activate;
    this.editor = new WaterEditor(() => {
      this.refresh();
      this.changed();
    }, (text, error) => this.message(text, error));
  }
  message(text, error = false) {
    if (!error && this.editor?.dirty) {
      try {
        const d = prepareWater(this.editor.definition());
        validateWaterDefinition(d.features, d.bridges, this.getBoundary(), this.getCenter());
      } catch (issue) {
        text = issue.message;
        error = true;
      }
    }
    this.$('waterMessage').textContent = text;
    this.$('waterMessage').classList.toggle('error', Boolean(error));
  }
  refresh(reset = false) {
    const e = this.editor;
    this.$('waterStats').textContent = `${e.features.length?'River':'Dry land'} · ${e.bridges.length} bridges${e.dirty?' · Pending regeneration':''}`;
    this.$('undoWaterButton').disabled = !e.history.length;
    this.$('removeWaterItemButton').disabled = e.selectedPoint < 0 && !e.selectedBridge;
    for (const [id, mode] of [
        ['editRiverButton', 'river'],
        ['editBridgesButton', 'bridge'],
        ['addBridgeButton', 'addbridge']
      ]) {
      this.$(id).disabled = !e.features.length;
      this.$(id).setAttribute('aria-pressed', String(e.mode === mode));
    }
    if (reset) {
      this.$('waterSeedInput').value = e.state.seed;
      this.$('riverWidthInput').value = String(e.features[0]?.width ?? 28);
    }
  }
  run(fn) {
    try {
      fn();
    } catch (error) {
      this.message(error.message, true);
    }
  }
  mode(mode) {
    this.editor.setMode(mode);
    this.activate();
    this.message(mode === 'river' ? 'Drag river points. Double-click the course to add a point. Delete removes a selected interior point.' : mode === 'bridge' ? 'Drag a bridge marker along the river. Delete removes it.' : 'Click near the river to add a bridge, then drag to position it.');
  }
  bind() {
    this.$('generateRiverButton').addEventListener('click', () => this.run(() => {
      this.editor.generate(this.getBoundary(), this.getCenter(), {
        seed: this.$('waterSeedInput').value,
        width: this.$('riverWidthInput').value || 28
      });
      this.activate();
      this.refresh(true);
    }));
    this.$('rerollRiverButton').addEventListener('click', () => this.run(() => {
      this.$('waterSeedInput').value = `river-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      this.$('generateRiverButton').click();
    }));
    for (const [id, mode] of [
        ['editRiverButton', 'river'],
        ['editBridgesButton', 'bridge'],
        ['addBridgeButton', 'addbridge']
      ]) this.$(id).addEventListener('click', () => this.mode(mode));
    this.$('removeWaterItemButton').addEventListener('click', () => this.editor.removePoint());
    this.$('undoWaterButton').addEventListener('click', () => {
      this.editor.undo();
      this.refresh(true);
    });
    this.$('revertWaterButton').addEventListener('click', () => {
      this.editor.revert(this.getCity());
      this.refresh(true);
    });
    this.$('removeRiverButton').addEventListener('click', () => this.editor.clear());
    this.$('riverWidthInput').addEventListener('change', () => this.run(() => this.editor.width(this.$('riverWidthInput').value)));
    for (const id of ['waterSeedInput', 'riverWidthInput']) this.$(id).addEventListener('input', () => this.changed());
  }
}
