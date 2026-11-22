import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';
import { createProject } from '../src/core/city-model.js';
import { defaultWorkspace } from '../src/data/project-format.js';
import { observeBuildingApp } from '../tests/helpers/building-app.js';

// Real pointer and button behavior, both browser engines, no runtime network.
// The test seam is injected only in QA and is never part of distributed HTML.
const html=observeBuildingApp(await readFile(new URL('../index.html',import.meta.url),'utf8'));
const project=createProject({seed:'c2-planned',size:'small',morphology:'planned'});
const state={project,workspace:defaultWorkspace(project)};
const origin='http://mappo-junction-qa.test/';
await mkdir(new URL('../artifacts/junction-022/',import.meta.url),{recursive:true});

for (const [name,engine] of [['chromium',chromium],['firefox',firefox]]) {
  const browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.setDefaultTimeout(25000);
  try {
    await page.route('**/*',route=>route.request().url().startsWith(origin)
      ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>__buildingQA?.state().files.ready);
    await page.evaluate(doc=>__buildingQA.apply(doc),state);
    await page.locator('#roadModeButton').click();
    await page.locator('#roadEditControlsD1 > summary').click();
    assert.equal(await page.locator('#roadSnapJunctions').isChecked(),true);
    const before=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
    const pixel=async id=>{
      const coords=await page.evaluate(id=>{
        const app=__buildingQA.state(),node=app.project.city.nodes.find(n=>n.id===id);
        return app.camera.worldToScreen(node);
      },id);
      const box=await page.locator('#mapCanvas').boundingBox();
      return {x:box.x+coords.x,y:box.y+coords.y};
    };
    await page.evaluate(()=>{
      const app=__buildingQA.state(),cam=app.camera;
      const dest=app.project.city.nodes.find(n=>n.id==='N-0139');
      cam.zoom=3;
      cam.x=dest.x-cam.width*0.6/cam.zoom;
      cam.y=dest.y+cam.height*0.40/cam.zoom;
      app.roadWorkspace.session.select({kind:'junction',id:'N-0140'});
      __buildingQA.draw();
    });
    const source=await pixel('N-0140'),target=await pixel('N-0139');
    const canvas=await page.locator('#mapCanvas').boundingBox();
    for(const p of [source,target]){
      assert.ok(p.x>=canvas.x && p.x<canvas.x+canvas.width,'Point must be visible in map');
      assert.ok(p.y>=canvas.y && p.y<canvas.y+canvas.height,'Point must be visible in map');
    }
    // Magnetic drag is screen-based (not a world-coordinate heuristic).
    await page.mouse.move(source.x,source.y);
    await page.mouse.down();
    await page.mouse.move(target.x+5,target.y,{steps:3});
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.snapTargetId),'N-0139');
    await page.mouse.up();
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.targetJunctionId),'N-0139');
    await page.locator('#roadPreviewReset').click();
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.targetJunctionId),null);

    await page.mouse.move(source.x,source.y);
    await page.mouse.down();
    await page.keyboard.down('Alt');
    await page.mouse.move(target.x+5,target.y,{steps:2});
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.snapTargetId),null);
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.locator('#roadPreviewReset').click();

    // No extra "merge" commit path: select two map points then normal Review/Apply.
    await page.locator('#roadStartMergeJunctions').click();
    await page.mouse.click(source.x,source.y);
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.mergeSourceId),'N-0140');
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.mergeTargetId),null);
    await page.mouse.click(target.x,target.y);
    assert.equal(await page.evaluate(()=>__buildingQA.state().roadWorkspace.session.mergeTargetId),'N-0139');
    await page.waitForFunction(()=>{
      const s=__buildingQA.state().roadWorkspace.session;
      return s.pending && !s.checking && s.settledRevision===s.revision;
    },null,{timeout:30000});
    assert.equal(await page.locator('#roadApplyB4').isEnabled(),true,
      await page.locator('#roadApplyStatusB4').innerText());
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
    await page.locator('#roadApplyB4').click();
    await page.waitForFunction(()=>__buildingQA.state().project.city.nodes.some(n=>n.id==='N-0140')===false,
      null,{timeout:30000});
    assert.equal(await page.evaluate(()=>__buildingQA.state().project.city.nodes.some(n=>n.id==='N-0139')),true);
    const after=await page.evaluate(()=>JSON.stringify(__buildingQA.state().project));
    assert.notEqual(after,before);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('undo')),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),before);
    assert.equal(await page.evaluate(()=>__buildingQA.moveRoadHistory('redo')),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(__buildingQA.state().project)),after);
    assert.deepEqual(errors,[]);
    console.log('PASS 0.2.2 junction snap and click-to-merge '+name);
  } catch(error) {
    await page.screenshot({path:new URL('../artifacts/junction-022/'+name+'-failure.png',import.meta.url).pathname,
      fullPage:true}).catch(()=>{});
    throw new Error(name+': '+error.message,{cause:error});
  } finally {
    await page.close();
    await browser.close();
  }
}
