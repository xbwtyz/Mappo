import test from 'node:test';
import assert from 'node:assert/strict';
import { describePendingChanges, REBUILD_EFFECTS } from '../src/core/pending-changes.js';

function sample() {
  return {
    project: {
      seed: 'abc', options: { center: { x: 4, y: 5 }, size: 'small', morphology: 'organic' },
      city: {
        id: 'abc', survey: { boundary: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 5, y: 9 }] },
        districts: [{ id: 'D1', name: 'Old Town', color: '#112233' }],
        districtState: { status: 'assigned', requestedCount: 1, seed: 'districts' }
      }
    },
    outline: {
      boundary: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 5, y: 9 }],
      center: { x: 4, y: 5 }, dirty: false
    },
    controls: { seed: 'abc', size: 'small', morphology: 'organic' },
    water: { dirty: false },
    terrain: { dirty: false },
    districtEditor: { selectedDistrictId: 'D1' },
    districtControls: { count: '1', seed: 'districts', name: 'Old Town', color: '#112233', target: '' },
    defensePreview: { pending: false, invalid: false }
  };
}
test('unmodified accepted city reports zero pending changes, even if an editor dirty flag is stale', () => {
  const s = sample();
  assert.deepEqual(describePendingChanges(s), { city: [], local: [], count: 0, cityPending: false });
  s.outline.dirty = true;
  assert.equal(describePendingChanges(s).count, 0);
  s.outline.boundary[0].x += 2;
  assert.deepEqual(describePendingChanges(s).city, ['Outline or main square']);
  s.outline.boundary[0].x -= 2;
  s.outline.center.x++;
  assert.deepEqual(describePendingChanges(s).city, ['Outline or main square']);
  assert.equal(s.project.city.survey.boundary[0].x, 0);
});
test('only actual street settings and water/terrain drafts require city rebuilding', () => {
  const s = sample();
  s.controls.seed = 'new-seed';
  s.water.dirty = true;
  s.terrain.dirty = true;
  assert.deepEqual(describePendingChanges(s).city, ['Street generation settings', 'Water or crossings', 'Mountains or passes']);
  s.controls.seed = 'abc'; s.water.dirty = false; s.terrain.dirty = false;
  s.districtControls.name = 'Change';
  s.districtControls.target = 'D2';
  s.defensePreview.pending = true;
  const summary = describePendingChanges(s);
  assert.equal(summary.cityPending, false);
  assert.deepEqual(summary.local, ['Selected district edits', 'Defense update']);
  assert.match(REBUILD_EFFECTS, /districts and enabled defenses/);
});
test('pending district generation is local and invalid defenses are explicitly named', () => {
  const s = sample();
  s.districtControls.count = '2';
  s.defensePreview = { pending: true, invalid: true };
  assert.deepEqual(describePendingChanges(s).local, ['District generation', 'Defense settings need correction']);
  s.project.city.districtState = { status: 'unassigned' };
  s.districtControls.count = 'auto';
  assert.deepEqual(describePendingChanges(s).local, ['Defense settings need correction']);
});
