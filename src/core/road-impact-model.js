export const ROAD_IMPACT_WORK_LIMIT = 6000000;
export const ROAD_IMPACT_COLLECTIONS = Object.freeze([
  ['nodes', 'junction'],
  ['roads', 'road'],
  ['blocks', 'block'],
  ['properties', 'property'],
  ['plots', 'plot'],
  ['buildings', 'building'],
  ['districts', 'district'],
  ['walls', 'defense'],
  ['gates', 'defense'],
  ['towers', 'defense'],
  ['waterFeatures', 'water'],
  ['bridges', 'water'],
  ['waterFaces', 'water'],
  ['terrainFeatures', 'terrain'],
  ['terrainPasses', 'terrain'],
  ['terrainFaces', 'terrain'],
  ['openSpaces', 'open-space'],
]);
export const riCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const riIndex = (records) => new Map((records ?? []).map((record) => [record.id, record]));
export function riRoadEqual(a, b) {
  if (!a || !b) return a === b;
  const first = [a.a, a.b].sort(riCompare),
    second = [b.a, b.b].sort(riCompare);
  return riEqual({ ...a, a: first[0], b: first[1] }, { ...b, a: second[0], b: second[1] });
}
export function riEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b))
    return false;
  const ak = Object.keys(a).sort(riCompare),
    bk = Object.keys(b).sort(riCompare);
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && riEqual(a[k], b[k]));
}
export function riFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(riFreeze);
    Object.freeze(value);
  }
  return value;
}
export function riBudget() {
  let remaining = ROAD_IMPACT_WORK_LIMIT;
  return (n = 1) => {
    if ((remaining -= n) < 0)
      throw new Error('Dependency analysis exceeded its work budget; safety could not be proven.');
  };
}
export function riRecords(city) {
  const records = ROAD_IMPACT_COLLECTIONS.flatMap(([key, kind]) =>
    (city[key] ?? []).map((record) => ({ kind, id: record.id, record })),
  );
  if (city.plaza) records.push({ kind: 'plaza', id: city.plaza.id, record: city.plaza });
  return records.sort((a, b) => riCompare(a.kind, b.kind) || riCompare(a.id, b.id));
}
export function riIssueKey(issue) {
  return JSON.stringify([issue.kind, issue.id, issue.code, issue.relatedIds]);
}
export function riReporter() {
  const items = new Map();
  const emit = (kind, id, code, message, relatedIds = [], metrics = null, severity = 'needs-review') => {
    const issue = {
      kind,
      id: String(id ?? 'unknown'),
      code,
      message,
      severity,
      relatedIds: [...new Set(relatedIds.filter((id) => typeof id === 'string'))].sort(riCompare),
      metrics,
    };
    const key = riIssueKey(issue),
      old = items.get(key);
    if (!old || (old.severity === 'info' && severity !== 'info') || severity === 'invalid')
      items.set(key, issue);
  };
  return { emit, items: () => [...items.values()].sort((a, b) => riCompare(riIssueKey(a), riIssueKey(b))) };
}

// Only fields with a defined meaning in the current project model can support
// a Safe claim. Nonempty opaque data is preserved but requires impact review.
const riKnownFields = {
  nodes: 'id x y',
  roads: 'id a b kind boundary plaza bank bridgeId waterBoundary foothill passId terrainBoundary',
  blocks: 'id vertices area ring sector usage districtId',
  plaza: 'id name center vertices area',
  properties:
    'id blockId plotIds boundary frontageRoadId frontage area buildingIds usage frame local districtId customName customUse',
  plots: 'id blockId propertyId frontageRoadId boundary',
  buildings:
    'id blockId propertyId plotIds frontageRoadId type shape footprint holes area entrance orientation roofTone accessPath districtId customName customUse',
  openSpaces: 'id blockId kind area',
  districts: 'id dataVersion kind name color blockIds extensions',
  walls: 'id dataVersion kind width edgeWidth path waterOpenings terrainOpenings extensions',
  gates: 'id dataVersion kind wallId arc opening postRadius center connection extensions',
  towers: 'id dataVersion kind role wallId arc center radius extensions',
  waterFeatures:
    'id dataVersion kind path widths width waterSide seaDepth direction generation extensions polygon corridor center radius',
  bridges: 'id dataVersion kind waterId t width extensions',
  waterFaces: 'id waterId waterIds vertices area',
  terrainFeatures: 'id dataVersion kind name center path ridge generation extensions polygon corridor',
  terrainPasses: 'id dataVersion kind terrainId t width extensions',
  terrainFaces: 'id terrainIds vertices area',
};
const riNonempty = (value) =>
  value !== undefined &&
  value !== null &&
  value !== false &&
  value !== '' &&
  (!(typeof value === 'object') || Object.keys(value).length > 0);
