// Detached research baseline: synthetic generated project, not an uploaded save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createProject } from '../src/core/city-model.js';
import { iterateRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { prepareRoadGroupIntentB1 } from '../src/core/road-intent-c1.js';
import { verifyLareGroupPreservation } from '../src/core/reconciliation-preservation.js';
import { createLareBudget } from '../src/core/reconciliation-budget.js';

const roadIds = ['RD-0184', 'RD-0186'];
const baseOffset = { x: -3.005274072121821, y: -37.39896113564458 };
const scales = [1, .75, .5, .25, .125, .025, -.25, -.5, -1];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function inspect(project, offset) {
  const before = hash(project), iterator = iterateRoadGroupReflowB1(project, roadIds, offset);
  let step;
  const stages = {};
  while (!(step = iterator.next()).done) {
    const stage = step.value?.stage ?? 'other';
    stages[stage] = (stages[stage] ?? 0) + 1;
  }
  const result = step.value;
  assert.equal(hash(project), before, 'Preview mutated accepted project');
  if (result.candidateProject) {
    validateStoredProject(result.candidateProject);
    assert.deepEqual(result.candidateProject.city.buildings.map(b => b.id), project.city.buildings.map(b => b.id));
    const draft = prepareRoadGroupIntentB1(project, roadIds, offset);
    assert.equal(verifyLareGroupPreservation(project, result.candidateProject, draft, new Map(), createLareBudget()), null);
  }
  return { status: result.status, accepted: Boolean(result.candidateProject), issues: (result.unresolved ?? []).map(i => i.code),
    validation: result.validation, stats: result.lare?.operationStats ?? null,
    candidateFingerprint: result.candidateProject ? hash(result.candidateProject) : null, stages };
}

for (const irregularProperties of [false, true]) {
  test('detached compressed-block preservation baseline: irregular=' + irregularProperties, () => {
    const project = createProject({ seed: 'mappo-001', size: 'medium', morphology: 'organic',
      shapeOptions: { profile: 'balanced', stretch: 30, asymmetry: 58, bend: 44 }, irregularProperties });
    validateStoredProject(project);
    assert.ok(roadIds.every(id => project.city.roads.some(r => r.id === id)));
    for (const scale of scales) {
      const offset = { x: baseOffset.x * scale, y: baseOffset.y * scale };
      const result = inspect(project, offset);
      const repeat = inspect(project, offset);
      assert.deepEqual(repeat, result, 'Non-deterministic diagnostic outcome');
      console.log('PARCEL_COMPATIBILITY_CASE ' + JSON.stringify({ irregularProperties, scale, offset, ...result }));
      if (scale === 1) {
        assert.equal(result.accepted, false);
        assert.ok(result.issues.includes('lare-search-exhausted'));
        assert.equal(result.validation.graph, 'pass');
        assert.equal(result.validation.faces, 'pass');
        assert.equal(result.stats.expansions, 0);
      }
    }
  });
}
