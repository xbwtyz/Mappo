import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { prepareRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import {
  authorizeLareDemolition,
  createLareDemolitionSession,
  iterateLareDemolition,
  verifyLareDemolitionDelta,
} from '../src/core/reconciliation-demolition.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import {
  createProjectDocument,
  decodeProjectDocument,
  defaultWorkspace,
  encodeProjectDocument,
} from '../src/data/project-format.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { validateRoadGroupDemolitionApplyB1R } from '../src/editor/road-application.js';

const caseKey = row => JSON.stringify([row.projectId, row.roadIds, row.offset.x, row.offset.y]);
const fingerprint = raw => createHash('sha256').update(raw).digest('hex');

async function loadWitnesses() {
  const evidence = new URL('../docs/plans/0.2x/milestones/b1r-research/evidence/', import.meta.url);
  const files = (await readdir(evidence)).filter(name => name.endsWith('.jsonl')).sort();
  const read = async name => (await readFile(new URL(name, evidence), 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
  const preserved = new Set();
  for (const name of files.filter(name => /^(selective|combined)-/.test(name))) {
    for (const row of await read(name)) {
      if (row.accepted) preserved.add(caseKey(row));
    }
  }
  assert.equal(preserved.size, 627);

  const witnesses = new Map();
  for (const prefix of ['demolition-', 'parcel-compact-', 'cooperative-results-']) {
    for (const name of files.filter(name => name.startsWith(prefix))) {
      for (const row of await read(name)) {
        const key = caseKey(row);
        if (!row.best || row.best.accepted === false || preserved.has(key) || witnesses.has(key)) continue;
        assert.ok(row.best.removed.length > 0, key);
        witnesses.set(key, row);
      }
    }
  }
  assert.equal(witnesses.size, 141);
  return witnesses;
}

function drainSearch(session, options) {
  const search = iterateLareDemolition(session, options);
  const subsets = [];
  let step = search.next();
  while (!step.done) {
    if (step.value.stage === 'demolition-subset') subsets.push(step.value.removalIds);
    step = search.next();
  }
  return { ...step.value, subsets };
}

function verifyAccepted(project, intent, workspace, session, reviewed) {
  const authorization = authorizeLareDemolition(session, reviewed, project, intent.revision);
  assert.equal(validateRoadGroupDemolitionApplyB1R(project, workspace, intent, reviewed, undefined).ok, false);
  const receipt = validateRoadGroupDemolitionApplyB1R(project, workspace, intent, reviewed, authorization);
  assert.ok(receipt.ok, JSON.stringify(receipt.issues));
  assert.equal(JSON.stringify(receipt.candidate), JSON.stringify(reviewed.preview.candidateProject));
  validateStoredProject(receipt.candidate);
  const draft = prepareRoadGroupIntentB1(project, intent.selectedRoadIds, intent.offset);
  verifyLareDemolitionDelta(project, receipt.candidate, draft, new Map(), reviewed.removalIds);

  const survivors = new Set(receipt.candidate.city.buildings.map(building => building.id));
  const removed = project.city.buildings.filter(building => !survivors.has(building.id)).map(building => building.id).sort();
  assert.deepEqual(removed, reviewed.removalIds);
  assert.deepEqual(receipt.ledger.filter(row => row.disposition === 'demolished').map(row => row.oldId), removed);
  const reopened = decodeProjectDocument(encodeProjectDocument(createProjectDocument(receipt.candidate, receipt.workspace)));
  assert.equal(JSON.stringify(reopened.project), JSON.stringify(receipt.candidate));
  assert.equal(JSON.stringify(reopened.workspace), JSON.stringify(receipt.workspace));

  const history = new AcceptedEditHistoryD01();
  history.clear(project);
  assert.equal(history.record(project, receipt.candidate, receipt.transaction).status, 'recorded');
  const undo = history.prepare('undo', receipt.candidate, receipt.workspace);
  assert.ok(undo.ok, undo.reason);
  assert.equal(JSON.stringify(undo.candidate), JSON.stringify(project));
  history.accept('undo', undo.entry, undo.candidate);
  const redo = history.prepare('redo', undo.candidate, undo.workspace);
  assert.ok(redo.ok, redo.reason);
  assert.equal(JSON.stringify(redo.candidate), JSON.stringify(receipt.candidate));
  history.accept('redo', redo.entry, redo.candidate);
}

const directories = process.argv.slice(2);
const witnesses = await loadWitnesses();
assert.ok(directories.length, 'Usage: node scripts/lare-demolition-acceptance.mjs CORPUS_DIRECTORY [...]');
const attempted = new Set();
const summary = { attempted: 0, recovered: 0, preservation: 0, ineligible: 0, exhausted: 0 };
for (const directory of directories) {
  const corpus = JSON.parse(await readFile(join(directory, 'baseline.json'), 'utf8'));
  assert.equal(corpus.baseline, 'e5f1cf83dcdcc75e52911aa717035955b40569d0');
  for (const entry of corpus.projects) {
    const rows = corpus.rows.filter(row => row.projectId === entry.projectId && witnesses.has(caseKey(row)));
    if (!rows.length) continue;
    const raw = (await readFile(join(directory, 'projects', entry.projectId + '.json'), 'utf8')).trimEnd();
    assert.equal(fingerprint(raw), entry.fingerprint);
    const project = JSON.parse(raw);
    const workspace = defaultWorkspace(project);
    validateStoredProject(project);

    for (const row of rows) {
      const key = caseKey(row);
      const witness = witnesses.get(key);
      assert.ok(!attempted.has(key), key);
      attempted.add(key);
      assert.equal(row.fingerprint, witness.fingerprint, key);
      assert.equal(row.fingerprint, entry.fingerprint, key);
      assert.equal(row.accepted, false, key);
      const intent = { selectedRoadIds: row.roadIds, offset: row.offset, revision: 1 };
      const start = performance.now();
      const preservation = prepareRoadGroupReflowB1(project, intent.selectedRoadIds, intent.offset);
      const result = { projectId: row.projectId, roadIds: row.roadIds, offset: row.offset,
        fingerprint: row.fingerprint, researchRemovals: witness.best.removed,
        controlIssues: preservation.unresolved.map(issue => issue.code) };
      let session;
      if (preservation.candidateProject) {
        result.outcome = 'preservation';
      } else {
        try {
          session = createLareDemolitionSession(project, intent, preservation);
        } catch (error) {
          if (![
            'A current preservation refusal is required before exploring demolition.',
            'Demolition recovery requires a topology-preserving road translation.',
            'No generated buildings are eligible for demolition in this neighborhood.',
          ].includes(error.message)) throw error;
          result.outcome = 'ineligible';
          result.reason = error.message;
        }
      }
      if (session) {
        const normal = drainSearch(session);
        const deeper = !normal.candidate && session.eligibleIds.length > 8 &&
          normal.stats.remainingWork > 0 && normal.stats.remainingExpansions > 0
          ? drainSearch(session, { deeper: true }) : null;
        const reviewed = deeper?.candidate ?? normal.candidate;
        const subsets = [...normal.subsets, ...(deeper?.subsets ?? [])];
        result.outcome = reviewed ? 'recovered' : 'exhausted';
        result.eligible = session.eligibleIds.length;
        result.researchRemovalsEligible = witness.best.removed.every(id => session.eligibleIds.includes(id));
        result.subsets = subsets;
        result.searchedDeeper = Boolean(deeper);
        result.stats = (deeper ?? normal).stats;
        if (reviewed) {
          verifyAccepted(project, intent, workspace, session, reviewed);
          result.removals = reviewed.removalIds;
          result.candidateFingerprint = fingerprint(JSON.stringify(reviewed.preview.candidateProject));
        }
      }
      assert.equal(JSON.stringify(project), raw, 'Accepted input mutated: ' + key);
      summary.attempted++;
      summary[result.outcome]++;
      console.log('LARE_DEMOLITION_CASE ' + JSON.stringify({ ...result, elapsedMs: performance.now() - start }));
    }
  }
}
console.log('LARE_DEMOLITION_SUMMARY ' + JSON.stringify(summary));
if (attempted.size === witnesses.size) assert.ok(summary.recovered >= 71, 'Demolition acceptance target is 71/141');
