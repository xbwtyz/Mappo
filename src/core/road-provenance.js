// An explicit generator stamp with a snapshot detects subsequent editor changes.
// Existing schema-9 projects without a stamp retain unknown provenance.
function canonicalRoadRecord(value) {
  if (Array.isArray(value)) return value.map(canonicalRoadRecord);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalRoadRecord(value[key])]));
  return value;
}

function roadProvenanceSnapshot(record, plots) {
  const { roadProvenance, ...fields } = record;
  return JSON.stringify(canonicalRoadRecord([fields, plots]));
}

export function stampRoadGenerated(record, plots = []) {
  record.roadProvenance = { source: 'generator-v1', snapshot: roadProvenanceSnapshot(record, plots) };
}

export function classifyRoadProvenance(record, plots = []) {
  if (record.customName || record.customUse) return 'custom';
  const stamp = record.roadProvenance;
  if (stamp?.source !== 'generator-v1' || typeof stamp.snapshot !== 'string' || Object.keys(stamp).length !== 2)
    return 'unknown';
  return stamp.snapshot === roadProvenanceSnapshot(record, plots) ? 'generated' : 'custom';
}
