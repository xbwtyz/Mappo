import test from 'node:test';
import assert from 'node:assert/strict';
import { courtyardFixture } from './helpers/courtyard-fixture.js';
import { prepareBuildingStructure3H } from '../src/editor/building-structures.js';
import { prepareBuildingApply } from '../src/editor/building-application.js';
import { BuildingStructureHistory3H } from '../src/editor/building-structure-history.js';
import { prepareCompoundMembership, prepareCompoundTransform } from '../src/editor/building-compounds-c01.js';
import { PropertyEditSession3I } from '../src/editor/property-edit.js';
import { preparePropertyApply3I } from '../src/editor/property-application.js';
import { prepareRoadTopologyReflowC3 } from '../src/core/road-topology-reflow.js';
import { validateStoredProject } from '../src/data/project-validation.js';
import { copyJson, createProjectDocument, decodeProjectDocument, encodeProjectDocument } from '../src/data/project-format.js';

const fixture = courtyardFixture();
const place = (project, request = fixture.occupant) => prepareBuildingStructure3H(project, fixture.workspace, request);
const building = (project, id = fixture.host.id) => project.city.buildings.find(row => row.id === id);
const expectAccepted = result => {
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.candidate;
};
const first = expectAccepted(place(fixture.project));
const secondRequest = {
  ...fixture.occupant, buildingId: 'BLD-MAN-COURTYARD-SECOND',
  spec: {...fixture.occupant.spec, depth: 2, v: fixture.occupant.spec.v + 3.5},
  courtyard: {...fixture.occupant.courtyard, portalId: 'PORTAL-01', action: 'use'}
};
const second = expectAccepted(place(first, secondRequest));

test('S10-C shares a portal between independent occupants and preserves canonical area, IDs and metadata', () => {
  const original = building(fixture.project), host = building(second);
  const access = host.geometry.courtyardAccess;
  assert.equal(host.geometry.version, 2);
  assert.equal(fixture.project.schemaVersion, 10);
  assert.equal(original.geometry.version, 1);
  assert.deepEqual(host.geometry.regions, original.geometry.regions);
  assert.deepEqual(host.components, original.components);
  assert.equal(host.area, original.area);
  assert.equal(access.portals.length, 1);
  assert.deepEqual(access.occupants, [fixture.occupant.buildingId, secondRequest.buildingId]
    .map(buildingId => ({buildingId, portalId: access.portals[0].id})));
  for (const {buildingId} of access.occupants) {
    const occupant = building(second, buildingId);
    assert.equal(occupant.propertyId, host.propertyId);
    assert.ok(occupant.plotIds.length);
    const route = occupant.accessPath;
    assert.ok(route.length >= 5);
    assert.deepEqual(route[0], occupant.entrance);
    assert.equal(occupant.frontageRoadId, host.frontageRoadId);
  }
  assert.ok(building(second, secondRequest.buildingId).accessPath.length > 5, 'second path bends around the first roof');
  const text = encodeProjectDocument(createProjectDocument(second, fixture.workspace));
  const decoded = decodeProjectDocument(text);
  assert.equal(decoded.formatVersion, 1);
  assert.equal(decoded.workspace.schemaVersion, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded.project)), JSON.parse(JSON.stringify(second)));
});

test('S10-C rejects missing links, tampered openings and saved wall crossings without mutating the live project', () => {
  const before = JSON.stringify(second);
  for (const [mutate, message] of [
    [p => building(p).geometry.courtyardAccess.occupants.pop(), /needs a portal link/],
    [p => { building(p).geometry.courtyardAccess.portals[0].outer[0].x += 1; }, /opening|wall/],
    [p => { building(p, fixture.occupant.buildingId).accessPath.splice(1, 1); }, /access .* blocked/i],
    [p => { building(p).geometry.courtyardAccess.occupants[1].portalId = 'bogus'; }, /missing or duplicate/]
  ]) {
    const invalid = copyJson(second);
    mutate(invalid);
    assert.throws(() => validateStoredProject(invalid), message);
  }
  const invalid = place(first, {...secondRequest, spec: {...secondRequest.spec, u: secondRequest.spec.u + 16}});
  assert.equal(invalid.ok, false);
  assert.equal(JSON.stringify(second), before);
});

