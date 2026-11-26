import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';
import { transactionProfileObservation, requireTransactionPhases, summarizeTransactionProfiles } from '../tests/helpers/transaction-profile.js';
import { findDirectFootprintFixture } from '../tests/helpers/building-footprint-fixture.js';

const observation = `
const unmeasuredBuildingMove = buildingEditSession.moveGesture.bind(buildingEditSession);
let buildingMoveMs = null;
buildingEditSession.moveGesture = point => {
  const started = performance.now();
  try { return unmeasuredBuildingMove(point); }
  finally { buildingMoveMs = performance.now() - started; }
};
Object.assign(__buildingQA, {
  moveMs: () => buildingMoveMs,
  validateDraft: () => validateStoredProject(buildingEditSession.validation.candidate),
  applyDraft: applyBuildingTransform,
  history: moveBuildingHistory
});
`;
const html = observeBuildingApp(await readFile(new URL('../index.html', import.meta.url), 'utf8'), transactionProfileObservation + observation);
const samples = 9;
const warmups = 2;
const viewport = { width: 1440, height: 900 };
const browser = await chromium.launch();
const groups = [], profileSamples = {};

const percentiles = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = q => Number(sorted[Math.ceil(sorted.length * q) - 1].toFixed(2));
  return { p50Ms: percentile(.5), p95Ms: percentile(.95) };
};

try {
  for (const size of ['small', 'large']) {
    const seed = 'f4-footprint-performance';
    const url = `http://mappo-f4.test/?size=${size}&shape=planned&seed=${seed}`;
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === url
      ? route.fulfill({ contentType: 'text/html', body: html })
      : route.abort());
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    const project = await page.evaluate(() => __buildingQA.state().project);
    assert.equal(project.options.size, size);
    const { building, vertex, moved } = findDirectFootprintFixture(project);
    await page.evaluate(propertyId => __buildingQA.state().propertyWorkspace.select({
      kind: 'property', id: propertyId
    }), building.propertyId);
    await page.locator(`[data-inspector-kind="building"][data-inspector-id="${building.id}"]`).click();
    await page.getByRole('button', { name: /^(Edit building footprint|Edit footprint)$/ }).click();
    await page.locator('#buildingToolVertices').click();
    const { from, to } = await page.evaluate(({ vertex, moved }) => {
      const { camera } = __buildingQA.state();
      camera.zoom = 12;
      camera.x = vertex.x;
      camera.y = vertex.y;
      const rect = document.getElementById('mapCanvas').getBoundingClientRect();
      const screen = point => {
        const p = camera.worldToScreen(point);
        return { x: p.x + rect.left, y: p.y + rect.top };
      };
      __buildingQA.draw();
      return { from: screen(vertex), to: screen(moved) };
    }, { vertex, moved });

    const timings = { gesture: [], validation: [], apply: [], undo: [], redo: [] };
    const profiles = {apply:[],undo:[],redo:[]};
    for (let i = 0; i < samples + warmups; i++) {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y);
      await page.mouse.up();
      const row = await page.evaluate(() => {
        const qa = __buildingQA;
        const measure = action => {
          const start = performance.now();
          return { result: action(), ms: performance.now() - start };
        };
        if (!qa.state().buildingEditSession.validation?.ok)
          throw Error(JSON.stringify(qa.state().buildingEditSession.validation?.issues));
        const gesture = qa.moveMs();
        const validation = measure(qa.validateDraft).ms;
        const profile = (label, action) => {
          qa.transactionProfile.begin(label);
          const measured = measure(action);
          return {...measured, profile:qa.transactionProfile.finish()};
        };
        const apply = profile('building-apply',qa.applyDraft);
        const undo = profile('building-undo',() => qa.history('undo'));
        const redo = profile('building-redo',() => qa.history('redo'));
        if (!apply.result || !undo.result || !redo.result || !qa.history('undo'))
          throw Error('F4 benchmark could not apply, undo, redo and restore the same fixture.');
        return { gesture, validation, apply: apply.ms, undo: undo.ms, redo: redo.ms,
          profiles:{apply:apply.profile,undo:undo.profile,redo:redo.profile} };
      });
      const sampleProfiles = row.profiles;
      delete row.profiles;
      for (const [name, value] of Object.entries(sampleProfiles)) {
        requireTransactionPhases(value,name==='apply'?
          ['AcceptedIdentitySession.commit','prepareAcceptedIdentityTransaction','AcceptedEditHistoryD01.record']:
          ['AcceptedIdentitySession.replay','AcceptedEditHistoryD01.prepare','AcceptedEditHistoryD01.accept']);
        if(i>=warmups)profiles[name].push(value);
      }
      for (const [name, value] of Object.entries(row)) {
        assert.ok(Number.isFinite(value) && value >= 0, name);
        if (i >= warmups) timings[name].push(value);
      }
    }
    assert.deepEqual(errors, []);
    profileSamples[size]=profiles;
    groups.push({
      size, seed, morphology: project.options.morphology, buildings: project.city.buildings.length,
      properties: project.city.properties.length, plots: project.city.plots.length,
      samples, warmups, timings: Object.fromEntries(Object.entries(timings).map(([name, values]) => [name, percentiles(values)])),
      phaseProfiles:Object.fromEntries(Object.entries(profiles).map(([name,values])=>[name,summarizeTransactionProfiles(values)]))
    });
    await page.close();
  }
} finally {
  await browser.close();
}

const runner = {
  cpu: os.cpus()[0]?.model, cpus: os.cpus().length, platform: os.platform(), arch: os.arch(),
  node: process.version, browser: browser.version(), viewport
};
const ci = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
const report = { runner, ci, groups, instrumentation:'S1-A test-only synchronous nested phase timings; Apply/Undo/Redo include profiling overhead' };
const table = [
  '| City | Buildings / properties / plots | Pointer handler | Independent validation | Apply | Undo | Redo |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...groups.map(g => `| ${g.size} | ${g.buildings} / ${g.properties} / ${g.plots} | ${Object.values(g.timings)
    .map(t => `${t.p50Ms} / ${t.p95Ms}`).join(' | ')} |`)
];
const markdown = [
  '# F4 building editing measurements', '',
  'Each cell reports p50 / p95 in milliseconds. Each city has nine samples after two warm-ups on the same Chromium runner.', '',
  ...table, '',
  'The pointer metric measures the synchronous preview handler in a trusted browser gesture and excludes paint. The other columns measure the independent validator and the existing Apply, Undo, and Redo transactions through their synchronous UI updates.', '',
  'S1-A diagnostics are instrumented; do not treat these elapsed times as an uninstrumented speedup measurement. Nested phase self times exclude instrumented children. Residual includes uninstrumented UI and scheduler work.', '',
  `Runner: ${JSON.stringify(runner)}`,
  ...(ci ? ['', `[CI run](${ci})`] : [])
].join('\n') + '\n';
await mkdir('artifacts/f4', { recursive: true });
await writeFile('artifacts/f4/building-performance.json', JSON.stringify({...report,profileSamples}, null, 2) + '\n');
await writeFile('artifacts/f4/building-performance.md', markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log('F4_BUILDING_PERFORMANCE ' + JSON.stringify(report));
