import { createLareBudget, LARE_DEMOLITION_LIMITS, LARE_STRATEGY_LIMITS, LareBudgetExceeded } from './reconciliation-budget.js';
import { createLareContext, discoverLareParcelScope } from './reconciliation-context.js';
import { iterateLareGroupPreservation } from './reconciliation-preservation.js';
import { iterateRoadGroupIntentB1 } from './road-intent-c1.js';
import { iterateRoadGraph } from './road-graph.js';
import { iterateRoadFaces, iterateRoadFaceIdentity } from './road-faces.js';
import { iterateRoadImpact } from './road-impact.js';
import { cloneLareCity } from './reconciliation-city.js';
import { finishLareSteps } from './reconciliation-steps.js';
import { iterateRoadGroupReflowB1 } from './neighborhood-reflow.js';
import { stampRoadGenerated } from './road-provenance.js';
import { riBudget, riCompare, riEqual, riFreeze, riIndex, riReporter } from './road-impact-model.js';
import { LARE_CONSTRAINTS } from './reconciliation-constraints.js';

const lareDemolitionSessions = new WeakMap();
const lareDemolitionRefusals = new WeakMap();
const lareDemolitionAuthorizations = new WeakMap();

function* lareProtectReferencedBuildings(project, candidates, budget) {
  const work = [{ value: project, role: 'project' }];
  let steps = 0;
  while (work.length && candidates.size) {
    if (steps++ % 1024 === 0) yield { stage: 'demolition-reference-check' };
    const { value, role } = work.pop();
    budget.spend();
    if (typeof value === 'string') {
      candidates.delete(value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      budget.spend();
      if ((role === 'property' && key === 'buildingIds') ||
          (role === 'building' && key === 'id')) continue;
      candidates.delete(key);
      const childRole = role === 'project' && key === 'city' ? 'city'
        : role === 'city' && key === 'properties' ? 'properties'
        : role === 'city' && key === 'buildings' ? 'buildings'
        : role === 'properties' ? 'property'
        : role === 'buildings' ? 'building' : null;
      work.push({ value: child, role: childRole });
    }
  }
}

function* lareDemolitionScope(project, draft, choices, budget) {
  const graph = yield* iterateRoadGraph(draft.proposedCity);
  const faces = yield* iterateRoadFaces(graph, project.city);
  const identity = yield* iterateRoadFaceIdentity(project.city, faces);
  const impact = yield* iterateRoadImpact(project, { operation: 'translate-road', graph });
  if (!graph.valid || !faces.valid || !identity.valid || identity.requiresReview ||
      !impact.complete || impact.status === 'invalid') return { eligible: new Map(), issues: [], blocks: [] };
  const context = createLareContext(project, draft, choices, budget);
  const blocks = new Map(identity.changed.filter(face => face.kind === 'block')
    .map(face => [face.id, face.record]));
  const issues = impact.issues;
  const scope = discoverLareParcelScope(context, project.city, draft, blocks, issues, budget).adapt();
  const buildings = riIndex(project.city.buildings), eligible = new Map();
  for (const parcel of scope.authorized) {
    if (parcel.policy.mode !== 'adaptive' || parcel.policy.provenance !== 'generated') continue;
    for (const building of parcel.buildings) {
      budget.spend();
      if (building.mode === 'rigid' && building.provenance === 'generated') {
        const record = buildings.get(building.id);
        if (record && Number.isFinite(record.area) && record.area > 0) eligible.set(building.id, record);
      }
    }
  }
  yield* lareProtectReferencedBuildings(project, eligible, budget);
  return { eligible, issues, blocks: [...blocks.keys()] };
}

function* lareRequireDemolitionDelta(original, candidate, draft, choices, removalIds, budget) {
  if (!Array.isArray(removalIds) || !removalIds.length ||
      new Set(removalIds).size !== removalIds.length)
    throw Error('The reviewed removal set is incomplete or contains duplicates.');
  const { eligible, blocks } = yield* lareDemolitionScope(original, draft, choices, budget);
  const removed = new Set(removalIds);
  if (!removalIds.every(id => eligible.has(id)))
    throw Error('A reviewed building is protected or outside the eligible reconciliation scope.');
  const surviving = new Set(candidate?.city?.buildings?.map(building => building.id));
  const missing = original.city.buildings.filter(building => !surviving.has(building.id)).map(building => building.id);
  if (missing.length !== removed.size || missing.some(id => !removed.has(id)))
    throw Error('Candidate removals differ from the reviewed removal set.');
  const violation = yield* iterateLareGroupPreservation(original, candidate, draft, choices, budget, removed);
  if (violation) throw Error(violation.message);
  const { emit, items } = riReporter(), spend = riBudget();
  const context = {
    roadIds: draft.changedRoadIds, junctionIds: draft.proposedNodes.map(node => node.id),
    changedBlockIds: blocks, acceptedValid: true,
  };
  yield* LARE_CONSTRAINTS.landDependencies.iterate(candidate.city, candidate.city, context, emit, spend, original.city);
  LARE_CONSTRAINTS.infrastructure.check(original.city, candidate.city, context, emit, spend);
  const blocking = items().find(issue => issue.severity !== 'info' && issue.code !== 'frontage-geometry' &&
    !(issue.kind === 'plot' && issue.code === 'property-containment'));
  if (blocking) throw Error(blocking.message);
  yield* LARE_CONSTRAINTS.storedProject.iterate(candidate);
}

export function verifyLareDemolitionDelta(original, candidate, draft, choices, removalIds) {
  finishLareSteps(lareRequireDemolitionDelta(original, candidate, draft, choices, removalIds, createLareBudget()));
}

function* lareRemoveForTrial(project, ids, budget) {
  const removed = new Set(ids);
  const city = yield* cloneLareCity(project.city, structuredClone);
  const reduced = { ...structuredClone({ ...project, city: null }), city };
  reduced.city.buildings = reduced.city.buildings.filter(building => {
    budget.spend();
    return !removed.has(building.id);
  });
  const plots = riIndex(reduced.city.plots);
  for (const property of reduced.city.properties) {
    yield { stage: 'demolition-membership' };
    budget.spend(1 + property.buildingIds.length);
    const surviving = property.buildingIds.filter(id => !removed.has(id));
    if (surviving.length === property.buildingIds.length) continue;
    property.buildingIds = surviving;
    stampRoadGenerated(property, property.plotIds.map(id => plots.get(id)));
  }
  yield* LARE_CONSTRAINTS.storedProject.iterate(reduced);
  return reduced;
}

function lareDemolitionSubsets(eligible, issues, changedRoads, depth, deeper, lastRejectedCandidate) {
  const hints = new Map();
  for (const issue of [...issues, ...(lastRejectedCandidate ? [lastRejectedCandidate] : [])]) {
    const ids = new Set([issue.id, ...(issue.relatedIds ?? [])]);
    for (const id of ids) {
      const weight = eligible.has(id) ? 100 : 10;
      hints.set(id, (hints.get(id) ?? 0) + weight);
    }
  }
  const largest = [...eligible.values()].sort((a, b) => b.area - a.area || riCompare(a.id, b.id));
  const weight = building => (hints.get(building.id) ?? 0) + (hints.get(building.propertyId) ?? 0) +
    Number(changedRoads.includes(building.frontageRoadId));
  const obstruction = largest.slice().sort((a, b) => weight(b) - weight(a) || b.area - a.area || riCompare(a.id, b.id));
  const subsets = [];
  if (!deeper) {
    for (const building of obstruction.slice(0, 4)) subsets.push([building.id]);
    const pairs = obstruction.slice(0, 4);
    for (let first = 0; first < pairs.length; first++) {
      for (let second = first + 1; second < pairs.length; second++) {
        subsets.push([pairs[first].id, pairs[second].id]);
      }
    }
  }
  const start = deeper ? LARE_DEMOLITION_LIMITS.depth + 1 : 2;
  for (let count = start; count <= depth; count++) {
    for (const ordered of [obstruction, largest]) {
      if (count < ordered.length) subsets.push(ordered.slice(0, count).map(building => building.id));
    }
  }
  return subsets.map(ids => ids.sort(riCompare));
}

function lareDemolitionCompare(first, second) {
  for (let i = 0; i < first.score.length; i++) {
    const order = riCompare(first.score[i], second.score[i]);
    if (order) return order;
  }
  return riCompare(first.key, second.key);
}

function lareDemolitionIsCurrent(state, project, revision) {
  return state.project === project && state.revision === revision &&
    state.fingerprint === JSON.stringify(project);
}

// Called by an explicit Explore action. The returned handle keeps the search
// capabilities and mutable budget private to this accepted revision and intent.
export function createLareDemolitionSession(...args) {
  return finishLareSteps(iterateLareDemolitionSession(...args));
}

export function* iterateLareDemolitionSession(project, { selectedRoadIds, offset, parcelChoices = new Map(), revision }, preservation) {
  if (!Number.isSafeInteger(revision) || revision < 0 || !preservation ||
      preservation.candidateProject || !preservation.unresolved?.some(issue =>
        ['lare-work-limit', 'lare-search-exhausted'].includes(issue.code)) ||
      !riEqual(selectedRoadIds, preservation.selectedRoadIds) || !riEqual(offset, preservation.offset))
    throw Error('A current preservation refusal is required before exploring demolition.');
  const draft = yield* iterateRoadGroupIntentB1(project, selectedRoadIds, offset);
  if (!draft.draftable || !draft.topologyResolved || !draft.facesResolved || draft.status === 'unchanged' ||
      draft.issues.some(issue => issue.code === 'boundary-escape'))
    throw Error('Demolition recovery requires a topology-preserving road translation.');
  const choices = new Map(structuredClone([...parcelChoices]));
  const existing = lareDemolitionRefusals.get(preservation);
  if (existing) {
    const state = lareDemolitionSessions.get(existing);
    if (state.cancelled || !lareDemolitionIsCurrent(state, project, revision) ||
        !riEqual([...choices].sort(), [...state.choices].sort()))
      throw Error('This demolition request has expired. Start a new road preview.');
    return existing;
  }
  const budget = createLareBudget(LARE_DEMOLITION_LIMITS, { ceiling: LARE_DEMOLITION_LIMITS });
  const { eligible, issues } = yield* lareDemolitionScope(project, draft, choices, budget);
  if (!eligible.size) throw Error('No generated buildings are eligible for demolition in this neighborhood.');
  const session = Object.freeze({ eligibleIds: Object.freeze([...eligible.keys()].sort(riCompare)) });
  lareDemolitionSessions.set(session, {
    project, revision, fingerprint: JSON.stringify(project), draft, choices, eligible, issues,
    lastRejectedCandidate: preservation.lare?.lastRejectedCandidate,
    budget, subsetCounts: { normal: 0, deeper: 0 },
    seen: new Set(), best: null, running: false, cancelled: false, completedNormal: false, completedDeeper: false,
  });
  lareDemolitionRefusals.set(preservation, session);
  return session;
}

export function* iterateLareDemolition(session, { deeper = false } = {}) {
  const state = lareDemolitionSessions.get(session);
  if (!state || state.cancelled || state.running || !lareDemolitionIsCurrent(state, state.project, state.revision) ||
      (deeper ? !state.completedNormal || state.completedDeeper : state.completedNormal))
    throw Error('This demolition search is no longer available.');
  state.running = true;
  let tried = 0, exhausted = null;
  try {
    const { draft, eligible, choices, budget } = state;
    const depth = deeper ? LARE_DEMOLITION_LIMITS.deeperDepth : LARE_DEMOLITION_LIMITS.depth;
    const tier = deeper ? 'deeper' : 'normal';
    const subsets = lareDemolitionSubsets(eligible, state.issues, draft.changedRoadIds, depth,
      deeper, state.lastRejectedCandidate);
    for (const ids of subsets) {
      if (state.cancelled) return null;
      if (state.subsetCounts[tier] >= LARE_DEMOLITION_LIMITS.subsets || (state.best && ids.length > state.best.removalIds.length)) break;
      if (budget.snapshot().remainingWork === 0 || budget.snapshot().remainingExpansions === 0) break;
      const key = JSON.stringify(ids);
      if (state.seen.has(key)) continue;
      state.seen.add(key);
      tried++;
      state.subsetCounts[tier]++;
      const subset = createLareBudget(LARE_STRATEGY_LIMITS, { parent: budget });
      yield { stage: 'demolition-subset', tried, removalIds: ids.slice(), stats: budget.snapshot() };
      if (state.cancelled) return null;
      try {
        const reduced = yield* lareRemoveForTrial(state.project, ids, subset);
        const trial = iterateRoadGroupReflowB1(reduced, draft.selectedRoadIds, draft.offset, {
          parcelChoices: choices, acceptedRevision: state.revision, strategy: 'selective-adaptive', sharedBudget: subset,
        });
        let step = trial.next();
        try {
          while (!step.done && !state.cancelled) {
            yield { stage: step.value.stage, tried, stats: budget.snapshot() };
            step = trial.next();
          }
        } finally {
          trial.return();
        }
        if (state.cancelled) return null;
        const preview = step.value;
        if (!preview?.candidateProject) continue;
        yield* lareRequireDemolitionDelta(state.project, preview.candidateProject, draft, choices, ids,
          createLareBudget());
        const area = ids.reduce((total, id) => total + eligible.get(id).area, 0);
        const score = [ids.length, area, ...(preview.lare?.score ?? [0, 0, 0, 0, 0, 0])];
        if (!score.every(value => Number.isFinite(value) && value >= 0)) continue;
        if (!state.best || lareDemolitionCompare({ score, key }, state.best) < 0) {
          state.best = riFreeze({
            removalIds: ids.slice(), score, key, preview,
            relocatedIds: preview.ledger.filter(row => row.kind === 'building' &&
              row.disposition === 'relocated').map(row => row.oldId).sort(riCompare),
          });
        }
      } catch (error) {
        if (error instanceof LareBudgetExceeded) exhausted = error.resource;
        else state.lastRejectedCandidate = { message: error.message, relatedIds: ids };
      }
    }
    if (deeper) state.completedDeeper = true;
    else state.completedNormal = true;
    return Object.freeze({ candidate: state.best, tried, exhausted, stats: budget.snapshot() });
  } finally {
    state.running = false;
  }
}

export function cancelLareDemolition(session) {
  const state = lareDemolitionSessions.get(session);
  if (state) state.cancelled = true;
}

export function authorizeLareDemolition(session, candidate, project, revision) {
  const state = lareDemolitionSessions.get(session);
  if (!state || state.cancelled || state.running || !candidate || state.best !== candidate ||
      !lareDemolitionIsCurrent(state, project, revision)) throw Error('Review the exact current demolition candidate again.');
  const authorization = Object.freeze({});
  lareDemolitionAuthorizations.set(authorization, { state, candidate });
  return authorization;
}

export function validateLareDemolitionAuthorization(authorization, candidate, project, revision,
  { selectedRoadIds, offset, parcelChoices = new Map() }) {
  const receipt = lareDemolitionAuthorizations.get(authorization);
  if (!receipt || receipt.state.cancelled || receipt.state.running ||
      candidate !== receipt.candidate || receipt.state.best !== candidate ||
      !lareDemolitionIsCurrent(receipt.state, project, revision) ||
      !riEqual(selectedRoadIds, receipt.state.draft.selectedRoadIds) || !riEqual(offset, receipt.state.draft.offset) ||
      !riEqual([...parcelChoices].sort(), [...receipt.state.choices].sort()))
    throw Error('Demolition authorization is stale or does not match the reviewed candidate.');
  const { draft, choices } = receipt.state;
  verifyLareDemolitionDelta(project, candidate.preview.candidateProject, draft, choices, candidate.removalIds);
  return candidate.preview;
}
