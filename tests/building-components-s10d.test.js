import { PROJECT_SCHEMA_VERSION } from '../src/core/version.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingComponentFixture } from './helpers/building-component-fixture.js';
import { prepareBuildingComponents } from '../src/editor/building-component-application.js';
import { hitBuilding } from '../src/core/building-selection.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { AcceptedEditHistoryD01 } from '../src/core/accepted-edit-history-d01.js';
import { preparePropertyApply3I } from '../src/editor/property-application.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { copyJson } from '../src/data/project-format.js';
import { prepareCompoundMembership, prepareCompoundTransform } from '../src/editor/building-compounds-c01.js';
import { prepareBuildingStructure3H, buildingLocalPoint3H } from '../src/editor/building-structures.js';

const fixture = buildingComponentFixture();
const {project, workspace, original, first, second, property} = fixture;
const edit = (accepted, request) => prepareBuildingComponents(accepted, workspace, original.id, request);
const building = accepted => accepted.city.buildings.find(b => b.id === original.id);
function candidate(result) {
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.candidate;
}
const pair = candidate(edit(project, first));
const tower = building(pair).components.find(c => c.name === first.name);
const triple = candidate(edit(pair, {...second, componentId:tower.id}));

test('S10-D three separate roofs render and select as one building with one route and owner', () => {
  const parts = building(triple);
  assert.equal(triple.city.buildings.length, project.city.buildings.length);
  assert.equal(parts.geometry.version, 3);
  assert.equal(triple.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(parts.components.length, 3);
  assert.equal(parts.geometry.regions.length, 3);
  assert.equal(parts.propertyId, original.propertyId);
  assert.equal(parts.frontageRoadId, original.frontageRoadId);
  assert.equal(parts.area, original.area + 18);
  assert.deepEqual(hitBuilding(first, triple.city.buildings, 4), {kind:'building', id:original.id});
  assert.deepEqual(hitBuilding(second, triple.city.buildings, 4), {kind:'building', id:original.id});
  assert.notEqual(parts.footprint, original.footprint);
  assert.doesNotThrow(() => validateStoredProject(triple));
});

test('S10-D component transforms move a subtree, while whole-building transforms move all roots', () => {
  const before = building(triple);
  const part = candidate(edit(triple, {action:'transform', componentId:tower.id, transform:{dy:.5}}));
  const movedRings = building(part).geometry.regions;
  for (const ring of movedRings) {
    const originalRing = before.geometry.regions.find(r => r.id === ring.id);
    const shift = ring.componentId === 'BC-ROOT' ? 0 : .5;
    assert.equal(ring.ring[0].y, originalRing.ring[0].y + shift);
  }
  const whole = candidate(edit(triple, {action:'transform', transform:{dx:.5}}));
  assert.ok(building(whole).geometry.regions.every((r,i) => r.ring[0].x === before.geometry.regions[i].ring[0].x + .5));
});

test('S10-D reparenting preserves geometry and blocks ancestry cycles and destructive removal', () => {
  const part = building(triple), leaf = part.components.find(c => c.parentId === tower.id);
  const root = part.components.find(c => c.parentId === null);
  const request = {action:'organize', componentId:tower.id, parentId:leaf.id, name:'West tower'};
  assert.match(edit(triple, request).issues[0].message, /cycle/);
  assert.match(edit(triple, {action:'remove', componentId:tower.id}).issues[0].message, /children/);
  const regrouped = candidate(edit(triple, {...request, componentId:leaf.id, parentId:root.id}));
  assert.deepEqual(building(regrouped).geometry, part.geometry);
  const reduced = candidate(edit(regrouped, {action:'remove', componentId:tower.id}));
  assert.equal(building(reduced).components.length, 2);
  assert.equal(building(reduced).components.find(c => c.id === leaf.id).name, 'West tower');
});

test('S10-D rejects overlapping parts and boundary crossings before Apply and replays changes atomically', () => {
  const snapshot = JSON.stringify(pair);
  const overlap = edit(pair, {...first, x:first.x + 1});
  assert.match(overlap.issues[0].message, /overlap/);
  const outside = edit(pair, {...second, x:second.x + 50});
  assert.equal(outside.ok, false);
  assert.equal(JSON.stringify(pair), snapshot);
  const history = new AcceptedEditHistoryD01();
  history.clear(pair);
  assert.equal(history.observe(triple, { family: 'building', operation: 'building-structure',
    label: 'Edit building components', targetIds: [building(triple).id] }).status, 'recorded');
  const undo = history.prepare('undo', triple, workspace);
  assert.deepEqual(undo.candidate, pair);
  history.accept('undo', undo.entry, undo.candidate);
  assert.deepEqual(history.prepare('redo', pair, workspace).candidate, triple);
});

test('S10-D property redivision and a compound transform preserve multipart identity', () => {
  const draft = new PropertyEditSession3I();
  draft.start(triple.city, property.id);
  assert.equal(draft.addDivider(triple.city), true);
  const divided = candidate(preparePropertyApply3I(triple, workspace, draft));
  assert.deepEqual(building(divided).geometry, building(triple).geometry);

  const local = buildingLocalPoint3H(property, {x:first.x + 5, y:first.y + 10});
  const separateId = 'BLD-MAN-S10D-COMPOUND-NEIGHBOR';
  const other = candidate(prepareBuildingStructure3H(triple, workspace, {operation:'add', propertyId:property.id,
    buildingId:separateId, spec:{...local, width:2.5, depth:3, angle:0, type:'house', preset:'rectangle'}}));
  const link = prepareCompoundMembership(other, workspace, {propertyId:property.id, action:'create',
    name:'Two buildings', memberBuildingIds:[original.id, separateId]});
  const grouped = candidate(link);
  const moved = candidate(prepareCompoundTransform(grouped, workspace, property.id, link.groupId, {dy:.3}));
  assert.deepEqual(building(moved).components, building(grouped).components);
  assert.doesNotThrow(() => validateStoredProject(copyJson(moved)));
});
