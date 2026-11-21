import { restoreDistrictSnapshot } from './districts.js';

// Reflow can retire block IDs. Update the district editor for the candidate
// before validating its portable save, and use the same state on commit.
export function reconcileRoadWorkspace(workspace, before, after) {
  const district = workspace.districtEditor;
  if (!district) return workspace;

  const selected = district.selectedBlockId;
  const retired = selected != null && before.blocks.some(block => block.id === selected) &&
    !after.blocks.some(block => block.id === selected);
  const history = district.history;
  let nextHistory = history;
  if (history?.length && ['blocks', 'properties', 'buildings'].some(key => {
    if (before[key].length !== after[key].length) return true;
    const afterIds = new Set(after[key].map(record => record.id));
    return before[key].some(record => !afterIds.has(record.id));
  })) {
    // A district undo snapshot with retired parcel IDs can't be replayed.
    // Keep only the compatible suffix so district Undo never skips an edit.
    for (let i = history.length - 1; i >= 0; i--) {
      try {
        restoreDistrictSnapshot(after, history[i]);
      } catch {
        restoreDistrictSnapshot(before, history[i]);
        nextHistory = history.slice(i + 1);
        break;
      }
    }
  }

  if (!retired && history === nextHistory) return workspace;
  return {
    ...workspace,
    districtEditor: {
      ...district,
      history: nextHistory,
      ...(retired ? {
        selectedBlockId: null,
        ...(district.controls ? { controls: { ...district.controls, target: '' } } : {}),
      } : {}),
    },
  };
}
