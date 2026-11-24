import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProject } from '../src/core/city-model.js';
import { prepareRoadGroupReflowB1 } from '../src/core/neighborhood-reflow.js';
import { validateStoredProject } from '../src/data/project-validation.js';

const { projects, cases } = JSON.parse(readFileSync(new URL('./fixtures/lare-preservation-research.json', import.meta.url)));
const generated = new Map();

for (const { projectId, roadIds, offset, strategy } of cases) {
  test(`B1R research recovery ${strategy} ${projectId} ${roadIds.join('/')} (${offset.x},${offset.y})`, () => {
    if (!generated.has(projectId)) generated.set(projectId, createProject(projects[projectId]));
    const project = generated.get(projectId);
    const before = JSON.stringify(project);
    const result = prepareRoadGroupReflowB1(project, roadIds, offset, { strategy });
    assert.ok(result.candidateProject, JSON.stringify(result.unresolved));
    validateStoredProject(result.candidateProject);
    assert.deepEqual(result.candidateProject.city.buildings.map(building => building.id),
      project.city.buildings.map(building => building.id));
    assert.equal(JSON.stringify(project), before);
  });
}