test('S10-C refuses occupied portal removal until a valid replacement can be applied atomically', () => {
  const spec = {...fixture.occupant.courtyard, only: true};
  const portalChange = (project, changes) => place(project, {...fixture.occupant,
    buildingId: 'BLD-MAN-UNUSED-PORTAL', courtyard: {...spec, ...changes}});
  const blocked = portalChange(second, {action:'remove', portalId:'PORTAL-01'});
  assert.equal(blocked.ok, false);
  assert.match(blocked.issues[0].message, /replacement portal/);
  const another = expectAccepted(portalChange(second, {innerOffset:.2, outerOffset:.4}));
  const replaced = expectAccepted(portalChange(another,
    {action:'remove', portalId:'PORTAL-01', replacementId:'PORTAL-02'}));
  assert.deepEqual(building(replaced).geometry.courtyardAccess.portals.map(p => p.id), ['PORTAL-02']);
  assert.ok(building(replaced).geometry.courtyardAccess.occupants.every(link => link.portalId === 'PORTAL-02'));
  const history = new BuildingStructureHistory3H();
  assert.equal(history.record(another, replaced, fixture.occupant.propertyId, 'courtyard access'), true);
  const undo = history.prepare(replaced, fixture.workspace, fixture.occupant.propertyId, 'undo');
  assert.equal(undo.ok, true);
  assert.deepEqual(undo.candidate, another);
  history.accept(undo.entry, 'undo');
  assert.deepEqual(history.prepare(undo.candidate, fixture.workspace, fixture.occupant.propertyId, 'redo').candidate, replaced);
});

test('S10-C a host move updates openings and routes or fails without committing a stranded occupant', () => {
  const move = prepareBuildingApply(second, fixture.workspace, fixture.host.id, {dy:.5});
  assert.equal(move.ok, true, JSON.stringify(move.issues));
  assert.equal(move.courtyardRoutesChanged.length, 2);
  assert.notDeepEqual(building(move.candidate).geometry.courtyardAccess.portals,
    building(second).geometry.courtyardAccess.portals);
  assert.equal(prepareBuildingApply(second, fixture.workspace, fixture.host.id, {dy:8}).ok, false);
  assert.equal(place(second, {...fixture.occupant, operation:'delete', buildingId:fixture.host.id}).ok, false);
  const deleted = expectAccepted(place(second, {...fixture.occupant, operation:'delete'}));
  assert.equal(building(deleted, fixture.occupant.buildingId), undefined);
  assert.equal(building(deleted).geometry.courtyardAccess.occupants.length, 1);
});

test('S10-C preserves opaque geometry metadata and refuses to overwrite an occupied extension key', () => {
  const existing = copyJson(fixture.project);
  building(existing).geometry.courtyardAccess = {externalExample: 'preserve me'};
  assert.doesNotThrow(() => validateStoredProject(existing));
  const result = place(existing);
  assert.equal(result.ok, false);
  assert.match(result.issues[0].message, /metadata cannot be overwritten/);
  assert.deepEqual(building(existing).geometry.courtyardAccess, {externalExample:'preserve me'});
});

test('S10-C validates compound transforms, plot changes and an edit that would remove the linked street', () => {
  const propertyId = fixture.occupant.propertyId;
  const before = JSON.stringify(second);
  const membership = prepareCompoundMembership(second, fixture.workspace, {
    propertyId, action: 'create', name: 'Courtyard buildings',
    memberBuildingIds: [fixture.host.id, fixture.occupant.buildingId, secondRequest.buildingId]
  });
  const grouped = expectAccepted(membership);
  const moved = expectAccepted(prepareCompoundTransform(grouped, fixture.workspace, propertyId, membership.groupId, {dy:.4}));
  assert.equal(building(moved).geometry.courtyardAccess.occupants.length, 2);
  const edit = new PropertyEditSession3I();
  assert.equal(edit.start(moved.city, propertyId), true);
  assert.equal(edit.addDivider(moved.city), true);
  const divided = expectAccepted(preparePropertyApply3I(moved, fixture.workspace, edit));
  assert.deepEqual(building(divided).geometry.courtyardAccess, building(moved).geometry.courtyardAccess);
  const street = building(second, fixture.occupant.buildingId).frontageRoadId;
  const removed = prepareRoadTopologyReflowC3(second, street, null, {kind:'remove'});
  assert.equal(removed.candidateProject, null);
  assert.ok(removed.unresolved.length);
  assert.equal(JSON.stringify(second), before);
});
