import { applyNonallocatingCityIntent } from '../editor/nonallocating-transaction-bridge.js';
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
    drafts,
    getElement,
    getCity,
    commit,
    undoHistory,
    historyAvailable,
    changed,
    activateLayer = () => {}
  }) {
    this.$ = getElement;
    this.drafts = drafts;
    this.getCity = getCity;
    this.commit = commit;
    this.undoHistory = undoHistory;
    this.historyAvailable = historyAvailable ?? (() => this.editor.history.length > 0);
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
    const draft = this.drafts?.sync('defenses', { staged: true, intent: JSON.stringify(this.controls()),
      dirty: preview.pending, issues: preview.invalid ? [{ code: 'defense-settings', message: preview.text,
        target: { controlId: defenseInvalidField(preview.text) } }] : [],
    });
    if (draft) status.setAttribute?.('data-draft-state', draft.status);
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
    this.$('undoFortificationButton').disabled = !this.historyAvailable();
    if (reset) {
      this.$('wallsEnabledInput').checked = state.enabled;
      this.$('gateCountInput').value = String(built ? state.requestedGateCount : 4);
      this.$('towerSpacingInput').value = String(built ? state.towerSpacing : 100);
      this.$('fortificationSeedInput').value = built ? state.seed : city.id;
    }
    this.syncPreview();
  }
  apply() {
    const preview = this.syncPreview();
    if (preview.invalid) { this.message(preview.text, true); return false; }
    return this.drafts ? this.drafts.apply('defenses', current => current() && this.commitDraft(),
      { validateOnApply: true }) : this.commitDraft();
  }
  commitDraft() {
    const previous=this.getCity(),beforeEditor=this.editor.snapshot();
    try {
      const before = previous.fortificationState,
        beforeHistory = this.editor.history.slice(),
        wasUnbuilt = before.status !== 'built',
        intent={kind:'defense-apply',options:this.controls()},
        city = applyNonallocatingCityIntent(previous,intent,this.editor);
      if(this.commit(city, { operation: city.fortificationState.enabled !== before.enabled && !wasUnbuilt
        ? (city.fortificationState.enabled ? 'enable' : 'disable')
        : wasUnbuilt ? 'build' : 'rebuild', beforeHistory,intent })===false)
        throw Error('Defense Apply was refused.');
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
      if(this.getCity()===previous)this.editor.load(beforeEditor);
      this.drafts?.sync('defenses', { staged: true, intent: JSON.stringify(this.controls()), dirty: true,
        issues: [{ code: 'defense-geometry', message: error.message }] });
      this.message(error.message, true);
      return false;
    }
  }
  bind() {
    this.$('applyFortificationButton').addEventListener('click', () => this.apply());
    this.$('undoFortificationButton').addEventListener('click', () => this.undoHistory?.());
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
