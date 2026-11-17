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
    const e = this.editor,
      river = e.features.find(f => f.kind === 'river'),
      coast = e.features.find(f => f.kind === 'coast');
    this.$('waterStats').textContent = `${river&&coast?'River + coast':river?'River':coast?'Coast':'Dry land'} · ${e.bridges.length} bridges${e.dirty?' · Pending regeneration':''}`;
    this.$('undoWaterButton').disabled = !e.history.length;
    this.$('removeWaterItemButton').disabled = e.selectedPoint < 0 && !e.selectedBridge;
    this.$('editRiverButton').disabled = !river;
    this.$('editCoastButton').disabled = !coast;
    this.$('flipCoastButton').disabled = !coast;
    this.$('removeRiverButton').disabled = !river;
    this.$('removeCoastButton').disabled = !coast;
    for (const [id, mode, kind] of [
        ['editRiverButton', 'river', 'river'],
        ['editCoastButton', 'river', 'coast'],
        ['editBridgesButton', 'bridge', 'river'],
        ['addBridgeButton', 'addbridge', 'river']
      ]) {
      this.$(id).disabled = !e.features.some(f => f.kind === kind);
      this.$(id).setAttribute('aria-pressed', String(e.mode === mode && e.activeFeature()?.kind === kind));
    }
    if (reset) {
      this.$('waterSeedInput').value = river?.generation?.seed ?? (river && e.features.length === 1 ? e.state.seed : this.$('waterSeedInput').value || 'river');
      this.$('coastSeedInput').value = coast?.generation?.seed ?? (coast && e.features.length === 1 ? e.state.seed : this.$('coastSeedInput').value || 'coast');
      this.$('riverWidthInput').value = String(river?.width ?? (this.$('riverWidthInput').value || 28));
      if (coast?.direction && ['north', 'east', 'south', 'west'].includes(coast.direction)) this.$('coastDirectionInput').value = coast.direction;
      else if (!this.$('coastDirectionInput').value) this.$('coastDirectionInput').value = 'east';
    }
  }
  run(fn) {
    try {
      return fn();
    } catch (error) {
      this.message(error.message, true);
      return false;
    }
  }
  mode(mode, kind = 'river') {
    if (!this.editor.selectFeature(kind)) return;
    this.editor.setMode(mode);
    this.activate();
    this.message(mode === 'river' ? `Drag ${kind==='coast'?'shoreline':'river'} points. Double-click to add; Delete removes a selected interior point.` : mode === 'bridge' ? 'Drag a bridge marker along the river. Keep both banks out of the ocean.' : 'Click near the river to add a bridge.');
  }
  bind() {
    this.$('generateRiverButton').addEventListener('click', () => this.run(() => {
      this.editor.generate(this.getBoundary(), this.getCenter(), {
        seed: this.$('waterSeedInput').value,
        width: this.$('riverWidthInput').value || 28
      });
      this.activate();
      this.refresh();
    }));
    this.$('generateCoastButton').addEventListener('click', () => this.run(() => {
      this.editor.generateCoastline(this.getBoundary(), this.getCenter(), {
        seed: this.$('coastSeedInput').value,
        direction: this.$('coastDirectionInput').value || 'east'
      });
      this.activate();
      this.refresh();
    }));
    for (const [id, seedInput, generate] of [
        ['rerollRiverButton', 'waterSeedInput', 'generateRiverButton'],
        ['rerollCoastButton', 'coastSeedInput', 'generateCoastButton']
      ]) this.$(id).addEventListener('click', () => {
      this.$(seedInput).value = `water-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      this.$(generate).click();
    });
    for (const [id, mode, kind] of [
        ['editRiverButton', 'river', 'river'],
        ['editCoastButton', 'river', 'coast'],
        ['editBridgesButton', 'bridge', 'river'],
        ['addBridgeButton', 'addbridge', 'river']
      ]) this.$(id).addEventListener('click', () => this.mode(mode, kind));
    this.$('flipCoastButton').addEventListener('click', () => this.run(() => this.editor.flipCoast()));
    this.$('removeRiverButton').addEventListener('click', () => this.editor.removeFeature('river'));
    this.$('removeCoastButton').addEventListener('click', () => this.editor.removeFeature('coast'));
    this.$('removeWaterItemButton').addEventListener('click', () => this.editor.removePoint());
    this.$('undoWaterButton').addEventListener('click', () => {
      this.editor.undo();
      this.refresh(true);
    });
    this.$('revertWaterButton').addEventListener('click', () => {
      this.editor.revert(this.getCity());
      this.refresh(true);
    });
    this.$('riverWidthInput').addEventListener('change', () => this.run(() => {
      if (this.editor.features.some(f => f.kind === 'river')) this.editor.width(this.$('riverWidthInput').value);
      else this.changed();
    }));
    for (const id of ['waterSeedInput', 'coastSeedInput', 'riverWidthInput', 'coastDirectionInput']) this.$(id).addEventListener('input', () => this.changed());
    this.$('coastDirectionInput').addEventListener('change', () => this.changed());
  }
}
