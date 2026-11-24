import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftEngine } from '../src/core/draft-engine.js';

const stage = (drafts, intent, details) => drafts.sync('road', { intent, dirty: true, ...details });

test('only one interactive draft can Apply and staged settings remain independent', () => {
  const city = {};
  const drafts = new DraftEngine(() => city);
  assert.equal(drafts.read('road').status, 'inactive');
  assert.equal(drafts.sync('road').status, 'clean');
  assert.equal(drafts.read('road').canApply, false);
  assert.equal(drafts.sync('building', { dirty: true, ready: true }).status, 'inactive');
  assert.equal(drafts.sync('landscape', { staged: true, dirty: true }).status, 'pending');
  assert.equal(drafts.cancel('road', () => true), true);
  assert.equal(drafts.sync('building', { dirty: true, ready: true }).status, 'valid');
  assert.equal(drafts.read('landscape').dirty, true);
});

test('draft messages preserve original reasons, related records and revision', () => {
  const drafts = new DraftEngine(() => 1);
  const warning = { code: 'domain-warning', severity: 'warning', message: 'Original warning.',
    target: { kind: 'road', id: 'R1' }, related: ['R2'], remedy: 'Review the bend.' };
  const valid = stage(drafts, 1, { ready: true, issues: [warning] });
  assert.equal(valid.canApply, true);
  assert.deepEqual(valid.diagnostics[0], { ...warning, domain: 'road', sourceRevision: valid.revision });
  const decision = { code: 'domain-choice', severity: 'decision', message: 'Original decision.' };
  const blocked = stage(drafts, 2, { ready: true, issues: [decision] });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostics[0].remedy, undefined);
  assert.equal(drafts.apply('road', () => assert.fail('unresolved decision reached commit')), false);
});

test('new draft input, Reset, Cancel and replacement invalidate validation tokens', () => {
  let city = {};
  const drafts = new DraftEngine(() => city);
  const first = stage(drafts, 1, { checking: true });
  assert.equal(first.status, 'checking');
  assert.equal(drafts.cancel('road', () => assert.fail('declined discard stopped editor'), () => false), false);
  assert.equal(drafts.isCurrent('road', first), true);
  assert.equal(stage(drafts, 2, { ready: true, validatedIntent: 1 }).canApply, false);
  assert.equal(drafts.isCurrent('road', first), false);
  const next = stage(drafts, 2, { ready: true });
  assert.equal(next.validationRevision, next.revision);
  assert.equal(drafts.reset('road', () => true), true);
  assert.equal(drafts.isCurrent('road', next), false);
  const final = stage(drafts, 2, { ready: true });
  assert.notEqual(final.session, next.session);
  city = {};
  assert.equal(drafts.read('road').status, 'stale');
  assert.equal(drafts.isCurrent('road', final), false);
  assert.equal(drafts.cancel('road', () => true), true);
  assert.equal(drafts.read('road').status, 'inactive');
});

test('an asynchronous Apply is locked and cannot commit after replacement', async () => {
  let city = {};
  const original = city;
  const drafts = new DraftEngine(() => city);
  stage(drafts, 1, { ready: true });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const applying = drafts.apply('road', async current => {
    await gate;
    if (!current()) return false;
    city = { changed: true };
    return true;
  });
  assert.equal(drafts.read('road').status, 'applying');
  assert.equal(drafts.apply('road', () => true), false);
  assert.equal(drafts.reset('road', () => true), false);
  assert.equal(drafts.cancel('road', () => true), false);
  drafts.clear();
  release();
  assert.equal(await applying, false);
  assert.equal(city, original);
});

test('Apply failure releases the lock without dropping a usable draft', async () => {
  const drafts = new DraftEngine(() => 1);
  const valid = stage(drafts, 1, { ready: true });
  await assert.rejects(drafts.apply('road', async () => { throw Error('Validation failed'); }), /Validation failed/);
  assert.equal(drafts.read('road').status, 'valid');
  assert.equal(drafts.isCurrent('road', valid), true);
});
