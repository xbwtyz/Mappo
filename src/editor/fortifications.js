import {
  generateFortifications,
  normalizeFortificationSettings
} from '../generators/fortifications.js';
import {
  validateFortifications,
  setFortificationsEnabled
} from '../core/fortification-model.js';

export const FORTIFICATION_HISTORY_LIMIT = 10;
export function fortificationSnapshot(city) {
  return JSON.parse(JSON.stringify({
    walls: city.walls,
    gates: city.gates,
    towers: city.towers,
    fortificationState: city.fortificationState
  }));
}
export function restoreFortificationSnapshot(city, snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.walls) || !Array.isArray(snapshot.gates) || !Array.isArray(snapshot.towers) || !snapshot.fortificationState) throw new Error('Invalid fortification undo snapshot.');
  const next = {
    ...city,
    walls: JSON.parse(JSON.stringify(snapshot.walls)),
    gates: JSON.parse(JSON.stringify(snapshot.gates)),
    towers: JSON.parse(JSON.stringify(snapshot.towers)),
    fortificationState: JSON.parse(JSON.stringify(snapshot.fortificationState))
  };
  validateFortifications(next);
  return next;
}
export class FortificationEditor {
  constructor() {
    this.history = [];
  }
  apply(city, options = {}) {
    if (options.enabled === false) {
      const next = setFortificationsEnabled(city, false);
      if (next !== city) {
        this.history.push(fortificationSnapshot(city));
        if (this.history.length > FORTIFICATION_HISTORY_LIMIT) this.history.shift();
      }
      return next;
    }
    const settings = normalizeFortificationSettings(options),
      state = city.fortificationState;
    const same = state.status === 'built' && settings.gateCount === state.requestedGateCount && settings.towerSpacing === state.towerSpacing && settings.seed === state.seed && settings.algorithm === state.algorithm;
    const next = !settings.enabled || same ? setFortificationsEnabled(city, settings.enabled) : generateFortifications(city, settings);
    if (next !== city) {
      this.history.push(fortificationSnapshot(city));
      if (this.history.length > FORTIFICATION_HISTORY_LIMIT) this.history.shift();
    }
    return next;
  }
  undo(city) {
    if (!this.history.length) throw new Error('No fortification edit to undo.');
    const next = restoreFortificationSnapshot(city, this.history.at(-1));
    this.history.pop();
    return next;
  }
  snapshot() {
    return JSON.parse(JSON.stringify({
      history: this.history
    }));
  }
  load(state = {}) {
    this.history = JSON.parse(JSON.stringify(state.history ?? []));
  }
}
export function validateFortificationEditorState(state, city) {
  if (state === undefined) return;
  if (!state || typeof state !== 'object' || !Array.isArray(state.history) || state.history.length > FORTIFICATION_HISTORY_LIMIT) throw new Error('Invalid fortification undo history.');
  for (const snapshot of state.history) restoreFortificationSnapshot(city, snapshot);
  if (state.controls !== undefined) {
    const c = state.controls;
    if (!c || typeof c.enabled !== 'boolean' || typeof c.gateCount !== 'string' || c.gateCount.length > 4 || typeof c.towerSpacing !== 'string' || c.towerSpacing.length > 16 || typeof c.seed !== 'string' || c.seed.length > 64) throw new Error('Invalid saved fortification controls.');
  }
}
