import { copyJson } from '../data/project-format.js';

export const HISTORY_EDITOR_KEYS = Object.freeze({ districts: 'districtEditor', defenses: 'fortificationEditor' });

// Editor snapshots keep their existing portable representation. The journal
// stores just the affected stack so undoing a change also undoes its save entry.
export function historyWorkspaceForReplay(workspace, city, editorHistory, direction) {
  if (!editorHistory) return workspace;
  const { key, before, after } = editorHistory;
  const next = workspace[key] ?? {};
  next.history = copyJson((direction === 'undo' ? before : after).history);
  workspace[key] = next;
  if (key !== HISTORY_EDITOR_KEYS.districts) return workspace;

  const block = city.blocks.find(item => item.id === next.selectedBlockId);
  const districtExists = id => city.districts.some(item => item.id === id);
  next.selectedBlockId = block?.id ?? null;
  const districtId = block?.districtId ?? next.selectedDistrictId;
  next.selectedDistrictId = districtExists(districtId) ? districtId : null;
  if (next.controls?.target && !districtExists(next.controls.target)) next.controls.target = '';
  if (workspace.ui?.selection?.kind === 'district') {
    const id = next.selectedDistrictId;
    workspace.ui.selection = id ? { kind: 'district', id } : null;
  }
  return workspace;
}
