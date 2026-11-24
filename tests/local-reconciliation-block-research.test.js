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
  const family = true
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
  const arrangementPath = join(dir, 'src/core/reconciliation-arrangement.js');
  const arrangement = await readFile(arrangementPath, 'utf8');
  const researchSolver = "  // Detached block decomposition: all results remain proposals until the\n  // original whole-project finalizer independently validates their union.\n  if (enhanced && entries.some(e => e.buildings.some(b => b.permission.mode === 'rigid'))) {\n    const groups = new Map();\n    for (const id of variables) {\n      const block = byVariable.get(id).entry.property.blockId;\n      if (!groups.has(block)) groups.set(block, []);\n      groups.get(block).push(id);\n    }\n    const proposals = [];\n    let refused = false;\n    const report = (status, exhausted = null) => ({status,best:verifiedIncumbent,\n      stage:0,complete:verifiedIncumbent?1:0,stats:budget.snapshot(),exhausted});\n    try {\n      for (const [block, ids] of groups) {\n        const empty = ids.filter(id => id.startsWith('property:') &&\n          !parcelCandidates.get(byVariable.get(id).entry.property.id).length);\n        if (empty.length) {\n          refused = true;\n          yield {stage:'block-result',block,method:METHOD,status:'empty-inventory',empty,depth:0,total:ids.length,expansions:0};\n          continue;\n        }\n        let used=0, deepest=0, blocked=null;\n        const limited = {spend:n=>budget.spend(n),snapshot:()=>budget.snapshot(),expand(){\n          if(used>=2048)throw new LareBudgetExceeded('block-expansions');\n          budget.expand();used++;\n        }};\n        let local=null, failure=null;\n        if (METHOD === 'block-beam') {\n          const outcome = yield* iterateLareSearch({variables:ids,choices,compatible,\n            finalize:row=>row},limited);\n          local=outcome.best;\n          deepest=outcome.stage;\n          failure=outcome.exhausted??null;\n          if (!local) blocked=ids[Math.min(deepest,ids.length-1)];\n        } else {\n          function* visit(depth,row) {\n            if(depth>deepest){deepest=depth;blocked=null;}\n            if(depth===ids.length)return row;\n            const id=ids[depth], options=yield* choices(id,row);\n            const ordered=options.slice().sort((a,b)=>compareLareScore(a.score,b.score)||lareArrangeCompare(a.key,b.key));\n            let progressed=false;\n            for(const choice of ordered){\n              limited.expand();\n              if(!(yield* compatible(id,choice,row)))continue;\n              progressed=true;\n              const next={assignments:[...row.assignments,{variable:id,choice}],\n                score:row.score.map((n,i)=>n+choice.score[i]),key:row.key+JSON.stringify([id,choice.key])+';'};\n              yield {stage:'block-backtrack',id,depth,stats:budget.snapshot()};\n              const child=yield* visit(depth+1,next);\n              if(child)return child;\n            }\n            if(!progressed&&depth>=deepest)blocked=id;\n            return null;\n          }\n          try{local=yield* visit(0,{assignments:[],score:[0,0,0,0,0,0],key:''});}\n          catch(error){if(!(error instanceof LareBudgetExceeded))throw error;failure=error.resource;}\n        }\n        yield {stage:'block-result',block,method:METHOD,status:local?'proposal':failure?'limited':'exhausted',\n          depth:deepest,total:ids.length,blocked,expansions:used,exhausted:failure};\n        if(local)proposals.push(local);else refused=true;\n        if(failure&&failure!=='block-expansions')return report(verifiedIncumbent?'candidate':'work-limit',failure);\n      }\n      if(!refused&&proposals.length===groups.size){\n        const combined={assignments:proposals.flatMap(r=>r.assignments),\n          score:proposals.reduce((sum,r)=>sum.map((v,i)=>v+r.score[i]),[0,0,0,0,0,0]),\n          key:proposals.map(r=>r.key).join('')};\n        const candidate=yield* lareStepResult(finalizeState(combined));\n        yield {stage:'block-union',accepted:Boolean(candidate)};\n        if(candidate&&(!verifiedIncumbent||compareLareScore(candidate.score,verifiedIncumbent.score)<0||\n          (compareLareScore(candidate.score,verifiedIncumbent.score)===0&&candidate.key<verifiedIncumbent.key)))verifiedIncumbent=candidate;\n      }\n      return report(verifiedIncumbent?'candidate':'search-exhausted');\n    } catch(error) {\n      if(!(error instanceof LareBudgetExceeded))throw error;\n      return report(verifiedIncumbent?'candidate':'work-limit',error.resource);\n    }\n  }\n".replaceAll('METHOD', JSON.stringify(variant));
  const solverMarker = '  // Try the first fully compatible arrangement';
  await writeFile(arrangementPath, patchOnce(arrangement, solverMarker, researchSolver + solverMarker));
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
        const stages = {}, blocks = [], unions = [];
        let step;
        while (!(step = iterator.next()).done) {
          const stage = step.value?.stage ?? 'other';
          if (stage === 'block-result') blocks.push(step.value);
          if (stage === 'block-union') unions.push(step.value.accepted);
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
          stats: result.lare?.operationStats ?? null, stages, blocks, unions,
          candidateFingerprint: result.candidateProject ? hash(result.candidateProject) : null };
      };
      const result = replay();
      if (result.accepted) assert.deepEqual(replay(), result, 'Recovered witness was not deterministic');
      summary.attempted++;
      if (result.accepted) summary.accepted++;
      if (result.accepted && scale !== .025) summary.recovered++;
      if (!result.accepted && scale === .025) summary.regressed++;
      console.log('BLOCK_VARIANT_CASE ' + JSON.stringify({ variant, irregularProperties, scale,
        accepted: result.accepted, validation: result.validation, issues: result.issues, stats: result.stats,
        parcelAttempts: result.stages['parcel-candidate'] ?? 0, buildingAttempts: result.stages['building-placement'] ?? 0,
        fingerprint: result.candidateFingerprint, blocks: result.blocks, unions: result.unions }));
    }
  }
  console.log('BLOCK_VARIANT_SUMMARY ' + JSON.stringify(summary));
  assert.equal(summary.regressed, 0, 'Known baseline successes lost');
  assert.equal(summary.invalid, 0);
}
for (const variant of ['block-beam', 'block-backtrack'])
  test('detached compression experiment: ' + variant, { timeout: 300000 }, t => experiment(variant, t));
