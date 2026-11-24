import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox } from 'playwright';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const bundle = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const inventoryLookup = '\n    const inventory = buildingCache.get(parcel);';
assert.equal(bundle.split(inventoryLookup).length, 2, 'Locate the exact arrangement cache lookup');
const observed = observeBuildingApp(bundle.replace(inventoryLookup, `$&
    if (globalThis.lareInventoryQA) {
      globalThis.lareInventoryQA[inventory.has(building) ? 'reused' : 'built']++;
    }`), `
globalThis.lareQA = {
  loadWitness() {
    const baseline = createProject({ seed: 'lare-linear-2', morphology: 'linear', size: 'small', irregularProperties: true });
    applyProjectDocument(createProjectDocument(baseline, defaultWorkspace(baseline)));
  },
  selectWitness() {
    const s = roadWorkspace.session;
    s.requestSelectionA1({ kind: 'road', id: 'RD-0174' });
    s.requestSelectionA1({ kind: 'road', id: 'RD-0252' }, { toggle: true });
    return s.roadGroupB1?.eligible === true;
  },
  reopen() {
    applyProjectDocument(decodeProjectDocument(encodeProjectDocument(
      createProjectDocument(project,captureWorkspace().workspace))));
  },
  reuseWitness() {
    const project = createProject({ seed: 'lare-linear-2', morphology: 'linear', size:'small', irregularProperties:true });
    globalThis.lareInventoryQA = { reused: 0, built: 0 };
    try {
      const result = prepareRoadGroupReflowB1(project, ['RD-0175','RD-0176'], { x: 4, y: 3 });
      if (!result.candidateProject) throw Error(JSON.stringify(result.unresolved));
      return { ...globalThis.lareInventoryQA, work: result.lare?.operationStats?.work };
    } finally {
      globalThis.lareInventoryQA = null;
    }
  },
  async measure() {
    const fixtures = [
      ['c2-planned','planned',['RD-0113','RD-0114']],
      ['b1-organic','organic',['RD-0116','RD-0123']],
      ['b1-radial','radial',['RD-0100','RD-0152']],
      ['b1-linear','linear',['RD-0122','RD-0123']],
    ];
    const lightweight = [], complete = [], slices = [], kernels = [], apply = [], chargedWork = [], inventory = [];
    for (const [seed,morphology,selectedRoadIds] of fixtures) {
      const fixture = createProject({ seed, morphology, size:'small', irregularProperties:true });
      let tick = 'start';
      const probe = new RoadPreviewSession({ getProject: () => fixture, changed: () => {} });
      probe.start();
      probe.requestSelectionA1({ kind: 'road', id:selectedRoadIds[0] });
      probe.requestSelectionA1({ kind: 'road', id:selectedRoadIds[1] }, {toggle:true});
      for (const x of [.05, .075, .1, .15, .2]) {
        const offset = { x, y: 0 };
        let start = performance.now();
        probe.updateRoadIntent(offset, { dragging:true });
        lightweight.push(performance.now()-start);
        tick = 'start';
        globalThis.lareInventoryQA = { reused: 0, built: 0 };
        const iterator = iterateRoadGroupReflowB1(fixture, selectedRoadIds, offset);
        start = performance.now();
        let step;
        do {
          const sliceStart = performance.now();
          let count = 0;
          do {
            const stepStart = performance.now();
            step = iterator.next();
            const duration = performance.now() - stepStart;
            if (kernels.length < 4 || duration > kernels.at(-1).ms) {
              kernels.push({ ms: duration, previousStage: tick });
              kernels.sort((a,b) => b.ms - a.ms);
              if (kernels.length > 4) kernels.pop();
            }
            tick = step.value?.stage ?? 'complete';
          } while (!step.done && ++count < 256 && performance.now()-sliceStart < LARE_SLICE_WINDOW_MS);
          slices.push(performance.now()-sliceStart);
          if (!step.done) await new Promise(resolve => scheduleLareSlice(resolve));
        } while (!step.done);
        complete.push(performance.now()-start);
        inventory.push(globalThis.lareInventoryQA);
        globalThis.lareInventoryQA = null;
        if (step.value.candidateProject) {
          const applyStart = performance.now();
          const receipt = validateRoadGroupApplyB1(fixture, defaultWorkspace(fixture), {selectedRoadIds,offset}, step.value);
          if (!receipt.ok) throw Error(JSON.stringify(receipt.issues));
          apply.push(performance.now()-applyStart);
        }
        chargedWork.push(step.value.lare?.operationStats?.work ?? 0);
      }
    }
    return { lightweight, complete, slices, apply, chargedWork, inventory,
      largestSteps: kernels };
  }
};`, { legacy: false });

const target = await mkdtemp(join(tmpdir(), 'mappo-lare-browser-'));
const file = join(target, 'mappo.html');
await writeFile(file, observed);
const engines = { chromium, firefox };
const p = (samples, q) => samples.slice().sort((a, b) => a - b)[Math.ceil(samples.length * q) - 1];
const summary = samples => ({ count: samples.length, median: p(samples,.5), p95: p(samples,.95), max: Math.max(...samples) });

function sampleBrowserRss() {
  if (process.platform !== 'linux') return null;
  const processes = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8' })
    .trim().split('\n').map(line => {
      const [id, parent, rss, command] = line.trim().split(/\s+/);
      return { id: Number(id), parent: Number(parent), rss: Number(rss), command };
    });
  const descendantsRss = pid => processes.filter(item => item.parent === pid && item.command !== 'ps')
    .reduce((rss, child) => rss + child.rss + descendantsRss(child.id), 0);
  return descendantsRss(process.pid);
}

