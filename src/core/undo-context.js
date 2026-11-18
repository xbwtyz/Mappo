// Contextual Undo routing never changes or combines independent histories.
const SCOPE = {
  outline: { controlId: 'undoButton', label: 'Undo outline', noun: 'outline edit' },
  water: { controlId: 'undoWaterButton', label: 'Undo water', noun: 'water draft edit' },
  terrain: { controlId: 'undoTerrainButton', label: 'Undo mountains', noun: 'mountain draft edit' },
  district: { controlId: 'undoDistrictButton', label: 'Undo district', noun: 'district assignment/edit' },
  defense: { controlId: 'undoFortificationButton', label: 'Undo defenses', noun: 'defense update' }
};
export function describeUndoContext({
  section = 'city', selection = null, outline, water, terrain, district, defense
}) {
  const liveMode = terrain?.mode !== 'pan' ? 'terrain'
    : water?.mode !== 'pan' ? 'water'
    : outline?.mode !== 'pan' ? 'outline' : null;
  const kind = liveMode
    || (section === 'city' ? 'outline'
      : section === 'districts' ? 'district'
      : section === 'defenses' ? 'defense'
      : section === 'landscape' && ['water', 'terrain'].includes(selection?.kind) ? selection.kind
      : null);
  if (!kind) return {
    kind: null, controlId: null, label: 'Undo', available: false,
    description: 'Select a water or mountain feature, or use the landscape history buttons.'
  };
  const editor = { outline, water, terrain, district, defense }[kind],
    count = editor?.history?.length ?? 0,
    scope = SCOPE[kind];
  return {
    kind, controlId: scope.controlId, label: scope.label,
    available: count > 0,
    description: count ? \`Undo the last \${scope.noun} (\${count} available).\`
      : \`No \${scope.noun} to undo.\`
  };
}
