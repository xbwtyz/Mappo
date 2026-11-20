// Browser-only C7 performance and safety evidence, not a physical-device substitute.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const observePreviewDraws = `
const measurePreviewDraw = (name, draw) => (...args) => {
  const row = window.__c7;
  if (!row || row.done) return draw(...args);
  const started = performance.now();
  try { return draw(...args); }
  finally { row.draws.push({name, startMs: started-row.started, durationMs: performance.now()-started}); }
};
renderMap = measurePreviewDraw('map', renderMap);
drawRoadInspectionOverlay = measurePreviewDraw('road-overlay', drawRoadInspectionOverlay);
`;
const traceWorkerPhases = process.env.C7_TRACE_WORKER_PHASES === '1';
function observeWorkerPhases(html) {
  const marker = /^(const ROAD_JUNCTION_WORKER_SOURCE_P1 = )(.+);$/m;
  if (!marker.test(html)) throw Error('Could not find the bundled junction worker for phase tracing');
  return html.replace(marker, (_, prefix, encoded) => {
    const source = JSON.parse(encoded);
    const end = '\n})();';
    if (!source.endsWith(end)) throw Error('Unexpected bundled junction worker closure');
    const phaseNames = ['validateStoredProject','analyzeRoadImpact','prepareJunctionIntentC7',
      'prepareNeighborhoodReflow','prepareRoadTopologyReflowC3','extractRoadFaces'];
    const observation = `
