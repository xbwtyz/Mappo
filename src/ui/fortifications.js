import {
  FortificationEditor
} from '../editor/fortifications.js';
import {
  normalizeFortificationSettings
} from '../generators/fortifications.js';
import {
  defenseInvalidField
} from '../core/validation-feedback.js';

// Presentation-only: never generate or modify geometry while previewing inputs.
export function describeDefenseUpdate(city, controls) {
  const state = city?.fortificationState;
  if (!state) return { pending: false, invalid: false, text: 'Open a city to configure defenses.' };
  const built = state.status === 'built';
  if (!controls.enabled) {
    if (state.enabled) return {
      pending: true, invalid: false,
      text: 'Update defenses will disable the visible walls. Their saved wall, gate and tower geometry will be retained.'
    };
    return {
      pending: false, invalid: false,
      text: built
        ? 'Walls are disabled. Saved defenses are retained; gate, tower and seed changes apply only after re-enabling walls.'
        : 'No defenses are built. Enable walls to build perimeter defenses.'
    };
  }
  let settings;
  try {
    settings = normalizeFortificationSettings(controls);
  } catch (error) {
    return { pending: true, invalid: true, text: error.message };
  }
  if (!built) return {
    pending: true, invalid: false,
    text: 'Update defenses will build walls, connected gates and towers around the accepted city without rebuilding streets or buildings.'
  };
  const changed = settings.gateCount !== state.requestedGateCount
    || settings.towerSpacing !== state.towerSpacing
    || settings.seed !== state.seed
    || settings.algorithm !== state.algorithm;
  if (changed) return {
    pending: true, invalid: false,
    text: 'Update defenses will regenerate only walls, gates and towers. Streets, buildings, districts, water and mountains remain unchanged.'
  };
  if (!state.enabled) return {
    pending: true, invalid: false,
    text: 'Update defenses will re-enable the saved defenses without regenerating their geometry.'
  };
  return { pending: false, invalid: false, text: 'No defense changes pending. The accepted city and fortifications are unchanged.' };
}

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
  syncPreview() {
    const preview = describeDefenseUpdate(this.getCity(), this.controls());
    const status = this.$('defensePendingMessage');
    status.textContent = preview.text;
    status.classList.toggle('error', preview.invalid);
    status.classList.toggle('pending', preview.pending && !preview.invalid);
    const bad = preview.invalid ? defenseInvalidField(preview.text) : null;
    for (const id of ['gateCountInput', 'towerSpacingInput', 'fortificationSeedInput'])
      this.$(id).setAttribute?.('aria-invalid', String(id === bad));
    return preview;
  }
  message(text, error = false) {
    this.$('fortificationMessage').textContent = text;
    this.$('fortificationMessage').classList.toggle('error', error);
  }
  refresh(reset = false) {
    const city = this.getCity(),
      state = city.fortificationState,
      built = state.status === 'built';
    this.$('fortificationStats').textContent = built
      ? `${state.enabled ? 'Enabled' : 'Disabled · saved'} · ${city.gates.length} gates · ${city.towers.length} towers`
      : 'No perimeter defenses built yet.';
    this.$('undoFortificationButton').disabled = !this.editor.history.length;
    if (reset) {
      this.$('wallsEnabledInput').checked = state.enabled;
      this.$('gateCountInput').value = String(built ? state.requestedGateCount : 4);
      this.$('towerSpacingInput').value = String(built ? state.towerSpacing : 100);
      this.$('fortificationSeedInput').value = built ? state.seed : city.id;
    }
    this.syncPreview();
  }
  apply() {
    try {
      const previous = this.getCity(),
        before = previous.fortificationState,
        wasUnbuilt = before.status !== 'built',
        city = this.editor.apply(previous, this.controls());
      this.commit(city);
      this.refresh();
      if (wasUnbuilt && city.fortificationState.status === 'built') this.activateLayer();
      const state = city.fortificationState;
      this.message(city === previous
        ? (wasUnbuilt ? 'No defenses are built. Enable walls to create them.' : 'No defense changes were applied.')
        : !state.enabled
          ? 'Walls disabled. Existing walls, gates and towers remain saved.'
          : !before.enabled && !wasUnbuilt && state.gateCount === before.gateCount
            && state.requestedGateCount === before.requestedGateCount && state.seed === before.seed
            && state.towerSpacing === before.towerSpacing
              ? 'Saved walls re-enabled without rebuilding their geometry.'
              : state.gateCount < state.requestedGateCount
                ? `Built ${state.gateCount} of ${state.requestedGateCount} requested gates; remaining locations lacked safe clearance. The city layout was preserved.`
                : 'Defenses updated. Streets, buildings, districts and landscape were preserved.');
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
      this.$(id).addEventListener('input', () => {
        this.syncPreview();
        this.changed();
      });
      this.$(id).addEventListener('change', () => {
        this.syncPreview();
        this.changed();
      });
    }
  }
}
