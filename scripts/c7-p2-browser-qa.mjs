// Focused P2 browser integration: actual Blob Workers, canceled expensive
// jobs and latest-draft UI gates in Chromium and Firefox, not synthetic workers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const project=createProject({size:'large',morphology:'organic',seed:'c2-organic'});
const doc={project,workspace:defaultWorkspace(project)};
for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(120000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.route('**/*',route=>route.request().url()==='http://mappo.test/index.html'
      ? route.fulfill({contentType:'text/html',body:html}):route.abort());
    await page.goto('http://mappo.test/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA.state().files.ready);
    await page.evaluate(doc=>__buildingQA.apply(doc),doc);
    await page.locator('#roadModeButton').scrollIntoViewIfNeeded();
    await page.locator('#roadModeButton').click();

    const before=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      if(typeof s.computeJunctionAsync!=='function' || typeof s.computeJunctionAsync.cancel!=='function')
        throw Error('Offline P2 worker and cancellation API must be active.');
      s.select({kind:'junction',id:'N-0145'});
      const node=app.project.city.nodes.find(row=>row.id==='N-0145');
      if(!node)throw Error('Large Organic fixture junction missing.');
      const snapshot={node,accepted:JSON.stringify(app.project),fileRevision:app.files.revision};
      window.__p2={sent:0,canceled:0};
      const original=s.computeJunctionAsync;
      const measured=input=>{window.__p2.sent++;return original(input);};
      measured.cancel=()=>{const canceled=original.cancel();if(canceled)window.__p2.canceled++;return canceled;};
      measured.suspend=()=>original.suspend();
      s.computeJunctionAsync=measured;
      s.update({x:node.x+8,y:node.y},{defer:false});
      return snapshot;
    });
    await page.waitForFunction(()=>window.__p2?.sent===1);
    await page.evaluate(({node})=>{
      const s=__buildingQA.state().roadWorkspace.session;
      s.update({x:node.x+7,y:node.y},{defer:false});
    },before);
    await page.waitForFunction(()=>window.__p2?.sent>=2);
    await page.evaluate(({node})=>{
      const s=__buildingQA.state().roadWorkspace.session;
      s.update({x:node.x+8,y:node.y},{defer:false});
    },before);
    await page.waitForFunction(()=>window.__p2?.sent>=3);
    assert.ok(await page.evaluate(()=>window.__p2.canceled)>=1,
      name+': superseded active worker must be canceled');
    assert.equal(await page.locator('#roadApplyB4').isDisabled(),true,
      name+': unfinished work must never enable Apply');
    await page.waitForFunction(()=>{
      const s=__buildingQA.state().roadWorkspace.session;
      return !s.checking && s.settledRevision===s.revision;
    },null,{timeout:120000});
    const final=await page.evaluate(()=>{
      const app=__buildingQA.state(),s=app.roadWorkspace.session;
      return {point:s.point,settled:s.settledRevision,revision:s.revision,
        checking:s.checking,canApply:!document.querySelector('#roadApplyB4').disabled,
        accepted:JSON.stringify(app.project),fileRevision:app.files.revision,
        sent:window.__p2.sent,canceled:window.__p2.canceled};
    });
    assert.equal(final.point.x,before.node.x+8);
    assert.equal(final.point.y,before.node.y);
    assert.equal(final.settled,final.revision);
    assert.equal(final.checking,false);
    assert.equal(final.canApply,true,name+': known-safe Large Organic draft must become ready');
    assert.equal(final.accepted,before.accepted,'worker must not modify accepted project');
    assert.equal(final.fileRevision,before.fileRevision,'worker must not write recovery state');

    await page.evaluate(({node})=>{
      const s=__buildingQA.state().roadWorkspace.session;
      s.update({x:node.x+6,y:node.y},{defer:false});
    },before);
    await page.waitForFunction(()=>window.__p2?.sent>=4);
    await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.reset());
    assert.equal(await page.locator('#roadApplyB4').isDisabled(),true);
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.report),null);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before.accepted);
    assert.deepEqual(errors,[],name+': browser page errors');
    console.log('C7_P2_BROWSER '+JSON.stringify({browser:name,passed:true,sent:final.sent,
      canceled:final.canceled,finalRevision:final.revision}));
  }finally{
    await page.close();
    await browser.close();
  }
}