let c7WorkerTrace;
const measureC7WorkerPhase = (name, fn) => (...args) => {
  if (!c7WorkerTrace) return fn(...args);
  const started = performance.timeOrigin + performance.now();
  try { return fn(...args); }
  finally { c7WorkerTrace.push({name, started, ended: performance.timeOrigin + performance.now()}); }
};
${phaseNames.map(name => `${name} = measureC7WorkerPhase('${name}', ${name});`).join('\n')}
const calculateUnmeasuredJunction = calculateJunctionPreviewP1;
calculateJunctionPreviewP1 = (...args) => {
  c7WorkerTrace = [];
  try {
    const result = calculateUnmeasuredJunction(...args);
    result.timings.phases = c7WorkerTrace;
    return result;
  } finally { c7WorkerTrace = null; }
};
`;
    const observed = JSON.stringify(source.slice(0, -end.length) + observation + end);
    return prefix + observed.replaceAll('</script', '<\\/script') + ';';
  });
}
const standalone = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const html = observeBuildingApp(traceWorkerPhases ? observeWorkerPhases(standalone) : standalone, observePreviewDraws);
const cases = [
  ['small','N-0139','y',15],
  ['large','N-0145','x',8],
  ['large','N-0239','x',8],
  ['large','N-0332','x',8],
];
const results=[], errors=[];
const round = n => Math.round(n*10)/10;
const median = a => {a=[...a].sort((x,y)=>x-y);return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;};
async function measureInputWhileChecking(page) {
  let complete = false;
  const samples = [];
  const settled = page.waitForFunction(() => window.__c7?.done, null, {timeout:120000})
    .finally(() => { complete = true; });
  const probe = async () => {
    while (!complete) {
      const start = performance.now();
      await page.keyboard.press('Shift');
      samples.push(round(performance.now()-start));
      if (!complete) await delay(70);
    }
  };
  await Promise.all([settled, probe()]);
  return samples;
}
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try {
    for(const viewport of [{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}]){
      const page=await browser.newPage({viewport,hasTouch:name==='chromium'});
      page.setDefaultTimeout(120000);
      page.on('pageerror',e=>errors.push(name+'/'+viewport.name+': '+e.message));
      try {
        await page.route('**/*',r=>r.request().url()==='http://mappo.test/index.html'?
          r.fulfill({contentType:'text/html',body:html}):r.abort());
        await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>__buildingQA.state().files.ready);
        await page.evaluate(() => {
          window.addEventListener('keydown', event => {
            const row = window.__c7;
            if (!row || row.done || event.key !== 'Shift' || !event.isTrusted) return;
            const now = performance.now();
            row.keys.push({
              atMs: now-row.started,
              eventToHandlerMs: Math.max(0, now-event.timeStamp),
              checking: __buildingQA.state().roadWorkspace.session.checking,
            });
          }, {capture:true});
        });
        const projects=new Map();
        for(const [size,id,axis,delta] of cases){
          if(!projects.has(size))projects.set(size,createProject({size,seed:'c2-organic',morphology:'organic'}));
          const project=projects.get(size);
          for(const pass of ['cold','warm']){
            const doc={project,workspace:defaultWorkspace(project)};
            await page.evaluate(doc=>{
              __buildingQA.apply(doc);
            },doc);
            await page.locator('#roadModeButton').scrollIntoViewIfNeeded();
            await page.locator('#roadModeButton').click();
            assert.equal(await page.evaluate(() =>
              typeof __buildingQA.state().roadWorkspace.session.computeJunctionAsync === 'function'),
              true, 'P1 offline build must activate the background junction worker');
            const before=await page.evaluate(args=>{
              const app=__buildingQA.state(),s=app.roadWorkspace.session;
              s.select({kind:'junction',id:args.id});
              const point={...s.point},original=JSON.stringify(app.project),revision=app.files.revision;
              const row={started:performance.now(),analyzeMs:0,reconcileMs:0,renderMs:0,
                frameGapMs:0,timerGapMs:0,frameGaps:[],draws:[],keys:[],done:false};
              window.__c7=row;
              let prev=performance.now();
              const frame=now=>{
                if(row.done)return;
                const gap=now-prev;
                row.frameGapMs=Math.max(row.frameGapMs,gap);
                if(gap>50)row.frameGaps.push({startMs:prev-row.started,endMs:now-row.started});
                prev=now;
                requestAnimationFrame(frame);
              };
              requestAnimationFrame(frame);
              let lastTick=performance.now();
              const timer=setInterval(()=>{
                const now=performance.now();
                row.timerGapMs=Math.max(row.timerGapMs,now-lastTick);
                lastTick=now;
              },16);
              const compute=s.computeJunctionAsync;
              const measured=async (...args)=>{
                const started=performance.now();
                row.dispatchAtMs=started-row.started;
                const pending=compute(...args);
                row.dispatchMs=performance.now()-started;
                const result=await pending;
                if (result.timings?.sentAt) {
                  const received=performance.now();
                  row.replyAtMs=received-row.started;
                  row.workerSentAtMs=result.timings.sentAt-performance.timeOrigin-row.started;
                  row.workerComputeMs=result.timings.totalMs;
                  row.workerPhases=result.timings.phases?.map(({name,started,ended})=>({
                    name,startMs:started-performance.timeOrigin-row.started,
                    endMs:ended-performance.timeOrigin-row.started,
                  }));
                  row.deliveryMs=Math.max(0,row.replyAtMs-row.workerSentAtMs);
                  row.candidateChars=result.reconciliation?.candidateJson?.length??0;
                }
                row.analyzeMs=result.timings?.analyzeMs??0;
                row.reconcileMs=result.timings?.reconcileMs??0;
                return result;
              };
              measured.cancel=()=>compute.cancel?.();
              measured.suspend=()=>compute.suspend?.();
              s.computeJunctionAsync=measured;
              const changed=s.changed;
              s.changed=(...p)=>{
                const t=performance.now();changed(...p);
                if(row.previewMs===undefined && !s.checking && s.pending){
                  row.renderMs=performance.now()-t;
                  row.previewMs=performance.now()-row.started;
                  row.ready=!document.querySelector('#roadApplyB4').disabled;
                  // Let the app's queued canvas draw run before ending the sample.
                  requestAnimationFrame(() => {
                    row.drawCompleteAtMs=performance.now()-row.started;
                    row.timerGapMs=Math.max(row.timerGapMs,performance.now()-lastTick);
                    clearInterval(timer);
                    row.done=true;
                    s.changed=changed;
                    s.computeJunctionAsync=compute;
                  });
                }
              };
              return {original,revision,point};
            },{id,axis,delta});
            await page.locator(axis==='x'?'#roadProposedX':'#roadProposedY').fill(String(before.point[axis]+delta));
            const keyCommandMs=await measureInputWhileChecking(page);
            const result=await page.evaluate(()=>({...window.__c7}));
            if(!result.ready){
              const detail=await page.evaluate(()=>{
                const app=__buildingQA.state(),s=app.roadWorkspace.session;
                return {selection:s.selection,point:s.point,pending:s.pending,checking:s.checking,
                  reconciled:s.reconciliation?.status,candidate:s.hasApplyCandidate,
                  unresolved:s.reconciliation?.unresolved?.slice(0,3),
                  validation:s.reconciliation?.validation,previewVerified:s.previewGeometry?.verified,
                  error:s.error,reconciliationError:s.reconciliationError,
                  baseRevision:app.roadWorkspace.baseRevision,fileRevision:app.files.revision,
                  settled:s.settledRevision,current:s.revision,
                  fingerprintMatches:s.acceptedFingerprint===JSON.stringify(s.project),
                  applyStatus:document.querySelector('#roadApplyStatusB4').textContent};
              });
              throw Error(name+'/'+viewport.name+'/'+size+'/'+id+' Apply not ready: '+JSON.stringify(detail));
            }
            assert.ok(result.candidateChars > 0 && Number.isFinite(result.dispatchMs) && Number.isFinite(result.deliveryMs),
              'preview must report exact candidate transport and worker timings');
            assert.ok(Number.isFinite(result.drawCompleteAtMs) && result.draws.some(draw=>draw.name==='map'),
              'preview must report the queued canvas draw');
            if(size==='large') assert.ok(result.keys.some(key=>key.checking), 'large preview must receive trusted input');
            if(traceWorkerPhases) assert.ok(result.workerPhases?.some(phase=>phase.name==='validateStoredProject'),
              'worker phase trace must include project validation');
            assert.equal(await page.evaluate(b=>JSON.stringify(__buildingQA.state().project)===b.original,before),true,before);
            assert.equal(await page.evaluate(b=>__buildingQA.state().files.revision===b.revision,before),true,before);
            const steadyRenderMs=await page.evaluate(()=>{
              const session=__buildingQA.state().roadWorkspace.session,elapsed=[];
              for(let i=0;i<3;i++){
                const t=performance.now();session.changed();elapsed.push(performance.now()-t);
              }
              return elapsed;
            });
            let apply = null;
            if(pass==='warm'){
              apply=await page.evaluate(b=>new Promise((resolve,reject)=>{
                requestAnimationFrame(() => {
                  const started=performance.now();
                  let last=started, frameGapMs=0;
                  const button=document.querySelector('#roadApplyB4');
                  button.click();
                  const clickMs=performance.now()-started;
                  const frame=()=>{
                    const now=performance.now(), app=__buildingQA.state();
                    frameGapMs=Math.max(frameGapMs,now-last);
                    if(!app.roadWorkspace.active){
                      if(app.files.revision!==b.revision+1)reject(Error('Apply not atomic'));
                      else resolve({elapsedMs:roundInPage(now-started),clickMs:roundInPage(clickMs),frameGapMs:roundInPage(frameGapMs)});
                      return;
                    }
                    if(!button.disabled || now-started>35000){
                      reject(Error('Apply did not complete: '+document.querySelector('#roadApplyStatusB4').textContent));
                      return;
                    }
                    last=now;
                    requestAnimationFrame(frame);
                  };
                  requestAnimationFrame(frame);
                });
                function roundInPage(value){return Math.round(value*10)/10;}
              }),before);
              await page.evaluate(b=>{
                if(!__buildingQA.moveRoadHistory('undo'))throw Error('Undo failed');
                if(JSON.stringify(__buildingQA.state().project)!==b.original)throw Error('Undo mismatch');
                if(!__buildingQA.moveRoadHistory('redo'))throw Error('Redo failed');
              },before);
            }else{
              await page.evaluate(()=>{
                const s=__buildingQA.state().roadWorkspace.session;
                s.update({x:100000,y:100000},{defer:false});
              });
              assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
              await page.evaluate(({id,axis,delta})=>{
                const s=__buildingQA.state().roadWorkspace.session;
                const node=s.city.nodes.find(n=>n.id===id);
                for(const v of [1,2,3,delta]){
                  const p={x:node.x,y:node.y};p[axis]+=v;
                  s.update(p,{defer:true});
                }
              },{id,axis,delta});
              await page.waitForFunction(()=>{const s=__buildingQA.state().roadWorkspace.session;
                return !s.checking && s.settledRevision===s.revision;},null,{timeout:120000});
              assert.equal(await page.evaluate(b=>JSON.stringify(__buildingQA.state().project)===b.original,before),true,before);
            }
            results.push({browser:name,version:browser.version(),viewport:viewport.name,size,
              nodeCount:project.city.nodes.length,propertyCount:project.city.properties.length,
              id,pass,previewMs:round(result.previewMs),analyzeMs:round(result.analyzeMs),
              reconcileMs:round(result.reconcileMs),renderMs:round(result.renderMs),
              dispatchMs:round(result.dispatchMs),deliveryMs:round(result.deliveryMs),
              workerComputeMs:round(result.workerComputeMs),
              candidateChars:result.candidateChars,
              frameGapMs:round(result.frameGapMs),timerGapMs:round(result.timerGapMs),
              keyCommandMs,keys:result.keys,frameGaps:result.frameGaps,draws:result.draws,workerPhases:result.workerPhases,
              timeline:{dispatchAtMs:result.dispatchAtMs,workerSentAtMs:result.workerSentAtMs,
                replyAtMs:result.replyAtMs,readyAtMs:result.previewMs,drawCompleteAtMs:result.drawCompleteAtMs},
              steadyRenderMs:round(median(steadyRenderMs)),
              applyMs:apply?.elapsedMs??null,applyClickMs:apply?.clickMs??null,applyFrameGapMs:apply?.frameGapMs??null});
          }
        }
      }catch(e){errors.push(name+'/'+viewport.name+': '+e.stack);}
      finally{await page.close();}
    }
  }finally{await browser.close();}
}
const summary=[];
for(const group of [...new Set(results.map(r=>[r.browser,r.viewport,r.size].join('/')))]){
  const rows=results.filter(r=>[r.browser,r.viewport,r.size].join('/')===group);
  const sorted=rows.map(r=>r.previewMs).sort((a,b)=>a-b);
  const applies=rows.filter(row=>row.applyMs!==null);
  const checkingKeys=rows.flatMap(row=>row.keys.filter(key=>key.checking));
  summary.push({group,n:rows.length,medianMs:round(median(sorted)),
    p95Ms:round(sorted[Math.ceil(.95*sorted.length)-1]),
    maxFrameGapMs:round(Math.max(...rows.map(r=>r.frameGapMs))),
    maxTimerGapMs:round(Math.max(...rows.map(r=>r.timerGapMs))),
    trustedKeysWhileChecking:checkingKeys.length,
    maxKeyEventToHandlerMs:checkingKeys.length ? round(Math.max(...checkingKeys.map(key=>key.eventToHandlerMs))) : null,
    maxKeyCommandMs:round(Math.max(...rows.flatMap(r=>r.keyCommandMs))),
    medianApplyMs:round(median(applies.map(r=>r.applyMs))),
    maxApplyClickMs:round(Math.max(...applies.map(r=>r.applyClickMs))),
    maxApplyFrameGapMs:round(Math.max(...applies.map(r=>r.applyFrameGapMs))),
    medianDispatchMs:round(median(rows.map(r=>r.dispatchMs))),
    maxDeliveryMs:round(Math.max(...rows.map(r=>r.deliveryMs))),
    medianSteadyRenderMs:round(median(rows.map(r=>r.steadyRenderMs)))});
}
const report={runner:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,
  memoryGiB:round(os.totalmem()/2**30),platform:process.platform,node:process.version},
  summary,results,errors};
await mkdir(new URL('../artifacts/c7/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/c7/performance.json',import.meta.url),JSON.stringify(report,null,2));
console.log('C7_BROWSER_PERFORMANCE '+JSON.stringify({runner:report.runner,summary,errors}));
if(errors.length)throw Error('C7 performance/safety harness failed: '+errors.join(' | '));
