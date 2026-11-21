import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('H1 release workflow is manual, gated to stable version and exact green main commit', async () => {
  const release = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const pages = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(release, /workflow_dispatch:/);
  assert.doesNotMatch(release, /^\s+workflow_run:/m, 'main CI cannot start publishing');
  assert.doesNotMatch(release, /^\s+push:/m, 'merging cannot start publishing');
  assert.match(release, /github\.ref == 'refs\/heads\/main'/);
  assert.match(release, /PUBLISH-0\.2\.0/);
  assert.match(release, /test "\$app_version" = '0\.2\.0'/);
  assert.match(release, /test "\$package_version" = '0\.2\.0'/);
  assert.match(release, /test -s docs\/releases\/v0\.2\.0\.md/);
  assert.match(release, /\.name == "Mappo CI" and \.conclusion == "success"/);
  assert.match(release, /test "\$actual_main" = "\$GITHUB_SHA"/);
  assert.match(release, /npm run check/);
  assert.match(release, /git diff --exit-code -- index\.html dist\/mappo-0\.2\.0\.html/);
  assert.match(release, /gh release create v0\.2\.0/);
  assert.match(release, /--target "\$GITHUB_SHA"/);
  assert.match(pages, /workflow_dispatch:/);
  assert.doesNotMatch(pages, /^\s+push:/m);
  assert.match(ci, /branches: \[main\]/);
  assert.match(ci, /Build, Node tests and browser QA/);
});
