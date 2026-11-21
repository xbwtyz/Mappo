// Compare two unmodified C7 browser performance reports produced sequentially
// on the same GitHub Actions runner. No synthetic measurements or scaling.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';

const [beforePath,afterPath]=process.argv.slice(2);
if(!beforePath||!afterPath)throw Error('Usage: node scripts/d4-compare-performance.mjs baseline.json candidate.json');
const [baseline,candidate]=await Promise.all([beforePath,afterPath].map(async path=>
  JSON.parse(await readFile(path,'utf8'))));
assert.equal(baseline.errors.length,0,'Baseline benchmark must be clean');
assert.equal(candidate.errors.length,0,'Candidate benchmark must be clean');
const before=new Map(baseline.summary.map(row=>[row.group,row]));
const after=new Map(candidate.summary.map(row=>[row.group,row]));
const desktopGroups = ['chromium', 'firefox'].flatMap(browser =>
  ['small', 'large'].map(size => [browser, 'desktop', size].join('/')));
for (const group of desktopGroups) assert.ok(before.has(group), 'Missing baseline group: ' + group);
assert.ok([4, 8].includes(before.size), 'Expected desktop groups or the historical desktop/phone matrix');
if (before.size === 8) {
  for (const group of desktopGroups)
    assert.ok(before.has(group.replace('/desktop/', '/phone/')), 'Missing historical phone group: ' + group);
}
assert.equal(after.size,before.size,'Candidate must cover the identical fixtures');
assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort());
const pct=(a,b)=>a&&Number.isFinite(a)&&Number.isFinite(b)?
  Math.round(1000*(b-a)/a)/10:null;
const fixed=v=>v==null?'—':String(v);
const lines=[
  '# D4 measured performance comparison',
  '',
  '**Method:** unmodified C7 benchmark, executed sequentially against the D3 baseline and D4 candidate on one GitHub Actions runner, using identical seed/size, browser, viewport, worker and test parameters. Both runs include cold and warm scenarios. Synthetic CI evidence, not physical-device timings.',
  '',
  '| Browser / viewport / size | Preview baseline (ms) | Preview D4 (ms) | Change | p95 baseline → D4 (ms) | Worst frame gap baseline → D4 (ms) | Apply baseline → D4 (ms) |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
];
const groups=[];
for(const [group,a] of before){
  const b=after.get(group);
  assert.equal(a.n,b.n,'Fixture count differs in '+group);
  assert.ok(a.n>=2,'Too few preview samples in '+group);
  const difference=pct(a.medianMs,b.medianMs);
  const row={group,n:a.n,previewBaseline:a.medianMs,previewD4:b.medianMs,
    previewPercent:difference,p95Baseline:a.p95Ms,p95D4:b.p95Ms,
    frameGapBaseline:a.maxFrameGapMs,frameGapD4:b.maxFrameGapMs,
    applyBaseline:a.medianApplyMs,applyD4:b.medianApplyMs,
    steadyBaseline:a.medianSteadyRenderMs,steadyD4:b.medianSteadyRenderMs,
    keyBaseline:a.maxKeyEventToHandlerMs,keyD4:b.maxKeyEventToHandlerMs,
    maxKeyCommandBaseline:a.maxKeyCommandMs,maxKeyCommandD4:b.maxKeyCommandMs};
  groups.push(row);
  lines.push('| '+group+' | '+a.medianMs+' | '+b.medianMs+' | '+
    (difference===null?'—':difference>0?('+'+difference+'%'):(difference+'%'))+' | '+
    a.p95Ms+' → '+b.p95Ms+' | '+a.maxFrameGapMs+' → '+b.maxFrameGapMs+
    ' | '+fixed(a.medianApplyMs)+' → '+fixed(b.medianApplyMs)+' |');
}
const review=groups.filter(x=>
  (x.previewPercent>20&&x.previewD4-x.previewBaseline>100) ||
  (x.applyBaseline&&x.applyD4>x.applyBaseline*1.2&&x.applyD4-x.applyBaseline>100));
lines.push('','## Input and steady redraw',
  '',
  '| Group | Worst trusted-key event handling baseline → D4 (ms) | Worst key command baseline → D4 (ms) | Median steady redraw baseline → D4 (ms) |',
  '| --- | ---: | ---: | ---: |');
for(const row of groups)lines.push('| '+row.group+' | '+fixed(row.keyBaseline)+' → '+fixed(row.keyD4)+
  ' | '+row.maxKeyCommandBaseline+' → '+row.maxKeyCommandD4+
  ' | '+row.steadyBaseline+' → '+row.steadyD4+' |');
lines.push('',
  '**Runner (baseline):** '+JSON.stringify(baseline.runner),
  '',
  '**Runner (D4):** '+JSON.stringify(candidate.runner),
  '',
  '**Preview / Apply >20% and >100 ms review flags:** '+(review.length?review.map(x=>x.group).join(', '):'none'),
  '',
  '**Interpretation:** Each group has few samples; single-run changes and especially maximum frame/key gaps can fluctuate with runner load. Compare direction and magnitude; do not claim a statistically significant speedup. Existing city-stall follow-up remains issue #44.',
  '');
await mkdir(new URL('../artifacts/d4/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/d4/performance-comparison.md',import.meta.url),lines.join('\n'));
console.log('D4_PERFORMANCE_COMPARISON '+JSON.stringify({runner:os.cpus()[0]?.model,groups,review:review.map(x=>x.group)}));
console.log('D4 performance report: artifacts/d4/performance-comparison.md');
