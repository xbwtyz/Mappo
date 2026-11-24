// Detached experiment only: production src and compiled files are never changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const roadIds = ['RD-0184', 'RD-0186'];
const baseOffset = { x: -3.005274072121821, y: -37.39896113564458 };
const scales = [1, .75, .5, .25, .125, .025, -.25, -.5, -1];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function patchOnce(source, marker, replacement) {
  assert.equal(source.split(marker).length, 2, 'Research patch must match exactly once');
  return source.replace(marker, replacement);
}

async function experiment(variant, t) {
  const dir = await mkdtemp(join(tmpdir(), 'mappo-parcel-research-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(new URL('../src/', import.meta.url), join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const path = join(dir, 'src/core/reconciliation-parcels.js');
  const original = await readFile(path, 'utf8');
  // Add a bounded wide-frontage family to the existing enhanced rigid pass.
  // Same authoritative validators, same retained inventory cap (24), same
  // global operation limits. Fixed/opaque content cannot use the added tier.
  const family = variant === 'wide-diverse'
    ? "'wide-' + position + '-' + (ratio < .65 ? 'shallow' : 'deep')"
    : "'wide-frontage'";
  const marker = '  }\n  return found.sort(lareParcelCmp);';
  const addition = [
    '    if (mode === "adaptive" && !fixedRings.length) {',
    '      attemptLimit = attempts + 120;',
    '      for (const front of frontValues) {',
    '        for (const fraction of [.5, .75, 1]) {',
    '          const span = Math.max(minimumWidth, usableWidth * fraction);',
    '          if (span > length) continue;',
    '          for (let position = 0; position <= 4; position++) {',
    '            const start = (length - span) * position / 4;',
    '            for (const ratio of [.35, .55, .75, 1]) {',
    '              yield* affine(' + family + ', start, start + span, front, front + Math.max(2, oldDepth * ratio));',
    '            }',
    '          }',
    '        }',
    '      }',
    '    }',
  ].join('\n');
  await writeFile(path, patchOnce(original, marker, addition + '\n' + marker));
  const load = name => import(pathToFileURL(join(dir, 'src', name)).href);
  const [{ createProject }, { iterateRoadGroupReflowB1 }, { validateStoredProject },
    { prepareRoadGroupIntentB1 }, { verifyLareGroupPreservation }, { createLareBudget }] =
    await Promise.all(['core/city-model.js','core/neighborhood-reflow.js','data/project-validation.js',
      'core/road-intent-c1.js','core/reconciliation-preservation.js','core/reconciliation-budget.js'].map(load));

  const summary = { variant, attempted: 0, accepted: 0, recovered: 0, regressed: 0, invalid: 0 };
  for (const irregularProperties of [false, true]) {
    const project = createProject({ seed: 'mappo-001', size: 'medium', morphology: 'organic',
      shapeOptions: { profile: 'balanced', stretch: 30, asymmetry: 58, bend: 44 }, irregularProperties });
    validateStoredProject(project);
    const before = hash(project);
    for (const scale of scales) {
      const offset = { x: baseOffset.x * scale, y: baseOffset.y * scale };
      const replay = () => {
        const iterator = iterateRoadGroupReflowB1(project, roadIds, offset);
        const stages = {};
        let step;
        while (!(step = iterator.next()).done) {
          const stage = step.value?.stage ?? 'other';
          stages[stage] = (stages[stage] ?? 0) + 1;
        }
        const result = step.value;
        assert.equal(hash(project), before, 'Accepted city mutated');
        if (result.candidateProject) {
          try {
            validateStoredProject(result.candidateProject);
            assert.deepEqual(result.candidateProject.city.buildings.map(b => b.id), project.city.buildings.map(b => b.id));
            const draft = prepareRoadGroupIntentB1(project, roadIds, offset);
            assert.equal(verifyLareGroupPreservation(project, result.candidateProject, draft, new Map(), createLareBudget()), null);
          } catch (error) {
            summary.invalid++;
            throw error;
          }
        }
        return { accepted: Boolean(result.candidateProject), validation: result.validation,
          issues: (result.unresolved ?? []).map(i => i.code),
          stats: result.lare?.operationStats ?? null, stages,
          candidateFingerprint: result.candidateProject ? hash(result.candidateProject) : null };
      };
      const result = replay();
      if (result.accepted) assert.deepEqual(replay(), result, 'Recovered witness was not deterministic');
      summary.attempted++;
      if (result.accepted) summary.accepted++;
      if (result.accepted && scale !== .025) summary.recovered++;
      if (!result.accepted && scale === .025) summary.regressed++;
      console.log('PARCEL_VARIANT_CASE ' + JSON.stringify({ variant, irregularProperties, scale,
        accepted: result.accepted, validation: result.validation, issues: result.issues, stats: result.stats,
        parcelAttempts: result.stages['parcel-candidate'] ?? 0, buildingAttempts: result.stages['building-placement'] ?? 0,
        fingerprint: result.candidateFingerprint }));
    }
  }
  console.log('PARCEL_VARIANT_SUMMARY ' + JSON.stringify(summary));
  assert.equal(summary.regressed, 0, 'Known baseline successes lost');
  assert.equal(summary.invalid, 0);
}
for (const variant of ['wide-ranked', 'wide-diverse'])
  test('detached compression experiment: ' + variant, { timeout: 300000 }, t => experiment(variant, t));
