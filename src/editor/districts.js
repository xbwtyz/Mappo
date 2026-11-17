import {
  applyDistrictMembership,
  validateDistricts,
  moveDistrictBlock,
  renameDistrict
} from '../core/district-model.js';
import {
  generateDistricts
} from '../generators/districts.js';

export const DISTRICT_HISTORY_LIMIT = 20;
export function districtSnapshot(city) {
  const snapshot = {
    districts: city.districts,
    districtState: city.districtState
  };
  if (city.districtState.status === 'unassigned') snapshot.legacyMembership = Object.fromEntries(['blocks', 'properties', 'buildings'].map(key => [key, city[key].map(record => ({
    id: record.id,
    ...(Object.hasOwn(record, 'districtId') ? {
      districtId: record.districtId
    } : {})
  }))]));
  return JSON.parse(JSON.stringify(snapshot));
}
export function restoreDistrictSnapshot(city, snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot));
  if (copy.districtState?.status === 'unassigned' && copy.legacyMembership !== undefined) {
    if (!copy.legacyMembership || typeof copy.legacyMembership !== 'object') throw new Error('Invalid legacy district undo assignments.');
    for (const key of ['blocks', 'properties', 'buildings']) {
      const entries = copy.legacyMembership[key],
        ids = new Set(city[key].map(record => record.id));
      if (!Array.isArray(entries) || entries.length !== ids.size || new Set(entries.map(record => record?.id)).size !== entries.length || entries.some(record => !record || !ids.has(record.id))) throw new Error('District undo assignments refer to a different city.');
    }
  }

  const next = copy.districtState.status === 'assigned' ? applyDistrictMembership(city, copy.districts, copy.districtState) : {
    ...city,
    districts: copy.districts,
    districtState: copy.districtState,
    ...Object.fromEntries(['blocks', 'properties', 'buildings'].map(key => {
      const entries = new Map((copy.legacyMembership?.[key] ?? []).map(record => [record.id, record]));
      return [key, city[key].map(record => {
        const next = {
            ...record
          },
          stored = entries.get(record.id);
        if (stored && Object.hasOwn(stored, 'districtId')) next.districtId = stored.districtId;
        else delete next.districtId;
        return next;
      })];
    }))
  };
  validateDistricts(next);
  return next;
}
export class DistrictEditor {
  constructor() {
    this.selectedDistrictId = null;
    this.selectedBlockId = null;
    this.history = [];
  }
  remember(city) {
    this.history.push(districtSnapshot(city));
    if (this.history.length > DISTRICT_HISTORY_LIMIT) this.history.shift();
  }
  generate(city, options) {
    const next = generateDistricts(city, options);
    this.remember(city);
    this.selectedDistrictId = next.districts[0]?.id ?? null;
    this.selectedBlockId = null;
    return next;
  }
  edit(city, name, color) {
    const next = renameDistrict(city, this.selectedDistrictId, name, color);
    this.remember(city);
    return next;
  }
  move(city, target) {
    const next = moveDistrictBlock(city, this.selectedBlockId, target);
    this.remember(city);
    this.selectedDistrictId = target;
    return next;
  }
  undo(city) {
    if (!this.history.length) throw new Error('There is no district edit to undo.');
    const next = restoreDistrictSnapshot(city, this.history.at(-1));
    this.history.pop();
    if (this.selectedBlockId) this.selectedDistrictId = next.blocks.find(b => b.id === this.selectedBlockId)?.districtId ?? null;
    if (!next.districts.some(d => d.id === this.selectedDistrictId)) this.selectedDistrictId = next.districtState.status === 'assigned' ? next.districts[0]?.id ?? null : null;
    return next;
  }
  snapshot() {
    return JSON.parse(JSON.stringify({
      selectedDistrictId: this.selectedDistrictId,
      selectedBlockId: this.selectedBlockId,
      history: this.history
    }));
  }
  load(state = {}) {
    this.selectedDistrictId = state.selectedDistrictId ?? null;
    this.selectedBlockId = state.selectedBlockId ?? null;
    this.history = JSON.parse(JSON.stringify(state.history ?? []));
  }
}
export function validateDistrictEditorState(state, city) {
  if (state === undefined) return;
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid saved district editor.');
  if (!Array.isArray(state.history) || state.history.length > DISTRICT_HISTORY_LIMIT) throw new Error('Invalid district undo history.');
  if (state.selectedDistrictId != null && !city.districts.some(d => d.id === state.selectedDistrictId)) throw new Error('Saved district selection is missing.');
  if (state.selectedBlockId != null && !city.blocks.some(b => b.id === state.selectedBlockId)) throw new Error('Saved block selection is missing.');
  if (state.controls !== undefined) {
    const c = state.controls;
    if (!c || typeof c !== 'object' || typeof c.count !== 'string' || c.count.length > 16 || typeof c.seed !== 'string' || c.seed.length > 64 || typeof c.name !== 'string' || c.name.length > 64 || typeof c.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.color) || typeof c.target !== 'string' || (c.target && !city.districts.some(d => d.id === c.target))) throw new Error('Invalid saved district controls.');
  }
  for (const snapshot of state.history) {
    if (!snapshot || !Array.isArray(snapshot.districts) || !snapshot.districtState) throw new Error('Invalid district undo snapshot.');
    restoreDistrictSnapshot(city, snapshot);
  }
}
