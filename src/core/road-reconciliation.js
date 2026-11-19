import { buildRoadGraph, proposeJunctionMove } from './road-graph.js';
import { extractRoadFaces, matchExistingFaces } from './road-faces.js';
import { analyzeRoadImpact } from './road-impact.js';
import { riRecords } from './road-impact-model.js';

// B1 constructs detached, topology-only candidates. A3 remains the authority
// for all road-dependent diagnostics. B2 must reconcile land; B4 alone may Apply.
const brCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const brCopy = value => JSON.parse(JSON.stringify(value));
const brKey = (kind, id) => JSON.stringify([kind, id]);
const brOrder = (a, b) => brCompare(a.kind, b.kind) || brCompare(a.id, b.id);
function brFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(brFreeze);
    Object.freeze(value);
  }
  return value;
}
const brIssue = (code, message, ids = []) => ({
  kind: 'city', id: 'unknown', code, message, severity: 'invalid',
  relatedIds: [...new Set(ids.filter(id => typeof id === 'string'))].sort(brCompare),
});
function brIssueRow(row) {
  return {
    kind: row.kind, id: row.id, code: row.code, message: row.message,
    severity: row.severity, relatedIds: [...(row.relatedIds ?? [])],
  };
}
function brRejected(status, issues, validation, impact = null) {
  return brFreeze({
    operation: 'move-junction', status, impactStatus: impact?.status ?? status,
    applyReady: false, candidateProject: null,
    changed: [], dependent: [], preserved: [], unresolved: issues,
    impact: impact ? { complete: impact.complete, status: impact.status } : null,
    validation,
  });
}
function brValidation(graph, faces = 'not-run', identity = 'not-run', impact = 'not-run') {
  return { graph, faces, identity, impact, project: 'not-run' };
}
// Preserve A3's distinction: identity ambiguity is review-required, while a
// malformed topology or protected-feature rewrite is invalid.
const BR_REVIEW_IDENTITY = new Set([
  'face-split', 'face-merged', 'face-ambiguous', 'district-reference', 'defense-reference',
]);
export function classifyRoadIdentityB1(issues) {
  return issues.length && issues.every(issue => BR_REVIEW_IDENTITY.has(issue.code))
    ? 'needs-review' : 'invalid';
}
function brInventory(city, changed, impact) {
  const modifiedKeys = new Set(changed.map(r => brKey(r.kind, r.id)));
  const accepted = riRecords(city);
  const acceptedKeys = new Set(accepted.map(r => brKey(r.kind, r.id)));
  const grouped = new Map();
  for (const row of impact.affected) {
    const key = brKey(row.kind, row.id);
    if (modifiedKeys.has(key)) continue;
    if (!grouped.has(key)) grouped.set(key, {
      kind: row.kind, id: row.id, identityPreserved: acceptedKeys.has(key), reasons: [],
    });
    grouped.get(key).reasons.push({
      code: row.code, severity: row.severity, message: row.message,
      relatedIds: [...row.relatedIds], metrics: row.metrics == null ? null : brCopy(row.metrics),
    });
  }
  const dependent = [...grouped.values()].sort(brOrder);
  const dependentKeys = new Set(grouped.keys());
  const preserved = accepted
    .filter(r => !modifiedKeys.has(brKey(r.kind, r.id)) && !dependentKeys.has(brKey(r.kind, r.id)))
    .map(({ kind, id }) => ({ kind, id, state: 'unchanged' })).sort(brOrder);
  const unresolved = impact.issues.map(brIssueRow);
  // Even an informational A3 record can indicate a derived value to be
  // reconciled (e.g. changed open-space area). Do not silently mark it safe.
  for (const row of dependent) {
    if (!row.identityPreserved || row.reasons.some(r => r.severity !== 'info')) continue;
    unresolved.push({
      kind: row.kind, id: row.id, code: 'dependent-reconciliation-pending',
      message: 'Review this dependent record before any accepted road edit.',
      severity: 'needs-review', relatedIds: row.reasons.flatMap(r => r.relatedIds)
        .filter((id, i, list) => list.indexOf(id) === i).sort(brCompare),
    });
  }
  unresolved.sort((a,b) => brOrder(a,b) || brCompare(a.code,b.code) ||
    brCompare(JSON.stringify(a.relatedIds),JSON.stringify(b.relatedIds)));
  return { dependent, preserved, unresolved };
}
export function prepareRoadReconciliationB1(project, junctionId, point) {
  const fail = (code, message, ids = []) => brRejected('invalid',
    [brIssue(code, message, ids)], brValidation('failed'));
  if (!project?.city || !Array.isArray(project.city.nodes) || !Array.isArray(project.city.roads))
    return fail('unsupported-project', 'A supported accepted city project is required.');
  try {
    const city = project.city;
    const accepted = buildRoadGraph(city);
    if (!accepted.valid)
      return fail('invalid-accepted-graph', 'The accepted road graph failed A1 validation.',
        accepted.issues.flatMap(issue => [...(issue.nodeIds ?? []), ...(issue.roadIds ?? [])]));
    const proposal = proposeJunctionMove(city, junctionId, point);
    if (!proposal.graphValid)
      return brRejected('invalid', proposal.issues.map(issue => ({
        kind: issue.roadIds?.length ? 'road' : 'junction',
        id: issue.roadIds?.[0] ?? issue.nodeIds?.[0] ?? junctionId ?? 'unknown',
        code: issue.code, message: issue.message, severity: 'invalid',
        relatedIds: [...new Set([...(issue.nodeIds ?? []), ...(issue.roadIds ?? [])])].sort(brCompare),
      })), brValidation('failed'));
    const old = accepted.nodesById.get(junctionId);
    const moved = old && (old.x !== point.x || old.y !== point.y);
    const faces = extractRoadFaces(proposal.graph, city);
    if (!faces.valid)
      return brRejected('invalid', faces.issues.map(issue => ({
        kind: issue.faceIds?.length ? 'block' : issue.roadIds?.length ? 'road' : 'city',
        id: issue.faceIds?.[0] ?? issue.roadIds?.[0] ?? city.id,
        code: issue.code, message: issue.message, severity: 'invalid',
        relatedIds: [...new Set([...(issue.faceIds ?? []), ...(issue.roadIds ?? []), ...(issue.objectIds ?? [])])].sort(brCompare),
      })), brValidation('pass', 'failed'));
    const identity = matchExistingFaces(city, faces);
    const hasIdentityConflict = !identity.valid || identity.issues.length ||
      identity.added.length || identity.removed.length || identity.split.length ||
      identity.merged.length || identity.ambiguous.length;
    if (hasIdentityConflict) {
      const issues = identity.issues.map(issue => ({
        kind: issue.faceIds?.length ? 'block' : issue.objectIds?.length ? 'city' : 'city',
        id: issue.faceIds?.[0] ?? issue.objectIds?.[0] ?? city.id,
        code: issue.code, message: issue.message,
        severity: BR_REVIEW_IDENTITY.has(issue.code) ? 'needs-review' : 'invalid',
        relatedIds: [...new Set([...(issue.faceIds ?? []), ...(issue.roadIds ?? []), ...(issue.objectIds ?? [])])].sort(brCompare),
      }));
      if (!issues.length) issues.push({
        kind:'city', id:city.id, code:'ambiguous-face-identity',
        message:'B1 requires one-to-one correspondence for every accepted face.',
        severity:'needs-review', relatedIds:[],
      });
      const status = classifyRoadIdentityB1(issues);
      return brRejected(status, issues, brValidation('pass', 'pass', status));
    }
    // A3 has the complete typed impact inventory, including frontage, building
    // access/clearance, defenses, open-space summaries and unknown extensions.
    const impact = moved ? analyzeRoadImpact(project, proposal) : null;
    if (impact && (!impact.complete || impact.validation.accepted !== 'valid')) {
      const issues = impact.issues.length ? impact.issues.map(brIssueRow) : [{
        kind:'city', id:city.id, code:'impact-incomplete',
        message:'Complete accepted-project dependency analysis could not be established.',
        severity:'needs-review', relatedIds:[],
      }];
      return brRejected(impact.status === 'invalid' ? 'invalid' : 'needs-review',
        issues, brValidation('pass','pass','pass','incomplete'), impact);
    }
    if (impact?.status === 'invalid')
      return brRejected('invalid', impact.issues.map(brIssueRow),
        brValidation('pass','pass','pass','failed'), impact);

    // Only A2 supplies updated block records; property and building geometry
    // remain accepted. B2 must transform them and B4 must validate and Apply.
    const altered = new Map(identity.changed.filter(f => f.kind === 'block')
      .map(f => [f.id, f.record]));
    const candidate = brCopy(project);
    if (moved)
      candidate.city.nodes = city.nodes.map(n => n.id === junctionId
        ? { ...brCopy(n), x: point.x, y: point.y } : brCopy(n));
    candidate.city.blocks = city.blocks.map(b => altered.has(b.id)
      ? brCopy(altered.get(b.id)) : brCopy(b));

    const roadIds = moved ? [...(accepted.incidentRoads.get(junctionId) ?? [])].sort(brCompare) : [];
    const changed = [
      ...(moved ? [{
        kind:'junction', id:junctionId, state:'modified-identity-preserved',
        fields: ['x','y'].filter(field => old[field] !== point[field]),
      }] : []),
      ...roadIds.map(id => ({
        kind:'road', id, state:'modified-identity-preserved', fields:['effective-geometry'],
      })),
      ...[...altered.keys()].sort(brCompare).map(id => ({
        kind:'block', id, state:'modified-identity-preserved',
        fields:['area','boundary-geometry'],
      })),
    ].sort(brOrder);
    const inventory = impact ? brInventory(city, changed, impact) : {
      dependent: [],
      preserved: riRecords(city).map(({kind,id}) => ({kind,id,state:'unchanged'})).sort(brOrder),
      unresolved: [],
    };
    return brFreeze({
      operation:'move-junction', status:moved ? 'candidate-only':'unchanged',
      impactStatus:impact?.status ?? 'not-run', applyReady:false,
      candidateProject:candidate, changed, ...inventory,
      impact:impact ? {
        complete:impact.complete, status:impact.status, counts:brCopy(impact.counts),
        metrics:brCopy(impact.metrics),
      } : null,
      validation:brValidation('pass','pass','pass',impact ? 'complete' : 'not-run'),
    });
  } catch (error) {
    return fail('reconciliation-incomplete',
      'Road reconciliation could not prove a valid candidate: ' + error.message);
  }
}
