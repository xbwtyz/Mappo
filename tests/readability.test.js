import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
test('phase 6A makes core controls readable and focus indicators keyboard-visible', () => {
  const scope = css.slice(css.indexOf('/* Phase 6A'));
  assert.ok(scope.length > 700, 'expected scoped readability rules');
  assert.match(scope, /\.workspace-shell \.control-group label[\s\S]*?font-size:13px/);
  assert.match(scope, /\.workspace-shell \.tool-button[\s\S]*?min-height:38px/);
  assert.match(scope, /\.workspace-shell input:not\(\[type=checkbox\]\)[\s\S]*?min-height:40px/);
  assert.match(scope, /:focus-visible[\s\S]*?outline:3px solid/);
  assert.match(scope, /\[aria-pressed=true\]/);
  assert.match(scope, /\[role=tab\]\[aria-selected=true\]/);
  assert.match(scope, /@media\(max-width:670px\)/);
});
