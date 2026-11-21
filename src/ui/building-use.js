import { BUILDING_USE_TYPES } from '../core/identity.js';
import { inspectionValue } from '../core/selection-information.js';

const displayedBuildingUses = new WeakMap();

export function renderBuildingUseOptions(select, currentType, keepCurrent = false) {
  const key = JSON.stringify([currentType, keepCurrent]);
  if (displayedBuildingUses.get(select) === key) return;
  const options = BUILDING_USE_TYPES.map(type => [type, inspectionValue(type)]);
  if (keepCurrent || (currentType && !BUILDING_USE_TYPES.includes(currentType))) {
    options.unshift([keepCurrent ? '' : currentType, 'Keep current use (' + inspectionValue(currentType) + ')']);
  }
  const previous = select.value;
  select.replaceChildren(...options.map(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
  if (options.some(([value]) => value === previous)) select.value = previous;
  displayedBuildingUses.set(select, key);
}
