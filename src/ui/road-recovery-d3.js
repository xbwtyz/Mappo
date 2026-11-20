// D3: presentation guidance only. This module never edits road geometry,
// grants building authorization, or determines Apply eligibility.
const guidance = Object.freeze({
  'protected-edge': ['Protected infrastructure', 'The proposed road would alter a protected boundary, bridge, bank or terrain connection. Adjust the road or edit that feature separately.', 'adjust'],
  'protected-junction': ['Protected road junction', 'This junction is connected to protected infrastructure. Choose an ordinary, editable road or junction instead.', 'choose'],
  'gate-connection': ['Protected gate approach', 'A gate approach cannot be rebuilt by an ordinary road move. Adjust the road away from the gate.', 'adjust'],
  'defense-reference': ['Fortification connection', 'This change affects a wall, gate or tower. Preserve its connection by changing the proposed road position.', 'adjust'],
  'unnormalized-crossing': ['Road crossing needs a junction', 'The proposed roads touch or cross without a supported shared junction. Adjust the road or its connections.', 'adjust'],
  'overlapping-roads': ['Roads overlap', 'Two street segments would share an unsupported stretch. Adjust the street to avoid the overlap.', 'adjust'],
  'degenerate-road': ['Road would collapse', 'At least one proposed street segment becomes too short. Increase separation between junctions.', 'adjust'],
  'disconnected-graph': ['Street connection breaks', 'The proposed road leaves parts of the street network disconnected. Reconnect or reposition the road.', 'adjust'],
  'boundary-escape': ['Outside city boundary', 'The proposed street extends beyond the accepted city boundary. Adjust its placement.', 'adjust'],
  'candidate-coordinate': ['Coordinates cannot be used', 'Enter usable finite coordinates or drag the proposed road back within supported bounds.', 'adjust'],
  'face-ambiguous': ['Block identity unclear', 'The affected blocks cannot be assigned safe identities. Adjust the road; Mappo will not guess which block owns existing property.', 'adjust'],
  'face-coverage': ['Block geometry is incomplete', 'The proposed streets do not form safely covered city blocks. Change the street position or connections.', 'adjust'],
  'plot-ownership': ['Plot ownership cannot be preserved', 'A plot would lose its verified property relationship. Adjust the draft or edit the protected property separately.', 'adjust'],
  'building-ownership': ['Building ownership cannot be preserved', 'A building cannot be safely attached to a successor property. Adjust the road or inspect the affected building.', 'adjust'],
  'property-containment': ['Property falls outside its block', 'The proposed block no longer contains an existing property. Adjust the road or handle that property separately.', 'adjust'],
  'district-reference': ['District relationship needs review', 'The proposed block change affects a protected district assignment. Adjust the road to preserve the relationship.', 'adjust'],
  'unrecognized-dependency': ['Protected custom data', 'Mappo cannot safely adapt this older or custom record automatically. Adjust the road or edit the record separately.', 'adjust'],
  'building-decision-required': ['Building needs a decision', 'Choose what to do with this building in Building decisions. The accepted footprint does not change until Apply.', 'building'],
  'building-placement-blocked': ['Building placement was rejected', 'The current building choice did not produce a safe footprint. Try another placement in Building decisions.', 'building'],
  'access-connection': ['Access would disconnect', 'The proposed street cuts an established access route. Adjust the road to keep access connected.', 'adjust'],
  'access-entrance': ['Entrance would lose access', 'The building entrance must retain a usable approach. Adjust the draft or resolve the building placement.', 'adjust'],
  'access-unproven': ['Access cannot be verified', 'A safe path from the road to the building cannot be established. Inspect the affected location and adjust the road.', 'adjust'],
  'candidate-validation': ['City validation failed', 'The complete city did not pass independent validation. Review the affected records and change the draft.', 'adjust'],
  'impact-incomplete': ['Preview could not be verified', 'The analysis could not finish. This draft cannot be applied; change or reset the proposal.', 'adjust'],
  'invalid-position': ['Position could not be checked', 'Correct the proposed coordinates, then review the updated preview.', 'adjust'],
  'preview-unavailable': ['Preview unavailable', 'This road edit cannot be verified in its current form. Change or reset the proposal.', 'adjust'],
});

export function roadRecoveryIssueD3(session) {
  if (!session?.pending || session.drag || session.checking) return null;
  const unresolved = session.reconciliation?.unresolved ?? [];
  const building = unresolved.find(row =>
    row?.kind === 'building' &&
    ['building-decision-required','building-placement-blocked'].includes(row.code));
  if (building) return building;
  if (unresolved.length) return unresolved[0];
  // Proposal issues are authoritative for invalid junction topology, even
  // when no full neighborhood-reflow candidate was produced.
  const proposal = session.proposal?.issues ?? [];
  if (proposal.length) return proposal[0];
  const affected = session.report?.affected ?? [];
  const invalid = affected.find(row => row.severity === 'invalid');
  if (invalid) return invalid;
  if (session.roadIntentInputError) return {code:'invalid-position',message:session.roadIntentInputError};
  if (session.error || session.reconciliationError) return {
    code:'preview-unavailable',message:session.error || session.reconciliationError,
  };
  const review = affected.find(row => row.severity === 'needs-review');
  return review ?? null;
}

export function roadRecoveryGuidanceD3(row) {
  if (!row) return null;
  const code = typeof row.code === 'string' ? row.code : 'unknown';
  const fallback = code.replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase());
  const [title,description,action] = guidance[code] ?? [
    fallback || 'Road change needs review',
    row.message || 'This proposal could not be verified. Review the affected feature and adjust the road.',
    'adjust',
  ];
  return {title,description,action,code};
}
