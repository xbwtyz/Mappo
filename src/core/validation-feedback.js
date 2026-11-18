// Accessible guidance for failed operations; accepted city remains authoritative.
export function rebuildFailureMessage(message) {
  const reason = String(message ?? '').trim() || 'Review the unfinished draft and generation settings.';
  return 'Rebuild blocked: ' + reason + ' No city changes were applied. '
    + 'The last valid city remains available; correct the indicated draft or setting and try again.';
}
export function defenseInvalidField(errorText) {
  if (/tower spacing/i.test(errorText)) return 'towerSpacingInput';
  if (/gate|requested gates/i.test(errorText)) return 'gateCountInput';
  if (/seed/i.test(errorText)) return 'fortificationSeedInput';
  return null;
}
