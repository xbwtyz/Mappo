import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/city-model.js';
import { prepareRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { stampRoadGenerated } from '../src/core/road-provenance.js';
import { createLareBudget, LARE_DEMOLITION_LIMITS } from '../src/core/reconciliation-budget.js';
import { createLareDemolitionSession, iterateLareDemolition, cancelLareDemolition,
  authorizeLareDemolition, verifyLareDemolitionDelta } from '../src/core/reconciliation-demolition.js';
import { validateRoadGroupApplyB1, validateRoadGroupDemolitionApplyB1R } from '../src/editor/road-application.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { defaultWorkspace } from '../src/data/project-format.js';

const intent = { selectedRoadIds: ['RD-0174', 'RD-0252'], offset: { x: 4, y: 3 }, revision: 5 };
const witness = 'BLD-00153';
let cached;

function readSearch(iterator) {
  const subsets = [];
  for (;;) {
    const step = iterator.next();
    if (step.done) return { ...step.value, subsets };
    if (step.value.stage === 'demolition-subset') subsets.push(step.value.removalIds);
  }
}

function fixture() {
  if (cached) return cached;
  const project = createProject({ seed: 'lare-linear-2', morphology: 'linear', size: 'small', irregularProperties: true });
  const workspace = defaultWorkspace(project);
  const before = JSON.stringify(project);
  const preservation = prepareRoadGroupReflowB1(project, intent.selectedRoadIds, intent.offset);
  assert.equal(preservation.candidateProject, null);
  const session = createLareDemolitionSession(project, intent, preservation);
  const search = readSearch(iterateLareDemolition(session));
  assert.ok(search.candidate);
  const draft = prepareRoadGroupIntentB1(project, intent.selectedRoadIds, intent.offset);
  const auth = authorizeLareDemolition(session, search.candidate, project, intent.revision);
  return cached = { project, workspace, before, preservation, session, search, draft, auth };
}

test('Demolition search returns the exact known single-building witness', () => {
  const { project, before, search } = fixture();
  assert.deepEqual(search.candidate.removalIds, [witness]);
  assert.equal(JSON.stringify(project), before);
  assert.ok(Object.isFrozen(search.candidate.preview.candidateProject));
  assert.equal(search.candidate.score[0], 1);
});

test('Exploration requires a completed preservation refusal for this exact road intent', () => {
  const { project, search, preservation } = fixture();
  assert.throws(() => createLareDemolitionSession(project, intent, search.candidate.preview), /preservation refusal/i);
  assert.throws(() => createLareDemolitionSession(project, { ...intent, offset: { x: 0, y: 1 } }, preservation),
    /preservation refusal/i);
});

test('Requesting the same refusal twice reuses the private demolition session', () => {
  const { project, preservation, session } = fixture();
  assert.equal(createLareDemolitionSession(project, intent, preservation), session);
  assert.throws(() => createLareDemolitionSession(project, { ...intent, revision: 6 }, preservation), /expired/i);
});

test('Ordinary Apply cannot commit a destructive preview', () => {
  const { project, workspace, search } = fixture();
  assert.equal(validateRoadGroupApplyB1(project, workspace, intent, search.candidate.preview).ok, false);
});

for (const [name, tamper] of [
  ['missing authorization', args => { args[4] = undefined; }],
  ['fabricated authorization', args => { args[4] = {}; }],
  ['candidate clone', args => { args[3] = structuredClone(args[3]); }],
  ['different removal set', args => { args[3] = { ...args[3], removalIds: ['BLD-00155'] }; }],
  ['different road offset', args => { args[2] = { ...intent, offset: { x: 5, y: 3 } }; }],
  ['different road selection', args => { args[2] = { ...intent, selectedRoadIds: ['RD-0174'] }; }],
  ['different parcel choices', args => { args[2] = { ...intent, parcelChoices: new Map([['P', { kind: 'keep' }]]) }; }],
  ['stale project revision', args => { args[2] = { ...intent, revision: intent.revision + 1 }; }],
  ['different project instance', args => { args[0] = structuredClone(args[0]); }],
]) {
  test('Demolition Apply refuses ' + name, () => {
    const { project, workspace, search, auth, before } = fixture();
    const args = [project, workspace, intent, search.candidate, auth];
    tamper(args);
    const result = validateRoadGroupDemolitionApplyB1R(...args);
    assert.equal(result.ok, false);
    assert.equal(result.issues[0].code, 'demolition-validation');
    assert.equal(JSON.stringify(project), before);
  });
}

for (const [name, modify] of [
  ['authored building', project => { project.city.buildings.find(row => row.id === witness).customName = 'My shop'; }],
  ['authored parent', project => {
    const building = project.city.buildings.find(row => row.id === witness);
    project.city.properties.find(row => row.id === building.propertyId).customName = 'My parcel';
  }],
  ['opaque building metadata', project => {
    const building = project.city.buildings.find(row => row.id === witness);
    building.unknownCoordinates = { x: 1, y: 1 };
    stampRoadGenerated(building);
  }],
  ['unrecognized reference', project => { project.unknownExtension = { buildingIds: [witness] }; }],
]) {
  test('Independent demolition comparison protects ' + name, () => {
    const { project, search, draft } = fixture();
    const modified = structuredClone(project);
    modify(modified);
    assert.throws(() => verifyLareDemolitionDelta(modified, search.candidate.preview.candidateProject, draft,
      new Map(), [witness]), /protected|eligible/i);
  });
}

test('Independent gate rejects duplicate IDs and unreviewed record deletion', () => {
  const { project, search, draft } = fixture();
  const candidate = search.candidate.preview.candidateProject;
  assert.throws(() => verifyLareDemolitionDelta(project, candidate, draft, new Map(), [witness, witness]), /duplicates/i);
  const tampered = structuredClone(candidate);
  tampered.city.buildings.shift();
  assert.throws(() => verifyLareDemolitionDelta(project, tampered, draft, new Map(), [witness]), /differ/i);
});

test('Independent gate rejects altered protected city records', () => {
  const { project, search, draft } = fixture();
  const tampered = structuredClone(search.candidate.preview.candidateProject);
  tampered.city.roads[0].unknownExtension = 'changed';
  assert.throws(() => verifyLareDemolitionDelta(project, tampered, draft, new Map(), [witness]), /protected|unrelated/i);
});

test('Independent gate rejects an invalid surviving footprint with the reviewed removals intact', () => {
  const { project, search, draft, before } = fixture();
  const tampered = structuredClone(search.candidate.preview.candidateProject);
  tampered.city.buildings[0].x = Infinity;
  assert.throws(() => verifyLareDemolitionDelta(project, tampered, draft, new Map(), [witness]));
  assert.equal(JSON.stringify(project), before);
});

test('Reviewed demolition Apply allows exact canonical history replay', () => {
  const { project, workspace, search, auth, before } = fixture();
  const receipt = validateRoadGroupDemolitionApplyB1R(project, workspace, intent, search.candidate, auth);
  assert.ok(receipt.ok, JSON.stringify(receipt.issues));
  const removed = project.city.buildings.filter(building =>
    !receipt.candidate.city.buildings.some(survivor => survivor.id === building.id)).map(building => building.id);
  assert.deepEqual(removed, search.candidate.removalIds);
  assert.equal(JSON.stringify(receipt.candidate), JSON.stringify(search.candidate.preview.candidateProject));
  const history = new AcceptedEditHistoryD01();
  history.clear(project);
  assert.equal(history.record(project, receipt.candidate, receipt.transaction).status, 'recorded');
  const undo = history.prepare('undo', receipt.candidate, receipt.workspace);
  assert.ok(undo.ok, undo.reason);
  assert.equal(JSON.stringify(undo.candidate), before);
  history.accept('undo', undo.entry, undo.candidate);
  const redo = history.prepare('redo', undo.candidate, undo.workspace);
  assert.ok(redo.ok, redo.reason);
  assert.deepEqual(redo.candidate, receipt.candidate);
  assert.equal(JSON.stringify(project), before);
});

test('Demolition subsets are unique and deeper exploration carries the operation ledger', () => {
  const { search, session } = fixture();
  const deeper = readSearch(iterateLareDemolition(session, { deeper: true }));
  const all = [...search.subsets, ...deeper.subsets].map(ids => JSON.stringify(ids));
  assert.equal(new Set(all).size, all.length);
  assert.ok(search.subsets.length <= LARE_DEMOLITION_LIMITS.subsets);
  assert.ok(deeper.stats.work >= search.stats.work && deeper.stats.work <= LARE_DEMOLITION_LIMITS.work);
  assert.ok(deeper.stats.expansions >= search.stats.expansions &&
    deeper.stats.expansions <= LARE_DEMOLITION_LIMITS.stateExpansions);
});

test('Nested budget charges cannot exceed their parent or silently reset', () => {
  const parent = createLareBudget({ work: 5, stateExpansions: 2 });
  const first = createLareBudget({ work: 4, stateExpansions: 2 }, { parent });
  first.spend(2);
  first.expand();
  const second = createLareBudget({ work: 4, stateExpansions: 2 }, { parent });
  second.expand();
  second.spend();
  assert.throws(() => second.expand(), /stateExpansions budget/);
  assert.throws(() => first.spend(), /work budget/);
  assert.equal(parent.snapshot().work, 5);
  assert.equal(parent.snapshot().expansions, 2);
  assert.equal(first.snapshot().work, 3);
  assert.equal(second.snapshot().work, 2);
});

test('Cancelling the search invalidates authorization without accepted writes', () => {
  const { project, workspace, session, search, auth, before } = fixture();
  cancelLareDemolition(session);
  assert.throws(() => authorizeLareDemolition(session, search.candidate, project, intent.revision), /review/i);
  assert.equal(validateRoadGroupDemolitionApplyB1R(project, workspace, intent, search.candidate, auth).ok, false);
  assert.equal(JSON.stringify(project), before);
});

test('Cancelling an in-progress removal trial prevents candidate publication and retry', () => {
  const project = structuredClone(fixture().project);
  const before = JSON.stringify(project);
  const refusal = prepareRoadGroupReflowB1(project, intent.selectedRoadIds, intent.offset);
  const session = createLareDemolitionSession(project, intent, refusal);
  const trial = iterateLareDemolition(session);
  assert.equal(trial.next().value.stage, 'demolition-subset');
  assert.equal(trial.next().done, false);
  cancelLareDemolition(session);
  assert.equal(trial.return().done, true);
  assert.throws(() => iterateLareDemolition(session).next(), /no longer available/i);
  assert.equal(JSON.stringify(project), before);
});
