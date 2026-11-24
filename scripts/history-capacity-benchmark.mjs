import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { createProject } from '../src/core/city-model.js';
import { IdentityEditor } from '../src/core/identity.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { DistrictEditor } from '../src/editor/districts.js';
import { FortificationEditor } from '../src/editor/fortifications.js';

const seed = 'history-capacity-a5';
const authoringEdits = 60;
const measuredEdits = 30;
const identities = new IdentityEditor();
const districts = new DistrictEditor();
const defenses = new FortificationEditor();
let project = createProject({ seed, size: 'large', morphology: 'planned', irregularProperties: true,
  fortifications: { enabled: true, gateCount: 4, towerSpacing: 100, seed } });

for (const [index, building] of project.city.buildings.slice(0, authoringEdits).entries()) {
  const city = identities.apply(project.city, { kind: 'building', id: building.id },
    { customName: `Authored place ${index + 1}`, customUse: 'Workshop' });
  project = { ...project, city };
}
validateStoredProject(project);
const history = new AcceptedEditHistoryD01();
history.clear(project);
const estimated = [];
const times = [];
let expired = 0;
for (let index = 0; index < measuredEdits; index++) {
  let city, transaction;
  if (index % 3 === 0) {
    const property = project.city.properties[index];
    city = identities.apply(project.city, { kind: 'property', id: property.id },
      { customName: `Retained street parcel ${index + 1}` });
    transaction = { family: 'identity', operation: 'identity-change', label: 'Rename property', targetIds: [property.id] };
  } else {
    const isDistrict = index % 3 === 1;
    const editor = isDistrict ? districts : defenses;
    const before = editor.history.slice();
    if (isDistrict) {
      const district = project.city.districts[0];
      editor.selectedDistrictId = district.id;
      city = editor.edit(project.city, `Edited district ${index + 1}`, district.color);
      transaction = { family: 'districts', operation: 'identity', label: 'Rename district', targetIds: [district.id] };
    } else {
      const enabled = !project.city.fortificationState.enabled;
      city = editor.apply(project.city, { enabled, gateCount: 4, towerSpacing: 100, seed });
      transaction = { family: 'defenses', operation: enabled ? 'enable' : 'disable',
        label: enabled ? 'Enable defenses' : 'Disable defenses', targetIds: city.walls.map(wall => wall.id) };
    }
    transaction.editorHistory = { key: isDistrict ? 'districtEditor' : 'fortificationEditor',
      before: { history: before, savedCount: 0 }, after: { history: editor.history, savedCount: 0 } };
  }
  project = { ...project, city };
  const started = performance.now();
  const record = history.observe(project, transaction);
  times.push(performance.now() - started);
  assert.equal(record.status, 'recorded');
  estimated.push(record.entry.bytes);
  expired += record.pruned;
}
validateStoredProject(project);
const mib = bytes => +(bytes / (1024 * 1024)).toFixed(2);
const percentile = (values, fraction) => values.slice().sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
console.log(JSON.stringify({
  seed, node: process.version,
  city: { buildings: project.city.buildings.length, properties: project.city.properties.length,
    roads: project.city.roads.length, authoredBuildings: authoringEdits },
  measuredEdits, retained: history.length, expired,
  budgetMiB: mib(history.maxBytes), estimatedRetainedMiB: mib(history.bytes),
  estimatedEntryMiB: { min: mib(Math.min(...estimated)), max: mib(Math.max(...estimated)) },
  journalRecordMilliseconds: { median: +percentile(times, .5).toFixed(1), p95: +percentile(times, .95).toFixed(1) },
}, null, 2));
