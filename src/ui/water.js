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
      coast = e.features[0]?.kind === 'coast';
    this.$('editRiverButton').textContent = coast ? 'Edit shoreline' : 'Edit river points';
    this.$('flipCoastButton').disabled = !coast;
    this.$('riverWidthInput').disabled = coast;
    this.$('waterStats').textContent = `${coast?'Coast':e.features.length?'River':'Dry land'} · ${e.bridges.length} bridges${e.dirty?' · Pending regeneration':''}`;
    this.$('undoWaterButton').disabled = !e.history.length;
    this.$('removeWaterItemButton').disabled = e.selectedPoint < 0 && !e.selectedBridge;
    for (const [id, mode] of [
        ['editRiverButton', 'river'],
        ['editBridgesButton', 'bridge'],
        ['addBridgeButton', 'addbridge']
      ]) {
      this.$(id).disabled = !e.features.length || (coast && mode !== 'river');
      this.$(id).setAttribute('aria-pressed', String(e.mode === mode));
    }
    if (reset) {
      this.$('waterSeedInput').value = e.state.seed;
      this.$('riverWidthInput').value = String(e.features[0]?.width ?? 28);
      if (coast && e.features[0].direction) this.$('coastDirectionInput').value = e.features[0].direction;
      else if (!this.$('coastDirectionInput').value) this.$('coastDirectionInput').value = 'east';
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
    if (mode !== 'river' && this.editor.features[0]?.kind === 'coast') {
      this.message('Coasts have open ocean. Bridge tools are available for rivers.', true);
      return;
    }
    this.editor.setMode(mode);
    this.activate();
    this.message(mode === 'river' ? 'Drag water points. Double-click the shoreline or river to add a point. Delete removes a selected interior point.' : mode === 'bridge' ? 'Drag a bridge marker along the river. Delete removes it.' : 'Click near the river to add a bridge, then drag to position it.');
  }
  bind() {
    this.$('generateCoastButton').addEventListener('click', () => this.run(() => {
      this.editor.generateCoastline(this.getBoundary(), this.getCenter(), {
        seed: this.$('waterSeedInput').value,
        direction: this.$('coastDirectionInput').value || 'east'
      });
      this.activate();
      this.refresh(true);
    }));
    this.$('flipCoastButton').addEventListener('click', () => this.editor.flipCoast());
    this.$('coastDirectionInput').addEventListener('change', () => this.changed());
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
      this.$(this.editor.features[0]?.kind === 'coast' ? 'generateCoastButton' : 'generateRiverButton').click();
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
