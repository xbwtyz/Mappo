const LARE_CONFLICT_TYPES=Object.freeze(['geometric-obstruction','protected-content',
  'decision-required','unsupported-configuration','search-exhausted','work-limit','invalid-candidate']);
export function lareConflict(type,code,entityIds,message){
  if(!LARE_CONFLICT_TYPES.includes(type)||typeof code!=='string'||!code||
    !Array.isArray(entityIds)||entityIds.some(id=>typeof id!=='string'||!id)||
    typeof message!=='string'||!message)throw Error('Invalid reconciliation diagnostic.');
  return Object.freeze({type,code,entityIds:Object.freeze([...new Set(entityIds)].sort()),message,severity:'needs-review'});
}

export function describeLareRefusal(issue) {
  const code = issue.code ?? '';
  const categories = [
    [/(?:topology|road-crossing|unnormalized-crossing|road-overlap|overlapping-roads|collinear-overlap|boundary-escape)/, 'invalid-topology'],
    [/(?:protected|fixed)/, 'protected-content'],
    [/(?:unsupported|opaque)/, 'unsupported-configuration'],
    [/(?:decision-required|decision-invalid)/, 'decision-required'],
    [/work-limit/, 'work-limit'],
    [/search-exhausted/, 'search-exhausted'],
  ];
  const type = issue.type ?? categories.find(([pattern]) => pattern.test(code))?.[1] ?? 'geometric-obstruction';
  const ids = [...new Set([issue.id, ...(issue.relatedIds ?? [])].filter(Boolean))].sort();
  const measurement = issue.metrics;
  let message = issue.message;
  if (code === 'road-setback' && measurement && Number.isFinite(measurement.newDistance) &&
      Number.isFinite(measurement.requiredDistance)) {
    const previous = Number.isFinite(measurement.oldDistance) ? ' Previous clearance ' + measurement.oldDistance.toFixed(3) + '.' : '';
    message = 'Street setback at ' + issue.id + ' requires ' + measurement.requiredDistance +
      ' units. Proposed clearance is ' + measurement.newDistance.toFixed(3) + '.' + previous +
      ' Reduce the movement to restore clearance.';
  }
  return { ...issue, type, entityIds: ids, message };
}
