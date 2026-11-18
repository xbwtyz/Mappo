import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDefenseUpdate, FortificationPanel } from '../src/ui/fortifications.js';

const enabled = { enabled: true, gateCount: '4', towerSpacing: '100', seed: 'forts' };
const disabled = { ...enabled, enabled: false };
const city = {
  fortificationState: {
    status: 'built', enabled: true, requestedGateCount: 4,
    towerSpacing: 100, seed: 'forts', algorithm: 'outer-perimeter-v1',
    gateCount: 4
  },
  gates: Array(4).fill({}), towers: Array(12).fill({})
};

test('defense preview distinguishes initial build, toggle-only changes, regeneration and unchanged settings', () => {
  const before = JSON.stringify(city);
  assert.match(describeDefenseUpdate(city, enabled).text, /No defense changes pending/);
  assert.equal(describeDefenseUpdate(city, enabled).pending, false);
  assert.match(describeDefenseUpdate(city, disabled).text, /disable the visible walls/);
  assert.match(describeDefenseUpdate({ fortificationState: { status: 'unbuilt', enabled: false } }, enabled).text, /build walls/);
  assert.equal(describeDefenseUpdate({ fortificationState: { status: 'unbuilt', enabled: false } }, disabled).pending, false);
  const inactive = { ...city, fortificationState: { ...city.fortificationState, enabled: false } };
  assert.match(describeDefenseUpdate(inactive, enabled).text, /re-enable the saved defenses/);
  assert.match(describeDefenseUpdate(inactive, { ...enabled, seed: 'new-seed' }).text, /regenerate only walls/);
  assert.match(describeDefenseUpdate(inactive, { ...enabled, enabled: false, towerSpacing: '' }).text, /changes apply only after re-enabling/);
  assert.match(describeDefenseUpdate(city, { ...enabled, gateCount: '2' }).text, /regenerate only walls/);
  assert.equal(JSON.stringify(city), before, 'preview must not mutate city geometry');
});

test('invalid enabled settings are reported inline; disabled controls do not attempt a rebuild', () => {
  let result = describeDefenseUpdate(city, { ...enabled, towerSpacing: 'not-a-number' });
  assert.equal(result.invalid, true);
  assert.match(result.text, /Tower spacing/);
  result = describeDefenseUpdate(city, { ...enabled, gateCount: '9' });
  assert.equal(result.invalid, true);
  assert.match(result.text, /1–8 gates/);
  result = describeDefenseUpdate(city, { ...enabled, enabled: false, towerSpacing: 'not-a-number' });
  assert.equal(result.invalid, false);
});

test('the existing defense controller updates pending feedback without applying a city mutation', () => {
  const elements = new Map(), make = () => ({
    value: '', checked: false, disabled: false, textContent: '',
    classList: { flags: new Map(), toggle(k, v) { this.flags.set(k, v); } },
    handlers: {}, addEventListener(event, callback) { this.handlers[event] = callback; }
  });
  const el = id => {
    if (!elements.has(id)) elements.set(id, make());
    return elements.get(id);
  };
  let changes = 0;
  const panel = new FortificationPanel({
    getElement: el, getCity: () => city, commit() { throw Error('No mutation expected'); },
    changed() { changes++; }
  });
  panel.refresh(true);
  panel.bind();
  assert.match(el('defensePendingMessage').textContent, /No defense changes pending/);
  el('towerSpacingInput').value = '70';
  el('towerSpacingInput').handlers.input();
  assert.match(el('defensePendingMessage').textContent, /regenerate only walls/);
  assert.equal(el('defensePendingMessage').classList.flags.get('pending'), true);
  assert.equal(changes, 1);
  el('towerSpacingInput').value = 'broken';
  el('towerSpacingInput').handlers.input();
  assert.equal(el('defensePendingMessage').classList.flags.get('error'), true);
});
