import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const baseline = 'e5f1cf83dcdcc75e52911aa717035955b40569d0';
const keyOf = row => JSON.stringify([row.projectId, row.roadIds, row.offset.x, row.offset.y]);
const evidence = new URL('../docs/plans/0.2x/milestones/b1r-research/evidence/', import.meta.url);
const files = await readdir(evidence);

async function readArchive(prefix) {
  const archive = new Map();
  for (const name of files.filter(name => name.startsWith(prefix) && name.endsWith('.jsonl'))) {
    const raw = await readFile(new URL(name, evidence), 'utf8');
    for (const line of raw.trimEnd().split('\n')) {
      const row = JSON.parse(line);
      const key = keyOf(row);
      assert.ok(!archive.has(key), 'Duplicate archived movement: ' + key);
      archive.set(key, row);
    }
  }
  assert.equal(archive.size, 800);
  return archive;
}

async function readReplay(directories) {
  const rows = new Map();
  for (const directory of directories) {
    const report = JSON.parse(await readFile(join(directory, 'comparison.json'), 'utf8'));
    assert.equal(report.baseline, baseline);
    assert.equal(report.strategy, null, 'Expected the production configuration');
    assert.equal(report.summary.invalid, 0);
    assert.equal(report.summary.regressed, 0);
    assert.equal(report.summary.attempted, report.rows.length);
    for (const row of report.rows) {
      const key = keyOf(row);
      assert.ok(!rows.has(key), 'Duplicate replay movement: ' + key);
      assert.equal(row.invalid, null, key);
      rows.set(key, row);
    }
  }
  assert.equal(rows.size, 800);
  return rows;
}

const args = process.argv.slice(2);
const split = args.indexOf('--repeat');
assert.ok(split > 0 && split < args.length - 1,
  'Usage: node scripts/lare-preservation-acceptance.mjs FIRST_CORPUS_DIR [...] --repeat REPEAT_CORPUS_DIR [...]');
const [selective, enhanced, first, repeat] = await Promise.all([
  readArchive('selective-'), readArchive('combined-'),
  readReplay(args.slice(0, split)), readReplay(args.slice(split + 1)),
]);
const totals = { movements: first.size, accepted: 0, baselineRetained: 0, selectiveRetained: 0,
  enhancedGains: 0, selectiveRegressionsResolved: 0, witnessedRefusals: 0, witnessedRefusalsRecovered: 0 };
for (const [key, row] of first) {
  const selected = selective.get(key), combined = enhanced.get(key), rerun = repeat.get(key);
  for (const reference of [selected, combined, rerun]) {
    assert.ok(reference, 'Reference movement missing: ' + key);
    assert.equal(row.fingerprint, reference.fingerprint, key);
    assert.equal(row.baselineAccepted, reference.baselineAccepted, key);
  }
  assert.equal(row.accepted, rerun.accepted, key);
  assert.equal(row.candidateFingerprint, rerun.candidateFingerprint, key);
  if (row.accepted) totals.accepted++;
  if (row.baselineAccepted || selected.accepted || combined.accepted) {
    assert.ok(row.accepted, 'A previously witnessed preservation solution was refused: ' + key);
  }
  if (row.baselineAccepted) totals.baselineRetained++;
  if (selected.accepted) totals.selectiveRetained++;
  if (combined.accepted && !selected.accepted) totals.enhancedGains++;
  if (selected.accepted && !combined.accepted) totals.selectiveRegressionsResolved++;
  if (!row.baselineAccepted && (selected.accepted || combined.accepted)) {
    const witness = selected.accepted ? selected : combined;
    assert.ok(witness.candidateFingerprint && !witness.invalid, 'Missing valid archived witness: ' + key);
    totals.witnessedRefusals++;
    if (row.accepted) totals.witnessedRefusalsRecovered++;
  }
}
assert.equal(totals.baselineRetained, 470);
assert.equal(totals.selectiveRetained, 607);
assert.equal(totals.enhancedGains, 20);
assert.equal(totals.selectiveRegressionsResolved, 2);
assert.ok(totals.accepted >= 627);
assert.ok(totals.witnessedRefusals >= 40);
assert.ok(totals.witnessedRefusalsRecovered >= Math.ceil(totals.witnessedRefusals / 2));
console.log('LARE_PRESERVATION_ACCEPTANCE ' + JSON.stringify(totals));
