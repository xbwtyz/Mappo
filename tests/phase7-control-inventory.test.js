import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baselineURL = new URL('../dist/mappo-0.1-dev.3e6.html', import.meta.url);
const currentURL = new URL('../index.template.html', import.meta.url);

function interactiveIds(html) {
  // Only static elements; we intentionally exclude runtime-created controls.
  const results = new Map();
  for (const match of html.matchAll(/<(button|input|select|textarea)\b[^>]*?\bid=["']([^"']+)["'][^>]*>/gi)) {
    const [, tag, id] = match;
    if (results.has(id)) throw new Error('Duplicate static interactive ID: ' + id);
    results.set(id, tag.toLowerCase());
  }
  return results;
}

test('7A: the entire 3E.6 interactive control inventory survives the overhaul', async () => {
  const baseline = interactiveIds(await readFile(baselineURL, 'utf8'));
  const current = interactiveIds(await readFile(currentURL, 'utf8'));
  assert.equal(baseline.size, 93, 'Baseline review count changed; re-audit the inventory');
  const missing = [...baseline.keys()].filter(id => !current.has(id));
  assert.deepEqual(missing, [], 'Every old control must remain wired into the new workspace');
  for (const [id, type] of baseline)
    assert.equal(current.get(id), type, `${id} keeps its interactive element type`);
});

test('7A: all four editor sections and global map controls remain uniquely addressable', async () => {
  const template = await readFile(currentURL, 'utf8');
  const ids = interactiveIds(template);
  for (const name of ['city','landscape','districts','defenses'])
    assert.ok(ids.has('workspaceTab-' + name), `Missing ${name} tab`);
  for (const id of ['panButton','fitButton','zoomInButton','zoomOutButton','projectMenuButton','layersMenuButton','generateButton'])
    assert.ok(ids.has(id), `Shared control ${id} missing`);
});
