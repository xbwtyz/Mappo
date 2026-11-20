// Offline acceptance for junction preview and Apply in the inline Blob Worker.
// This deliberately does NOT use the HTTP route used by the browser QA suite.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const file = new URL('../artifacts/c7/offline-p3.html',import.meta.url);
await mkdir(new URL('../artifacts/c7/',import.meta.url),{recursive:true});
await writeFile(file,observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8')));
const url = file.href;
const project = createProject({size:'small',seed:'c2-organic',morphology:'organic'});
const doc = {project,workspace:defaultWorkspace(project)};
for (const [browserName,engine] of [['chromium',chromium],['firefox',firefox]]) {
  const browser=await engine.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.setDefaultTimeout(120000);
    const errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      if(/^https?:/i.test(request.url()))external.push(request.url());
    });
    await page.route('**/*',route=>/^https?:/i.test(route.request().url())?
      route.abort():route.continue());
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    await page.evaluate(doc=>__buildingQA.apply(doc),doc);
    await page.locator('#roadModeButton').scrollIntoViewIfNeeded();
    await page.locator('#roadModeButton').click();
    const before=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      if(typeof s.computeJunctionAsync!=='function' ||
          typeof s.computeJunctionAsync.cancel!=='function')
        throw Error('Offline HTML did not activate its Blob Web Worker.');
      s.select({kind:'junction',id:'N-0139'});
      const node=app.project.city.nodes.find(n=>n.id==='N-0139');
      if(!node)throw Error('Organic fixture junction N-0139 was not generated.');
      const snapshot={accepted:JSON.stringify(app.project),revision:app.files.revision};
      s.update({x:node.x,y:node.y+15},{defer:false});
      return snapshot;
    });
    await page.waitForFunction(()=>{
      const s=__buildingQA.state().roadWorkspace.session;
      return !s.checking && s.settledRevision===s.revision;
    },null,{timeout:120000});
    const after=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      return {candidate:!!s.reconciliation?.candidateProject,
        validation:s.reconciliation?.validation?.project,
        report:s.report?.status,
        apply:!document.querySelector('#roadApplyB4').disabled,
        accepted:JSON.stringify(app.project),revision:app.files.revision,
        error:s.error,reconciliationError:s.reconciliationError};
    });
    assert.equal(after.candidate,true,browserName+': offline preview candidate');
    assert.equal(after.validation,'valid');
    assert.equal(after.apply,true,browserName+': offline preview must become Apply-ready');
    assert.equal(after.error,'');
    assert.equal(after.reconciliationError,'');
    assert.equal(after.accepted,before.accepted,'preview never changes accepted project');
    assert.equal(after.revision,before.revision,'preview never persists changes');
    const cancelled = await page.evaluate(async () => {
      const app = __buildingQA.state(), s = app.roadWorkspace.session;
      const button = document.querySelector('#roadApplyB4');
      const done = app.roadHistory.past.length;
      button.click();
      const validating = button.disabled && /Validating/.test(document.querySelector('#roadApplyStatusB4').textContent);
      s.reset();
      await new Promise(resolve => requestAnimationFrame(resolve));
      return {
        validating, disabled: button.disabled, revision: app.files.revision,
        accepted: JSON.stringify(__buildingQA.state().project), historyUnchanged: app.roadHistory.past.length === done,
      };
    });
    assert.equal(cancelled.validating,true,'Apply immediately reports validation and disables repeat clicks');
    assert.equal(cancelled.disabled,true,'reset cancels validation and disables Apply');
    assert.equal(cancelled.revision,before.revision);
    assert.equal(cancelled.accepted,before.accepted);
    assert.equal(cancelled.historyUnchanged,true);

    await page.evaluate(() => {
      const s = __buildingQA.state().roadWorkspace.session;
      const node = s.city.nodes.find(n=>n.id==='N-0139');
      s.update({x:node.x,y:node.y+15},{defer:false});
    });
    await page.waitForFunction(() => !document.querySelector('#roadApplyB4').disabled);
    await page.locator('#roadApplyB4').click();
    await page.waitForFunction(() => !__buildingQA.state().roadWorkspace.active);
    const applied = await page.evaluate(() => {
      const app = __buildingQA.state();
      return { revision: app.files.revision, moved: app.project.city.nodes.find(n=>n.id==='N-0139').y,
        history: app.roadHistory.past.length };
    });
    assert.equal(applied.revision,before.revision+1);
    assert.equal(applied.moved,project.city.nodes.find(n=>n.id==='N-0139').y+15);
    assert.equal(applied.history,1);
    assert.deepEqual(external,[],browserName+': offline HTML attempted a network request');
    assert.deepEqual(errors,[],browserName+': offline JavaScript page errors');
    console.log('C7_OFFLINE '+JSON.stringify({browser:browserName,passed:true,
      preview:true,apply:true,resetDuringApply:true,networkRequests:external.length}));
    await page.close();
  } finally { await browser.close(); }
}
