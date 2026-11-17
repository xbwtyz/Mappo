import {
  FortificationEditor
} from '../editor/fortifications.js';

export class FortificationPanel {
  constructor({
    getElement,
    getCity,
    commit,
    changed,
    activateLayer = () => {}
  }) {
    this.$ = getElement;
    this.getCity = getCity;
    this.commit = commit;
    this.changed = changed;
    this.activateLayer = activateLayer;
    this.editor = new FortificationEditor();
  }
  controls() {
    return {
      enabled: this.$('wallsEnabledInput').checked,
      gateCount: this.$('gateCountInput').value,
      towerSpacing: this.$('towerSpacingInput').value,
      seed: this.$('fortificationSeedInput').value
    };
  }
  message(text, error = false) {
    this.$('fortificationMessage').textContent = text;
    this.$('fortificationMessage').classList.toggle('error', error);
  }
  refresh(reset = false) {
    const city = this.getCity(),
      state = city.fortificationState,
      built = state.status === 'built';
    this.$('fortificationStats').textContent = built ? `${state.enabled?'Enabled':'Disabled'} · ${city.gates.length} gates · ${city.towers.length} towers` : 'No fortifications yet. Enable walls and apply to add them.';
    this.$('undoFortificationButton').disabled = !this.editor.history.length;
    if (reset) {
      this.$('wallsEnabledInput').checked = state.enabled;
      this.$('gateCountInput').value = String(built ? state.requestedGateCount : 4);
      this.$('towerSpacingInput').value = String(built ? state.towerSpacing : 100);
      this.$('fortificationSeedInput').value = built ? state.seed : city.id;
    }
  }
  apply() {
    try {
      const wasUnbuilt = this.getCity().fortificationState.status !== 'built',
        city = this.editor.apply(this.getCity(), this.controls());
      this.commit(city);
      this.refresh();
      if (wasUnbuilt && city.fortificationState.status === 'built') this.activateLayer();
      const state = city.fortificationState;
      this.message(state.enabled ? (state.gateCount < state.requestedGateCount ? `Built ${state.gateCount} of ${state.requestedGateCount} requested gates; other locations did not have enough safe clearance.` : 'Fortifications updated. Existing city geometry was preserved.') : 'Walls disabled. Saved walls, gates and towers are retained.');
      return true;
    } catch (error) {
      this.message(error.message, true);
      return false;
    }
  }
  bind() {
    this.$('applyFortificationButton').addEventListener('click', () => this.apply());
    this.$('undoFortificationButton').addEventListener('click', () => {
      try {
        this.commit(this.editor.undo(this.getCity()));
        this.refresh(true);
        this.message('Fortification edit undone.');
        return true;
      } catch (error) {
        this.message(error.message, true);
        return false;
      }
    });
    for (const id of ['wallsEnabledInput', 'gateCountInput', 'towerSpacingInput', 'fortificationSeedInput']) {
      this.$(id).addEventListener('input', () => this.changed());
      this.$(id).addEventListener('change', () => this.changed());
    }
  }
}