async function exercise(name, engine) {
  const browser = await engine.launch({headless:true});
  try {
    const version = browser.version();
    const page = await browser.newPage({viewport:{width:1440,height:900},offline:true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(file).href + '?seed=lare-ui&size=small');
    await page.waitForFunction(() => __buildingQA.state().files.ready);
    const bench = async cancellationMs => {
      const beforeRssKiB = sampleBrowserRss();
      const results = await page.evaluate(() => lareQA.measure());
      const afterRssKiB = sampleBrowserRss();
      const reuseWitness = await page.evaluate(() => lareQA.reuseWitness());
      assert.ok(reuseWitness.built > 0 && reuseWitness.reused > 0);
      console.log('LARE_BROWSER '+JSON.stringify({browser:name,version,
        lightweight:summary(results.lightweight), complete:summary(results.complete),
        slices:summary(results.slices), apply:summary(results.apply), chargedWork:results.chargedWork,
        inventory:results.inventory, reuseWitness, cancellationMs, beforeRssKiB, afterRssKiB,
        largestSteps:results.largestSteps}));
    };
    if (process.env.MAPPO_BENCH_ONLY) {
      await bench();
      return;
    }
    await page.evaluate(() => lareQA.loadWitness());
    await page.getByRole('tab', {name:'Roads', exact:true}).click();
    await page.waitForFunction(() => __buildingQA.state().roadWorkspace.active);
    assert.equal(await page.evaluate(() => lareQA.selectWitness()), true);
    const button = id => page.locator('#' + id);
    const state = () => page.evaluate(() => JSON.stringify(__buildingQA.state().project));
    const before = await state();
    const offsets = async (x,y) => {
      await button('roadMenuEdit').click();
      await button('roadIntentDxC1').fill(String(x));
      await button('roadIntentDyC1').fill(String(y));
    };
    const explore = button('roadExploreDemolitionB1R'), authority = button('roadAuthorizeDemolitionB1R');
    const apply = button('roadApplyB4');
    await offsets(4, 3);
    await explore.waitFor({state:'visible',timeout:30000});
    assert.equal(await explore.isEnabled(), true, JSON.stringify(await page.evaluate(() => {
      const { roadWorkspace, files } = __buildingQA.state(), s = roadWorkspace.session;
      return { revision: files.revision, base: roadWorkspace.baseRevision, checking:s.checking,
        draftRevision:s.revision, settled:s.settledRevision, pending:s.pending, drag:Boolean(s.drag),
        fingerprintMatch:s.acceptedFingerprint === JSON.stringify(s.project),
        status:document.getElementById('roadReportStatus').textContent };
    })));
    await explore.click();
    const stop = button('roadCancelDemolitionB1R');
    await stop.evaluate(element => element.addEventListener('click', () => {
      const start = performance.now();
      requestAnimationFrame(() => { globalThis.lareCancelElapsed = performance.now() - start; });
    }, { once: true, capture: true }));
    await stop.click();
    await button('roadDemolitionB1R').waitFor({state:'hidden'});
    await page.waitForFunction(() => Number.isFinite(globalThis.lareCancelElapsed));
    const cancellationMs = await page.evaluate(() => globalThis.lareCancelElapsed);
    assert.ok(Number.isFinite(cancellationMs));
    assert.equal(await state(),before);
    await offsets(3.5,3);
    await offsets(4,3);
    await explore.waitFor({state:'visible',timeout:30000});
    await explore.click();
    await authority.waitFor({state:'visible',timeout:30000});
    const roadStatus = page.locator('#roadPreviewPanel [role="status"]');
    assert.equal(await roadStatus.count(), 1);
    assert.match(await roadStatus.innerText(), /Review the removal set before authorizing Apply/);
    assert.match(await button('roadDemolitionRemovalsB1R').textContent(), /BLD-00153/);
    assert.match(await button('roadDemolitionRelocationsB1R').textContent(), /Relocate \(\d+\)/);
    assert.equal(await apply.isDisabled(),true);
    await authority.click();
    assert.equal(await apply.isEnabled(),true);
    await offsets(3.5,3);
    assert.equal(await page.evaluate(()=>Boolean(__buildingQA.state().roadWorkspace.session.demolition?.authorization)),false);
    await offsets(4,3);
    await explore.waitFor({state:'visible',timeout:30000});
    await explore.click();
    await authority.waitFor({state:'visible',timeout:30000});
    await authority.click();
    assert.equal(await apply.textContent(),'Apply and demolish');
    await apply.click();
    await page.waitForFunction(()=>!__buildingQA.state().roadWorkspace.active);
    const after = await state();
    const afterIds = new Set(JSON.parse(after).city.buildings.map(building=>building.id));
    const removed = JSON.parse(before).city.buildings.filter(building=>!afterIds.has(building.id)).map(building=>building.id);
    assert.deepEqual(removed,['BLD-00153']);
    for (const [chord,expected] of [['Control+z',before],['Control+y',after]]) {
      await button('mapCanvas').focus();
      await page.keyboard.press(chord);
      assert.equal(await state(),expected);
    }
    await page.evaluate(() => lareQA.reopen());
    assert.equal(await state(),after);
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' offline demolition review, cancellation, stale intent, Apply, Undo/Redo and reopen');
    if (!process.env.MAPPO_QA_ONLY) await bench(cancellationMs);
  } finally {
    await browser.close();
  }
}

try {
  for (const [name, engine] of Object.entries(engines)) {
    if (!process.env.MAPPO_QA_ENGINE || process.env.MAPPO_QA_ENGINE === name)
      await exercise(name, engine);
  }
} finally {
  await rm(target,{recursive:true,force:true});
}
