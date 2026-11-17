import {
  LAKE_LIMIT
} from '../core/lake-geometry.js';
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
    validateComposition = () => {},
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
    }, (text, error) => this.message(text, error), () => {
      try {
        return this.getBoundary();
      } catch {
        return this.getCity()?.survey.boundary ?? [];
      }
    }, validateComposition);
  }
  message(text, error = false) {
    if (!error && this.editor?.dirty) {
      try {
        const d = prepareWater(this.editor.definition());
        validateWaterDefinition(d.features, d.bridges, this.getBoundary(), this.getCenter());
        this.editor.validateComposition(d);
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
    const lakes = e.features.filter(f => f.kind === 'lake');
    const select = this.$('lakeSelect');
    select.replaceChildren(...(lakes.length ? lakes.map(f => {
      const option = document.createElement('option');
      option.value = f.id;
      option.textContent = f.name || f.id;
      return option;
    }) : [(() => {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No lakes yet';
      return option;
    })()]));
    select.value = lakes.some(f => f.id === e.activeWaterId) ? e.activeWaterId : (lakes.some(f => f.id === this.selectedLakeId) ? this.selectedLakeId : lakes[0]?.id ?? '');
    this.selectedLakeId = select.value;
    for (const id of ['editLakeButton', 'moveLakeButton', 'regenerateLakeButton', 'removeLakeButton']) this.$(id).disabled = !lakes.length;
    this.$('addLakeButton').disabled = lakes.length >= LAKE_LIMIT;
    this.$('editLakeButton').setAttribute('aria-pressed', String(e.mode === 'river' && e.activeFeature()?.kind === 'lake'));
    this.$('moveLakeButton').setAttribute('aria-pressed', String(e.mode === 'lake-move'));
    this.$('waterStats').textContent = `${river&&coast?'River + coast':river?'River':coast?'Coast':lakes.length?'Inland lakes':'Dry land'} · ${e.bridges.length} bridges · ${lakes.length}/${LAKE_LIMIT} lakes${e.dirty?' · Pending regeneration':''}`;
    this.$('undoWaterButton').disabled = !e.history.length;
    this.$('removeWaterItemButton').disabled = e.selectedPoint < 0 && !e.selectedBridge;
    this.$('editRiverButton').disabled = !river;
    this.$('tidyRiverButton').disabled = !river;
    this.$('tidyCoastButton').disabled = !coast;
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
      const lake = lakes.find(f => f.id === this.selectedLakeId);
      this.$('lakeSeedInput').value = lake?.generation?.seed ?? 'lake';
      this.$('lakeRadiusInput').value = String(lake?.generation?.radius ?? 28);
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
    this.$('lakeSelect').addEventListener('change', () => {
      this.selectedLakeId = this.$('lakeSelect').value;
      if (this.editor.selectFeature(this.selectedLakeId)) {
        this.editor.setMode('river');
        this.activate();
        this.refresh(true);
      }
    });
    for (const [id, regenerate] of [
        ['addLakeButton', false],
        ['regenerateLakeButton', true]
      ]) this.$(id).addEventListener('click', () => this.run(() => {
      this.editor.generateLakeDraft(this.getBoundary(), this.getCenter(), {
        seed: this.$('lakeSeedInput').value,
        radius: this.$('lakeRadiusInput').value
      }, regenerate ? this.selectedLakeId : null);
      this.activate();
      this.refresh();
    }));
    for (const [id, mode] of [
        ['editLakeButton', 'river'],
        ['moveLakeButton', 'lake-move']
      ]) this.$(id).addEventListener('click', () => {
      if (!this.editor.selectFeature(this.selectedLakeId)) return;
      this.editor.setMode(mode);
      this.activate();
      this.message(mode === 'river' ? 'Drag lake shoreline handles. Double-click any shore edge to add a handle; Delete removes a selected handle. Sharp edits self-adjust.' : 'Drag the center marker to move the whole lake. Its banks stay inside the city outline.');
    });
    this.$('removeLakeButton').addEventListener('click', () => this.editor.removeFeature(this.selectedLakeId));
    for (const id of ['lakeSeedInput', 'lakeRadiusInput']) this.$(id).addEventListener('input', () => this.changed());
    this.$('tidyCoastButton').addEventListener('click', () => this.run(() => {
      if (!this.editor.selectFeature('coast')) return;
      this.editor.setMode('river');
      this.editor.tidyCoast(this.getBoundary());
      this.activate();
    }));
    this.$('tidyRiverButton').addEventListener('click', () => this.run(() => {
      if (!this.editor.selectFeature('river')) return;
      this.editor.setMode('river');
      this.editor.tidyRiver(this.getBoundary());
      this.activate();
    }));
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