function riUnknownRecord(record, fields, kind, id, emit, spend, path = '') {
  const allowed = new Set(fields.split(' '));
  for (const key of Object.keys(record ?? {})) {
    spend();
    if ((!allowed.has(key) || key === 'extensions') && riNonempty(record[key]))
      emit(
        kind,
        id,
        'unrecognized-dependency',
        `The impact of ${path}${key} is not defined by the current road-edit contract.`,
        [],
        { field: path + key },
      );
  }
}
function riNestedGeometry(record, kind, id, emit, spend) {
  const point = (value, path, fields = 'id x y') => {
    if (value && typeof value === 'object') riUnknownRecord(value, fields, kind, id, emit, spend, path + '.');
  };
  for (const key of ['center', 'entrance']) point(record?.[key], key);
  for (const key of [
    'boundary',
    'footprint',
    'path',
    'corridor',
    'polygon',
    'frontage',
    'accessPath',
    'ridge',
  ])
    for (const value of Array.isArray(record?.[key]) ? record[key] : [])
      point(value, key, key === 'ridge' ? 'x y height' : 'id x y');
  for (const hole of record?.holes ?? []) for (const value of hole) point(value, 'holes');
  for (const key of ['origin', 'tangent', 'inward']) point(record?.frame?.[key], 'frame.' + key);
  for (const value of record?.connection?.points ?? []) point(value, 'connection.points');
  for (const key of ['waterOpenings', 'terrainOpenings'])
    for (const value of Array.isArray(record?.[key]) ? record[key] : [])
      riUnknownRecord(
        value,
        'start end waterId waterIds terrainIds extensions',
        kind,
        id,
        emit,
        spend,
        key + '.',
      );
}
export function inspectOpaqueRoadDependencies(project, graph, emit, spend) {
  const city = project.city;
  riUnknownRecord(
    project,
    'schemaVersion generatorVersion seed options city',
    'city',
    city.id,
    emit,
    spend,
    'project.',
  );
  riUnknownRecord(
    project.options,
    'size morphology boundary center',
    'city',
    city.id,
    emit,
    spend,
    'options.',
  );
  riUnknownRecord(
    city,
    'id name survey waterState waterFeatures bridges waterFaces terrainFeatures terrainPasses terrainFaces nodes roads blocks plaza plots properties buildings openSpaces districts districtState walls gates towers fortificationState',
    'city',
    city.id,
    emit,
    spend,
    'city.',
  );
  for (const [key, kind] of ROAD_IMPACT_COLLECTIONS)
    for (const record of city[key] ?? []) {
      riUnknownRecord(record, riKnownFields[key], kind, record.id, emit, spend, key + '.');
      riNestedGeometry(record, kind, record.id, emit, spend);
    }
  riUnknownRecord(city.plaza, riKnownFields.plaza, 'plaza', city.plaza.id, emit, spend, 'plaza.');
  riNestedGeometry(city.plaza, 'plaza', city.plaza.id, emit, spend);
  riNestedGeometry(project.options, 'city', city.id, emit, spend);
  riNestedGeometry(city.survey, 'city', city.id, emit, spend);
  riUnknownRecord(
    city.survey.shapeOptions,
    'profile stretch asymmetry bend',
    'city',
    city.id,
    emit,
    spend,
    'shapeOptions.',
  );
  for (const anchor of city.survey.anchors ?? [])
    riUnknownRecord(anchor, 'id kind x y', 'city', city.id, emit, spend, 'anchors.');
  for (const record of graph.roadsById.values())
    riUnknownRecord(record, riKnownFields.roads, 'road', record.id, emit, spend, 'candidate.road.');
  for (const record of graph.nodesById.values())
    riUnknownRecord(record, riKnownFields.nodes, 'junction', record.id, emit, spend, 'candidate.junction.');
  for (const p of city.properties ?? []) {
    riUnknownRecord(p.frame, 'origin tangent inward', 'property', p.id, emit, spend, 'frame.');
    riUnknownRecord(p.local, 'x y width depth', 'property', p.id, emit, spend, 'local.');
  }
  for (const [key, fields] of [
    [
      'survey',
      'boundary anchors nominalRadius morphology plannedAngle linearBendPhase axisAngle shapeOptions',
    ],
    ['waterState', 'version status seed algorithm'],
    ['districtState', 'version status algorithm seed requestedCount count'],
    [
      'fortificationState',
      'version status enabled algorithm seed requestedGateCount gateCount towerSpacing clearance',
    ],
  ])
    riUnknownRecord(city[key], fields, 'city', city.id, emit, spend, key + '.');
  for (const [key, kind] of [
    ['waterFeatures', 'water'],
    ['terrainFeatures', 'terrain'],
  ])
    for (const record of city[key] ?? [])
      riUnknownRecord(
        record.generation,
        'seed algorithm placement size direction width radius waterSide seaDepth',
        kind,
        record.id,
        emit,
        spend,
        'generation.',
      );
  for (const gate of city.gates ?? [])
    riUnknownRecord(
      gate.connection,
      'cityNodeId width points',
      'defense',
      gate.id,
      emit,
      spend,
      'connection.',
    );
}
